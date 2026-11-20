---
name: performance-test
description: Build and run load, stress, spike and soak tests for a REST API with k6, from a smoke test to an HTML + Markdown report with thresholds (SLO). Use when someone wants to load-test an API endpoint, find its throughput or latency limits, compare environments, or turn k6 raw output into a report they can hand to a team.
---

# Performance test (REST API, k6)

Produce a real load test and a report, not just a script. Every test runs with a declared target, a declared load shape and a declared threshold; without those three the result is a number nobody can act on.

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