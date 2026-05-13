const http = require('http');

const port = Number(process.env.PORT || 9108);
const runtimeUrl = process.env.WISPY_RUNTIME_URL || 'http://209.126.82.189:3002/wispy-runtime';

function esc(value) {
  return String(value || 'unknown').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
  const usageDay = runtime?.sessions?.usageWindows?.day || runtime?.aiTelemetry?.windows?.day || {};
  const byModel = runtime?.aiTelemetry?.byModel || {};
  const recent = Array.isArray(runtime?.sessions?.recent) ? runtime.sessions.recent.slice(0, 10) : [];
  const gatewayOnline = runtime?.gateway?.online ? 1 : 0;
  const model = current.model || runtime?.aiTelemetry?.model || 'unknown';
  const provider = runtime?.aiTelemetry?.provider || (model.includes('/') ? model.split('/')[0] : 'unknown');
  const totalTokens = num(current.totalTokens || aggregate.totalTokens);
  const inputTokens = num(current.inputTokens);
  const outputTokens = num(current.outputTokens);
  const cacheRead = num(current.cacheRead, Math.max(0, totalTokens - inputTokens - outputTokens));
  const cacheEfficiency = totalTokens ? (cacheRead / totalTokens) * 100 : 0;
  const contextLimit = num(current.contextLimit, 200000);
  const contextPct = num(current.contextPct, contextLimit ? (totalTokens / contextLimit) * 100 : 0);
  const costTotal = num(current.costTotal || aggregate.totalCost);
  const activeSessions = num(runtime?.sessions?.activeCount);
  const totalSessions = num(runtime?.sessions?.totalCount);
  const dayMessages = num(usageDay.messages);
  const oauthPlusMessages3h = Math.round(dayMessages / 8); // day window normalized to the 3h OAuth Plus budget window.
  const costPerMinute = num(runtime?.aiTelemetry?.average?.costPerInteraction || costTotal) / 60;
  const apiStability = /gpt-5\.5/i.test(model) ? 1 : (/gpt-5|gpt-4/i.test(model) ? 0.7 : 0.35);

  const lines = [
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
    '# HELP wispy_oauth_plus_messages_3h Estimated OAuth Plus message pressure over a normalized 3h window.',
    '# TYPE wispy_oauth_plus_messages_3h gauge',
    `wispy_oauth_plus_messages_3h{window="3h",source="day_normalized"} ${oauthPlusMessages3h}`,
    '# HELP wispy_cache_efficiency_percent Percent of current-session tokens served from cache reads.',
    '# TYPE wispy_cache_efficiency_percent gauge',
    `wispy_cache_efficiency_percent{model="${esc(model)}"} ${cacheEfficiency}`,
    '# HELP wispy_context_saturation_percent Current context saturation percent.',
    '# TYPE wispy_context_saturation_percent gauge',
    `wispy_context_saturation_percent{model="${esc(model)}",limit="${contextLimit}"} ${contextPct}`,
    '# HELP wispy_api_stability_score 1 when GPT-5.5 primary is active; lower values indicate fallback routing.',
    '# TYPE wispy_api_stability_score gauge',
    `wispy_api_stability_score{model="${esc(model)}",provider="${esc(provider)}"} ${apiStability}`,
    '# HELP wispy_spend_per_minute_usd Estimated spend pressure per minute.',
    '# TYPE wispy_spend_per_minute_usd gauge',
    `wispy_spend_per_minute_usd{model="${esc(model)}"} ${costPerMinute}`,
    '# HELP wispy_model_total_tokens Total tokens by model across collected AI telemetry.',
    '# TYPE wispy_model_total_tokens gauge',
  ];

  for (const [modelName, data] of Object.entries(byModel)) {
    lines.push(`wispy_model_total_tokens{model="${esc(modelName)}"} ${num(data.totalTokens)}`);
    lines.push(`wispy_model_iterations{model="${esc(modelName)}"} ${num(data.iterations)}`);
    lines.push(`wispy_model_cost_usd{model="${esc(modelName)}"} ${num(data.cost)}`);
  }

  lines.push(
    '# HELP wispy_recent_interaction_tokens Last ten runtime interactions with token and cost labels.',
    '# TYPE wispy_recent_interaction_tokens gauge'
  );
  recent.forEach((item, index) => {
    const ts = Date.parse(item.timestamp || '') || Date.now();
    const previous = recent[index + 1] ? (Date.parse(recent[index + 1].timestamp || '') || ts) : ts;
    const latencySeconds = Math.max(0, (ts - previous) / 1000);
    lines.push(`wispy_recent_interaction_tokens{rank="${index + 1}",timestamp="${esc(item.timestamp)}",model="${esc(item.model)}",provider="${esc(item.provider)}",file="${esc(item.file)}",kind="input"} ${num(item.input)}`);
    lines.push(`wispy_recent_interaction_tokens{rank="${index + 1}",timestamp="${esc(item.timestamp)}",model="${esc(item.model)}",provider="${esc(item.provider)}",file="${esc(item.file)}",kind="output"} ${num(item.output)}`);
    lines.push(`wispy_recent_interaction_tokens{rank="${index + 1}",timestamp="${esc(item.timestamp)}",model="${esc(item.model)}",provider="${esc(item.provider)}",file="${esc(item.file)}",kind="cache_read"} ${num(item.cacheRead)}`);
    lines.push(`wispy_recent_interaction_total_tokens{rank="${index + 1}",timestamp="${esc(item.timestamp)}",model="${esc(item.model)}",provider="${esc(item.provider)}",file="${esc(item.file)}",cost_usd="${num(item.cost)}"} ${num(item.totalTokens)}`);
    lines.push(`wispy_recent_interaction_cost_saved_usd{rank="${index + 1}",timestamp="${esc(item.timestamp)}",model="${esc(item.model)}",provider="${esc(item.provider)}",file="${esc(item.file)}"} ${num(item.cacheRead) * 0.000001}`);
    lines.push(`wispy_recent_interaction_latency_seconds{rank="${index + 1}",timestamp="${esc(item.timestamp)}",model="${esc(item.model)}"} ${latencySeconds}`);
  });

  lines.push('');
  return lines.join('\n');
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
