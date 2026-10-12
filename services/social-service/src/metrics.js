// Zero-dependency Prometheus metrics. Each service copies this file (they're
// independent packages). Exposes:
//   - metricsMiddleware(serviceName): counts requests + observes latency
//   - metricsHandler(pool, serviceName): renders text/plain exposition format
//   - registerCustom(name, help, type): opt-in extra series (e.g. reminder ticks)
//
// Histograms use fixed second-buckets suitable for a small self-hosted API.

const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

// label-keyed stores
const reqTotal = new Map();      // key -> count
const reqInFlight = { value: 0 };
const durBuckets = new Map();    // key -> number[] (cumulative-per-bucket counts)
const durSum = new Map();        // key -> total seconds
const durCount = new Map();      // key -> observations

// opt-in custom counters/gauges: name -> { help, type, values: Map<labelStr,val> }
const custom = new Map();

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');

// Collapse an express path to a low-cardinality route label. We prefer the
// matched route (req.route.path) mounted under baseUrl; otherwise we replace
// UUIDs and long ids with :id so we don't explode label cardinality.
function routeLabel(req) {
  const base = req.baseUrl || '';
  if (req.route && req.route.path) {
    const p = typeof req.route.path === 'string' ? req.route.path : '';
    return (base + p) || p || 'unknown';
  }
  // No matched route: this is a 404 / auth-rejected / probe path. Echoing the
  // raw URL would let anyone explode label cardinality, so collapse to a single
  // stable bucket instead.
  return '<unmatched>';
}

export function metricsMiddleware(service) {
  return (req, res, next) => {
    if (req.path === '/metrics' || req.path === '/healthz') return next();
    reqInFlight.value += 1;
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      reqInFlight.value -= 1;
      const route = routeLabel(req);
      const key = `${service}|${req.method}|${route}|${res.statusCode}`;
      reqTotal.set(key, (reqTotal.get(key) ?? 0) + 1);

      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      const hkey = `${service}|${req.method}|${route}`;
      let arr = durBuckets.get(hkey);
      if (!arr) { arr = new Array(BUCKETS.length).fill(0); durBuckets.set(hkey, arr); }
      for (let i = 0; i < BUCKETS.length; i++) if (seconds <= BUCKETS[i]) arr[i] += 1;
      durSum.set(hkey, (durSum.get(hkey) ?? 0) + seconds);
      durCount.set(hkey, (durCount.get(hkey) ?? 0) + 1);
    });
    next();
  };
}

export function registerCustom(name, help, type = 'counter') {
  if (!custom.has(name)) custom.set(name, { help, type, values: new Map() });
  return {
    inc: (labels = {}, by = 1) => {
      const k = labelKey(labels);
      const m = custom.get(name).values;
      m.set(k, (m.get(k) ?? 0) + by);
    },
    set: (labels = {}, v = 0) => {
      custom.get(name).values.set(labelKey(labels), v);
    },
  };
}

function labelKey(labels) {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}="${esc(labels[k])}"`).join(',');
}

export async function metricsHandler(pool, service) {
  return async (_req, res) => {
    const lines = [];
    const push = (s) => lines.push(s);

    // ---- process/runtime ----
    const mem = process.memoryUsage();
    push('# HELP openhabit_process_resident_memory_bytes Resident memory.');
    push('# TYPE openhabit_process_resident_memory_bytes gauge');
    push(`openhabit_process_resident_memory_bytes{service="${service}"} ${mem.rss}`);
    push('# HELP openhabit_process_heap_used_bytes Heap in use.');
    push('# TYPE openhabit_process_heap_used_bytes gauge');
    push(`openhabit_process_heap_used_bytes{service="${service}"} ${mem.heapUsed}`);
    push('# HELP openhabit_process_uptime_seconds Process uptime.');
    push('# TYPE openhabit_process_uptime_seconds gauge');
    push(`openhabit_process_uptime_seconds{service="${service}"} ${process.uptime().toFixed(0)}`);

    // ---- http request totals ----
    push('# HELP openhabit_http_requests_total Total HTTP requests.');
    push('# TYPE openhabit_http_requests_total counter');
    for (const [key, count] of reqTotal) {
      const [svc, method, route, status] = key.split('|');
      push(`openhabit_http_requests_total{service="${svc}",method="${method}",route="${esc(route)}",status="${status}"} ${count}`);
    }

    // ---- in-flight ----
    push('# HELP openhabit_http_requests_in_flight In-flight HTTP requests.');
    push('# TYPE openhabit_http_requests_in_flight gauge');
    push(`openhabit_http_requests_in_flight{service="${service}"} ${reqInFlight.value}`);

    // ---- latency histogram ----
    push('# HELP openhabit_http_request_duration_seconds HTTP request latency.');
    push('# TYPE openhabit_http_request_duration_seconds histogram');
    for (const [hkey, arr] of durBuckets) {
      const [svc, method, route] = hkey.split('|');
      const base = `service="${svc}",method="${method}",route="${esc(route)}"`;
      for (let i = 0; i < BUCKETS.length; i++) {
        push(`openhabit_http_request_duration_seconds_bucket{${base},le="${BUCKETS[i]}"} ${arr[i]}`);
      }
      push(`openhabit_http_request_duration_seconds_bucket{${base},le="+Inf"} ${durCount.get(hkey)}`);
      push(`openhabit_http_request_duration_seconds_sum{${base}} ${(durSum.get(hkey) ?? 0).toFixed(6)}`);
      push(`openhabit_http_request_duration_seconds_count{${base}} ${durCount.get(hkey)}`);
    }

    // ---- pg pool ----
    if (pool) {
      push('# HELP openhabit_pg_pool_total Total pg pool connections.');
      push('# TYPE openhabit_pg_pool_total gauge');
      push(`openhabit_pg_pool_total{service="${service}"} ${pool.totalCount ?? 0}`);
      push('# HELP openhabit_pg_pool_idle Idle pg pool connections.');
      push('# TYPE openhabit_pg_pool_idle gauge');
      push(`openhabit_pg_pool_idle{service="${service}"} ${pool.idleCount ?? 0}`);
      push('# HELP openhabit_pg_pool_waiting Clients waiting for a connection.');
      push('# TYPE openhabit_pg_pool_waiting gauge');
      push(`openhabit_pg_pool_waiting{service="${service}"} ${pool.waitingCount ?? 0}`);
      // liveness of the DB from this service's perspective
      let up = 1;
      try { await pool.query('SELECT 1'); } catch { up = 0; }
      push('# HELP openhabit_pg_up Whether the database answered a probe (1/0).');
      push('# TYPE openhabit_pg_up gauge');
      push(`openhabit_pg_up{service="${service}"} ${up}`);
    }

    // ---- custom series ----
    for (const [name, def] of custom) {
      push(`# HELP ${name} ${def.help}`);
      push(`# TYPE ${name} ${def.type}`);
      for (const [labelStr, val] of def.values) {
        const labels = labelStr ? `{service="${service}",${labelStr}}` : `{service="${service}"}`;
        push(`${name}${labels} ${val}`);
      }
      if (!def.values.size) push(`${name}{service="${service}"} 0`);
    }

    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(lines.join('\n') + '\n');
  };
}
