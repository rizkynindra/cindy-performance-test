// scenarios/smoke.js — run this first, always.
// 1 VU, 30s. It answers one question: does the endpoint work at all?
// A load test on a broken endpoint measures the wrong thing.

import { sleep } from 'k6';
import { userJourney } from '../lib/http.js';
import { handleSummary, TREND_STATS } from '../lib/summary.js';

export { handleSummary };

export const options = {
  summaryTrendStats: TREND_STATS,
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  userJourney();
  sleep(1);
}