---
name: performance-test
description: Build and run load, stress, spike and soak tests for a REST API with k6, from a smoke test to an HTML + Markdown report with thresholds (SLO). Use when someone wants to load-test an API endpoint, find its throughput or latency limits, compare environments, or turn k6 raw output into a report they can hand to a team.
---

# Performance test (REST API, k6)

Produce a real load test and a report, not just a script. Every test runs with a declared target, a declared load shape and a declared threshold; without those three the result is a number nobody can act on.

## Prerequisites — install k6 first

This skill drives the `k6` CLI. Nothing else in the skill works until k6 runs, so verify before promising a test:

```bash
k6 version          # must print a version, e.g. k6 v2.4.0
```

If it is missing, install it and confirm with `k6 version` before continuing. Do not write scenarios against an unverified install.

### Ubuntu / Debian (official Grafana repo)

Needs `sudo`. On a non-interactive session `sudo` may have no TTY for the password prompt — in that case give the user the commands to run themselves instead of guessing.

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://dl.k6.io/key.gpg | sudo tee /etc/apt/keyrings/k6-archive-keyring.gpg >/dev/null
echo "deb [signed-by=/etc/apt/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt update && sudo apt install -y k6
k6 version
```

There is no Homebrew on Ubuntu. Do not suggest `brew install k6` there.

### macOS

```bash
brew install k6
k6 version
```

Homebrew running under Rosetta installs an x86_64 k6, whose load generator is weaker. For serious measurement prefer the native arm64 binary from the k6 releases page.

### No sudo / no package manager

Download the release binary into `~/.local/bin` (native arch, no root):

```bash
# pick the linux_amd64 / linux_arm64 / darwin_* asset matching `uname -s -m`
VER=$(curl -sL https://api.github.com/repos/grafana/k6/releases/latest | grep -oP '"tag_name": "v\K[^"]+')
curl -sL "https://github.com/grafana/k6/releases/download/v${VER}/k6-v${VER}-linux-amd64.tar.gz" | tar xz
mkdir -p ~/.local/bin && mv k6-v${VER}-linux-amd64/k6 ~/.local/bin/
~/.local/bin/k6 version
```

`~/.local/bin` must be on `PATH`.

### Docker with the web dashboard (optional interactive report)

The plain `grafana/k6` image has **no** dashboard. Use the `-with-browser` tag, which
bundles `xk6-dashboard`:

```bash
# pin the tag to your k6 version; 2.4.0-with-browser ships k6 v2.4.0
docker pull grafana/k6:2.4.0-with-browser

docker run --rm --user "$(id -u):$(id -g)" --network host \
  -v "$PWD:/scripts" -w /scripts \
  -e K6_WEB_DASHBOARD=true \
  -e K6_WEB_DASHBOARD_EXPORT=/scripts/perf/reports/report.html \
  -e K6_WEB_DASHBOARD_PERIOD=1s \
  -e K6_WEB_DASHBOARD_OPEN=false \
  grafana/k6:2.4.0-with-browser run perf/scenarios/load.js
```

Things that fail silently and waste an afternoon:

- **The dashboard flag is not in `--help`.** It exists and works; look for it in
  `k6 version` or in the binary, not in the usage text. Do not conclude it is missing.
- **A run shorter than ~5s exports no file.** The dashboard flushes on shutdown;
  very short runs finish before the first write. Use a realistic duration.
- `--user "$(id -u):$(id -g)"` keeps the report owned by you instead of root.
- On a host where Docker Desktop is not running but `dockerd` is, export
  `DOCKER_HOST=unix:///var/run/docker.sock` before the commands above.
- Building `xk6-dashboard` yourself needs Go 1.24+ (1.25+ for the `xk6` builder).
  Do not attempt it on an older toolchain — use the published image instead.

### Verify the install actually generates load

`k6 version` proves the binary runs, not that it can produce traffic. Run the smoke scenario from Step 5 before any load test: if it reports requests, the generator works.

### Portability

The scenarios import only `k6/http`, `k6`, `k6/crypto` and local files — there is no
remote `jslib.k6.io` import. They therefore run on an offline or air-gapped test
host. If you add a helper, keep it local for the same reason.

## Rules that come first

1. **Never load-test production** unless the owner explicitly says so in this conversation, and even then keep it a smoke test. Ask for the staging or test URL. A load test is an action on someone else's running service.
2. **Only test what the user owns or is authorized to test.** If the target is a third-party or government service the user does not run, stop and offer to write the plan instead.
3. **No real credentials in scripts.** Read tokens and test accounts from environment variables (`__ENV.AUTH_TOKEN`), never hardcode them. Do not commit real tokens to the repository.
4. **Climb, do not slam.** Ramp up in stages. A sudden spike against an unmeasured service is how a test becomes an outage.
5. **Report what happened, including the failures.** A threshold that failed is a finding, not something to re-run until it passes.

## Step 1 — Gather the minimum

Ask, and do not guess:

- **Base URL** of the environment (staging preferred) and the **endpoints** to test.
- **Auth**: how to get a token, whether disposable, and the test account.
- **SLO**: p95 latency target, error rate ceiling, expected concurrent users or RPS.
- **Allowed time window** and whether the target's owner is aware.

If the user has no SLO yet, propose one from evidence: measure a smoke test first, then set the threshold at roughly the observed p95 with a little headroom, and say you did that.

## Step 2 — Layout

Create this under the project, not in the skill folder:

```
perf/
  config/
    environments.json      # base URLs, no secrets
  scenarios/
    smoke.js  load.js  stress.js  spike.js  soak.js
  lib/
    http.js                # request helpers, auth, checks
    summary.js             # HTML + JSON report generation
  data/
    users.json             # generated test data, gitignored
  reports/                 # output, gitignored
```

Copy the templates in `templates/` of this skill and adjust the endpoints. Keep the split: scenario files describe *load shape*, `lib/http.js` describes *requests*.

## Step 3 — Test types and when to use each

| Type | VUs / duration | Question it answers |
|---|---|---|
| smoke | 1 VU, 30s | Does the endpoint work at all? Run this before anything else. |
| load | target VUs, 10–15 min | Meets SLO at expected traffic? This is the main test. |
| stress | ramp until it breaks | Where does it fall over, and how does it fail? |
| spike | instant jump, then back | Does it recover? Are there cascading failures? |
| soak | moderate load, 1–4 h | Leaks, memory growth, connection pool exhaustion, token expiry. |

Always in that order. Smoke first is not optional: a load test on a broken endpoint measures the wrong thing.

## Step 4 — Thresholds are the deliverable

Put the SLO straight into the script so k6 itself decides pass or fail:

```js
thresholds: {
  http_req_duration: ['p(95)<500', 'p(99)<1200'],
  http_req_failed:   ['rate<0.01'],
  checks:            ['rate>0.99'],
}
```

Then read the summary line: `✓` or `✗` per threshold. Never report "passed" from the averages — averages hide the tail that users actually feel.

## Step 5 — Run

```bash
# smoke first
k6 run -e BASE_URL=https://staging.example.com -e AUTH_TOKEN="$TOKEN" \
  perf/scenarios/smoke.js

# load, 15 minutes, with a report
k6 run -e BASE_URL=... -e AUTH_TOKEN="$TOKEN" \
  -e PROFILE=load \
  --summary-export perf/reports/load-$(date +%Y%m%d-%H%M)-summary.json \
  perf/scenarios/load.js
```

Watch the live output for `http_req_failed` and `dropped_iterations`. **Dropped iterations mean the load generator, not the server, is the bottleneck** — the result is invalid; scale the generator or lower VUs and say so.

Run the generator from a machine that is not the server under test, and note where it ran in the report.

## Step 6 — Report

`handleSummary` in `lib/summary.js` writes both formats:

- `perf/reports/<run>.html` — self-contained, shareable, opens offline
- `perf/reports/<run>.md` — the summary for chat, PR or ticket

The Markdown report must contain, always:

1. **Target and environment**, generator host, date, duration, load shape.
2. **Verdict** — meets SLO or not, one line, no hedging.
3. **Metrics table** — RPS, p50/p95/p99, error rate, checks pass rate, dropped iterations.
4. **Bottleneck evidence** — where the tail broke, which endpoint, and any log or metric that explains it if available.
5. **What this does not prove** — for example: single endpoint in isolation, no cache warm-up, staging hardware differs from production.
6. **Next step** — one concrete action.

## Reading the result

- **p95 climbing while RPS stays flat** → queueing behind a dependency or a pool limit (DB connections, thread pool).
- **Error rate rises with p99 but p95 is fine** → a subset of requests, often a specific endpoint or a timeout path.
- **Latency flat but RPS capped** → a rate limit or a saturated upstream, not the app.
- **Everything degrades over hours** → leak; rerun the soak with memory sampling.
- **k6 says `dropped_iterations`** → fix the generator before believing any other number.

## Do not

- Do not run against production, however "small".
- Do not raise the load to make numbers look better, or rerun until a threshold passes.
- Do not hide a failed threshold because the test "mostly" worked.
- Do not paste tokens or personal data into a report.