const http = require('http');

const port = Number(process.env.PORT || 9108);
const runtimeUrl = process.env.WISPY_RUNTIME_URL || 'http://209.126.82.189:3002/wispy-runtime';

function esc(value) {
  return String(value || 'unknown').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

async function getRuntime() {
  const res = await fetch(runtimeUrl, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`runtime HTTP ${res.status}`);
  const payload = await res.json();
  return payload.runtime || payload;
}

function metricsFromRuntime(runtime) {
  const current = runtime?.sessions?.current || {};
  const aggregate = runtime?.sessions?.aggregate || {};
  const gatewayOnline = runtime?.gateway?.online ? 1 : 0;
  const model = current.model || 'unknown';
  const totalTokens = Number(current.totalTokens || aggregate.totalTokens || 0);
  const inputTokens = Number(current.inputTokens || 0);
  const outputTokens = Number(current.outputTokens || 0);
  const cacheRead = Number(current.cacheRead || Math.max(0, totalTokens - inputTokens - outputTokens));
  const costTotal = Number(current.costTotal || aggregate.totalCost || 0);
  const activeSessions = Number(runtime?.sessions?.activeCount || 0);
  const totalSessions = Number(runtime?.sessions?.totalCount || 0);

  return [
    '# HELP wispy_gateway_online OpenClaw gateway online status.',
    '# TYPE wispy_gateway_online gauge',
    `wispy_gateway_online ${gatewayOnline}`,
    '# HELP wispy_sessions_active Active OpenClaw sessions.',
    '# TYPE wispy_sessions_active gauge',
    `wispy_sessions_active ${activeSessions}`,
    '# HELP wispy_sessions_total Total visible OpenClaw sessions.',
    '# TYPE wispy_sessions_total gauge',
    `wispy_sessions_total ${totalSessions}`,
    '# HELP wispy_current_session_tokens Tokens in current Wispy session by kind.',
    '# TYPE wispy_current_session_tokens gauge',
    `wispy_current_session_tokens{model="${esc(model)}",kind="input"} ${inputTokens}`,
    `wispy_current_session_tokens{model="${esc(model)}",kind="output"} ${outputTokens}`,
    `wispy_current_session_tokens{model="${esc(model)}",kind="cache_read"} ${cacheRead}`,
    `wispy_current_session_tokens{model="${esc(model)}",kind="total"} ${totalTokens}`,
    '# HELP wispy_current_session_cost_usd Current session estimated API-equivalent cost in USD.',
    '# TYPE wispy_current_session_cost_usd gauge',
    `wispy_current_session_cost_usd{model="${esc(model)}"} ${costTotal}`,
    '# HELP wispy_oauth_real_cost_usd Real OAuth marginal cost in USD.',
    '# TYPE wispy_oauth_real_cost_usd gauge',
    `wispy_oauth_real_cost_usd{model="${esc(model)}"} 0`,
    ''
  ].join('\n');
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'wispy-metrics-exporter' }));
    return;
  }
  if (req.url !== '/metrics') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
    return;
  }
  try {
    const runtime = await getRuntime();
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
    res.end(metricsFromRuntime(runtime));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`# exporter_error ${error.message}\n`);
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`wispy-metrics-exporter listening on :${port}`);
});
