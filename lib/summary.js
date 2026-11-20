// lib/summary.js — writes an HTML report and a Markdown summary from the k6
// end-of-test metrics. Self-contained: no extension, no network.
//
// Wire it in a scenario with:
//   import { handleSummary } from '../lib/summary.js';
//   export { handleSummary };
//
// IMPORTANT: k6 v2 only computes the percentiles you ask for. Without
// TREND_STATS the report shows "—" for p50 and p99. Spread it into every
// scenario's options, or pass it here and let the scenario import it:
//   import { TREND_STATS } from '../lib/summary.js';
//   export const options = { summaryTrendStats: TREND_STATS, ... };

export const TREND_STATS = ['min', 'avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'];

const COLORS = { pass: '#1a7f37', fail: '#cf222e', muted: '#57606a' };

function fmt(n, digits = 2) {
  if (n === undefined || n === null) return '—';
  if (typeof n !== 'number') return String(n);
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  return n.toFixed(digits);
}

function extract(data) {
  const m = data.metrics || {};
  const get = (name, key = 'values') => (m[name] ? m[name][key] : undefined);
  const metric = (name, key) => (get(name) ? get(name)[key] : undefined);
  // k6 names the median "med" and only emits percentiles that were requested.
  const dur = (key, alts = []) => {
    for (const k of [key, ...alts]) {
      const v = metric('http_req_duration', k);
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  };

  const rows = [
    { label: 'Iterations', value: Math.round(metric('iterations', 'count') || 0) },
    { label: 'Requests', value: Math.round(metric('http_reqs', 'count') || 0) },
    { label: 'RPS (avg)', value: fmt(metric('http_reqs', 'rate')) },
    { label: 'p50 (ms)', value: fmt(dur('med', ['p(50)', 'avg']), 1) },
    { label: 'avg (ms)', value: fmt(dur('avg'), 1) },
    { label: 'p90 (ms)', value: fmt(dur('p(90)'), 1) },
    { label: 'p95 (ms)', value: fmt(dur('p(95)'), 1) },
    { label: 'p99 (ms)', value: fmt(dur('p(99)', ['max']), 1) },
    { label: 'max (ms)', value: fmt(dur('max'), 1) },
    { label: 'Error rate', value: `${fmt((metric('http_req_failed', 'rate') || 0) * 100)}%` },
    { label: 'Checks passed', value: `${fmt((metric('checks', 'rate') || 0) * 100)}%` },
    { label: 'Dropped iterations', value: Math.round(metric('dropped_iterations', 'count') || 0) },
    { label: 'VUs (max)', value: fmt(metric('vus_max', 'max'), 0) },
  ];

  // k6 reports thresholds as an object: { "p(95)<500": { ok: true } }
  const thresholds = Object.entries(m)
    .filter(([, v]) => v && v.thresholds)
    .flatMap(([name, v]) =>
      Object.entries(v.thresholds).map(([condition, result]) => ({
        metric: name,
        condition,
        ok: !(result && result.ok === false),
      })),
    );

  const failed = thresholds.filter((t) => !t.ok);
  return { rows, thresholds, failed };
}

function renderMarkdown(data) {
  const { rows, thresholds, failed } = extract(data);
  const verdict = failed.length === 0
    ? '**PASS** — all thresholds met.'
    : `**FAIL** — ${failed.length} threshold(s) not met: ${failed.map((t) => `${t.metric} ${t.condition}`).join(', ')}`;

  const lines = [
    `# Performance test — ${__ENV.PROFILE || 'run'}`,
    '',
    `- Target: \`${__ENV.BASE_URL || 'unknown'}\``,
    `- Started: ${new Date(data.state.testRunDurationMs ? Date.now() - data.state.testRunDurationMs : Date.now()).toISOString()}`,
    `- Duration: ${fmt((data.state.testRunDurationMs || 0) / 1000, 0)}s`,
    `- k6: ${__ENV.K6_VERSION || 'see run output'}`,
    '',
    `## Verdict`,
    '',
    verdict,
    '',
    '## Metrics',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    ...rows.map((r) => `| ${r.label} | ${r.value} |`),
    '',
  ];

  if (thresholds.length) {
    lines.push('## Thresholds', '', '| Metric | Condition | Result |', '| --- | --- | --- |');
    lines.push(...thresholds.map((t) => `| ${t.metric} | \`${t.condition}\` | ${t.ok ? 'PASS' : 'FAIL'} |`));
    lines.push('');
  }

  if (Number((data.metrics.dropped_iterations?.values?.count) || 0) > 0) {
    lines.push(
      '> **Warning:** dropped iterations > 0. The load generator, not the server, was saturated. Treat the numbers above as a lower bound and scale the generator.',
      '',
    );
  }

  return lines.join('\n');
}

function renderHtml(data) {
  const { rows, thresholds, failed } = extract(data);
  const ok = failed.length === 0;
  const verdictText = ok ? 'PASS — all thresholds met' : `FAIL — ${failed.length} threshold(s) not met`;
  const verdictColor = ok ? COLORS.pass : COLORS.fail;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>k6 report — ${__ENV.PROFILE || 'run'}</title>
<style>
  body{font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:32px;color:#24292f;background:#fff;max-width:900px;margin:0 auto}
  h1{font-size:22px;margin:0 0 4px}
  .meta{color:${COLORS.muted};font-size:13px;margin-bottom:24px}
  .verdict{padding:14px 18px;border-radius:8px;font-weight:600;color:#fff;background:${verdictColor};margin-bottom:24px}
  table{border-collapse:collapse;width:100%;margin-bottom:24px}
  th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #e5e7eb}
  th{background:#f6f8fa;font-weight:600;font-size:13px}
  td:last-child{text-align:right;font-variant-numeric:tabular-nums}
  .pass{color:${COLORS.pass};font-weight:600}
  .fail{color:${COLORS.fail};font-weight:600}
  .warn{background:#fff8c5;border:1px solid #d4a72c;padding:12px 16px;border-radius:8px;margin-bottom:24px}
  h2{font-size:15px;margin:0 0 8px}
  code{background:#f6f8fa;padding:1px 5px;border-radius:4px;font-size:13px}
</style></head><body>
<h1>Performance test — ${__ENV.PROFILE || 'run'}</h1>
<div class="meta">Target <code>${__ENV.BASE_URL || 'unknown'}</code> · duration ${fmt((data.state.testRunDurationMs || 0) / 1000, 0)}s · generated ${new Date().toISOString()}</div>
<div class="verdict">${verdictText}</div>
${Number((data.metrics.dropped_iterations?.values?.count) || 0) > 0 ? '<div class="warn"><strong>Dropped iterations &gt; 0.</strong> The load generator was saturated, not the server. The numbers are a lower bound.</div>' : ''}
<h2>Metrics</h2>
<table><tr><th>Metric</th><th>Value</th></tr>
${rows.map((r) => `<tr><td>${r.label}</td><td>${r.value}</td></tr>`).join('\n')}
</table>
<h2>Thresholds</h2>
<table><tr><th>Metric</th><th>Condition</th><th>Result</th></tr>
${thresholds.length ? thresholds.map((t) => `<tr><td>${t.metric}</td><td><code>${t.condition}</code></td><td class="${t.ok ? 'pass' : 'fail'}">${t.ok ? 'PASS' : 'FAIL'}</td></tr>`).join('\n') : '<tr><td colspan="3">No thresholds declared</td></tr>'}
</table>
</body></html>`;
}

export function handleSummary(data) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const profile = __ENV.PROFILE || 'run';
  const dir = __ENV.REPORT_DIR || 'perf/reports';
  const base = `${dir}/${profile}-${stamp}`;

  return {
    stdout: renderMarkdown(data) + '\n',
    [`${base}.json`]: JSON.stringify(data, null, 2),
    [`${base}.md`]: renderMarkdown(data),
    [`${base}.html`]: renderHtml(data),
  };
}