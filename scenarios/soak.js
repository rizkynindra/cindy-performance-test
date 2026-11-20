// scenarios/soak.js — same moderate load for a long time.
//
// Question: does the service degrade over hours? Leaks, growing memory,
// exhausted connection pools, expired tokens, log or disk fill.
//
// Run this on a monitoring screen. Sample memory on the server during the run
// (RSS of the app process every 5 minutes); a flat p95 with rising RSS is a
// leak that will bite in production even though this test "passes".
//
//   VUS=10 DURATION=2h k6 run scenarios/soak.js

import { sleep } from 'k6';
import { userJourney } from '../lib/http.js';
import { handleSummary, TREND_STATS } from '../lib/summary.js';

export { handleSummary };

const VUS = Number(__ENV.VUS || 10);
const DURATION = __ENV.DURATION || '1h';

export const options = {
  summaryTrendStats: TREND_STATS,
  scenarios: {
    soak: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
      gracefulStop: '1m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800', 'p(99)<2000'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  userJourney();
  sleep(2);
}