// scenarios/spike.js — does it recover from a sudden jump?
//
// Baseline -> instant jump -> back to baseline -> hold.
// The interesting part is the second baseline: if latency or errors stay high
// after the spike ends, something did not recover (connection pool, queue,
// circuit breaker, autoscaler that never scaled back).

import { sleep } from 'k6';
import { userJourney } from '../lib/http.js';
import { handleSummary, TREND_STATS } from '../lib/summary.js';

export { handleSummary };

const BASE = Number(__ENV.BASE_VUS || 5);
const PEAK = Number(__ENV.PEAK_VUS || 100);

export const options = {
  summaryTrendStats: TREND_STATS,
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: BASE,
      stages: [
        { duration: '2m', target: BASE },
        { duration: '10s', target: PEAK },  // the spike
        { duration: '1m', target: PEAK },
        { duration: '10s', target: BASE },  // sudden drop
        { duration: '3m', target: BASE },   // recovery window — watch this
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<3000'],
  },
};

export default function () {
  userJourney();
  sleep(1);
}