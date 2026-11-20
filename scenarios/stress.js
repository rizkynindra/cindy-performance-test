// scenarios/stress.js — find the breaking point.
//
// Staircase of increasing VUs, no plateau. There is no pass/fail threshold here
// on purpose: the goal is to observe WHERE and HOW it fails, so the report
// describes the failure curve rather than a verdict.
//
// Watch for: error rate crossing 1%, p99 exploding, dropped_iterations rising.
// Stop early (Ctrl+C) once the service is clearly degraded — do not push a
// service that is already failing.

import { sleep } from 'k6';
import { userJourney } from '../lib/http.js';
import { handleSummary, TREND_STATS } from '../lib/summary.js';

export { handleSummary };

const STEP = Number(__ENV.STEP || 20);
const STEP_DURATION = __ENV.STEP_DURATION || '2m';
const STEPS = Number(__ENV.STEPS || 5);

export const options = {
  summaryTrendStats: TREND_STATS,
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: Array.from({ length: STEPS }, (_, i) => ({
        duration: STEP_DURATION,
        target: STEP * (i + 1),
      })).concat([{ duration: '1m', target: 0 }]),
      gracefulRampDown: '30s',
    },
  },
  // Observation thresholds only — they flag the breaking point, they do not
  // define success.
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  userJourney();
  sleep(1);
}