// scenarios/load.js — the main test: does the API meet its SLO at expected traffic?
//
// Load shape: gentle ramp up, steady plateau, ramp down.
// Tune with env vars instead of editing the file:
//   VUS=50 DURATION=15m k6 run scenarios/load.js
//
// Set the thresholds to match the agreed SLO. If there is no SLO yet, run the
// smoke test, take the observed p95, add headroom, and say in the report that
// the threshold was derived that way.

import { sleep } from 'k6';
import { userJourney } from '../lib/http.js';
import { handleSummary, TREND_STATS } from '../lib/summary.js';

export { handleSummary };

const VUS = Number(__ENV.VUS || 20);
const DURATION = __ENV.DURATION || '10m';
const RAMP = __ENV.RAMP || '2m';

export const options = {
  summaryTrendStats: TREND_STATS,
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: RAMP, target: VUS },
        { duration: DURATION, target: VUS },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1200'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  userJourney();
  sleep(Math.random() * 2 + 1); // 1–3s think time, like a real client
}