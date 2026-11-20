# cindy-performance-test

A [Cindy](https://github.com/makecindy/cindy) skill for load-testing **REST APIs** with [k6](https://k6.io), from a first smoke test to a report you can hand to a team.

Everything here is a template you copy into your own project. Nothing talks to a service until you point it at one.

## What it gives you

- **Five scenarios** — smoke, load, stress, spike, soak — in the order you should actually run them.
- **Thresholds as SLO** — p95/p99 latency and error-rate ceilings live in the script, so k6 itself decides pass or fail.
- **A report generator** — `handleSummary` writes a self-contained HTML report, a Markdown summary and the raw JSON. No paid service, no extra extension.
- **A procedure** — `SKILL.md` covers what to measure, how to read a result, and the mistakes that make a load test worthless.

## Files

```
SKILL.md                 the procedure: gather target + SLO, run, read, report
scenarios/smoke.js       1 VU, 30s — always first
scenarios/load.js        ramp up, plateau, ramp down — the main test
scenarios/stress.js      staircase until it breaks
scenarios/spike.js       sudden jump, then the recovery window
scenarios/soak.js        moderate load for hours — leaks
lib/http.js              request helpers, auth, checks (edit ENDPOINTS here)
lib/summary.js           HTML + Markdown + JSON report
config/environments.json base URLs per environment, no secrets
```

## Install

Copy the scenarios into your project:

```bash
cp -r scenarios lib config /path/to/your-project/perf/
```

Then edit `perf/lib/http.js` — `ENDPOINTS` should match your API.

## Run

```bash
# 1. smoke first, always
k6 run -e BASE_URL=https://staging.example.com -e AUTH_TOKEN="$TOKEN" \
  perf/scenarios/smoke.js

# 2. load test with your SLO as thresholds
k6 run -e BASE_URL=https://staging.example.com -e AUTH_TOKEN="$TOKEN" \
  -e PROFILE=load perf/scenarios/load.js
```

Reports land in `perf/reports/` as `<profile>-<timestamp>.{html,md,json}`.

Tune load without editing files:

```bash
VUS=50 DURATION=15m k6 run perf/scenarios/load.js
BASE_VUS=5 PEAK_VUS=100 k6 run perf/scenarios/spike.js       # spike
STEP=20 STEPS=5 STEP_DURATION=2m k6 run perf/scenarios/stress.js
VUS=10 DURATION=2h k6 run perf/scenarios/soak.js             # soak
```

## Rules this skill enforces

- **Never load-test production.** Staging first; production only with the owner's explicit go-ahead, and then smoke only.
- **Only test what you own or are authorized to test.**
- **Climb, don't slam.** Ramp in stages; a spike against an unmeasured service is how a test becomes an outage.
- **Dropped iterations invalidate the run.** If k6 reports them, the generator was saturated, not the server — scale the generator and rerun.
- **Report the failures.** A failed threshold is a finding, not something to rerun until it passes.

## Verified

All seven scripts parse under `k6 inspect` and were run end-to-end against a local HTTP server with **k6 v2.4.0** (`linux/amd64`): a passing smoke test, a passing ramped load test, and a deliberately failing run to confirm the report marks failed thresholds correctly.

## License

MIT
