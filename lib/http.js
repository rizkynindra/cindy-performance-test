// lib/http.js — request helpers shared by every scenario.
// Nothing here knows about load shape. Edit ENDPOINTS and the payloads to
// match the API under test; keep secrets in __ENV only.

import http from 'k6/http';
import { check } from 'k6';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
export const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

// Declare what you are testing. Each entry: name -> { method, path, body, tags }
export const ENDPOINTS = {
  health: { method: 'GET', path: '/health' },
  list: { method: 'GET', path: '/api/v1/items?page=1&limit=20' },
  detail: { method: 'GET', path: '/api/v1/items/1' },
  create: { method: 'POST', path: '/api/v1/items' },
};

export function defaultHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (AUTH_TOKEN) headers.Authorization = `Bearer ${AUTH_TOKEN}`;
  return { ...headers, ...extra };
}

// Sample payload for POST endpoints. Keep it small and deterministic-ish.
export function samplePayload() {
  return JSON.stringify({
    name: `loadtest-${randomString(10)}`,
    description: 'created by k6 performance test',
  });
}

function requestFor(endpoint, options) {
  const base = { headers: defaultHeaders(), tags: { name: endpoint }, ...options };
  if (endpoint === 'create') return { ...base, body: samplePayload() };
  return base;
}

export function call(endpoint) {
  const def = ENDPOINTS[endpoint];
  if (!def) throw new Error(`Unknown endpoint: ${endpoint}`);
  const url = `${BASE_URL}${def.path}`;
  const opts = requestFor(endpoint, { tags: { name: endpoint } });

  const res =
    def.method === 'GET'
      ? http.get(url, opts)
      : def.method === 'POST'
        ? http.post(url, opts.body, opts)
        : def.method === 'PUT'
          ? http.put(url, opts.body, opts)
          : http.del(url, null, opts);

  check(res, {
    [`${endpoint}: status 2xx/3xx`]: (r) => r.status >= 200 && r.status < 400,
    [`${endpoint}: under 1000ms`]: (r) => r.timings.duration < 1000,
  });

  return res;
}

// Typical landing-page-plus-API flow, closer to what a browser does.
export function userJourney() {
  call('health');
  call('list');
  call('detail');
}