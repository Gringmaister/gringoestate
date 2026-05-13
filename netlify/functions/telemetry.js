const { proxyPortableApi } = require('./_wispy-portable-proxy');

const SIMULATED_COST_PER_1M = {
  'gpt-5.5': { input: 5.0, output: 15.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  laguna: { input: 0, output: 0 },
  claude: { input: 3.0, output: 15.0 },
  deepseek: { input: 0.28, output: 0.42 },
  other: { input: 0.5, output: 1.5 }
};

function classifyModel(model = '', provider = '') {
  const raw = `${provider}/${model}`.toLowerCase();
  if (raw.includes('gpt-5.5')) return 'GPT-5.5';
  if (raw.includes('gpt-4o')) return 'GPT-4o Mini';
  if (raw.includes('laguna')) return 'Laguna';
  if (raw.includes('claude')) return 'Claude';
  if (raw.includes('deepseek')) return 'DeepSeek';
  return 'Other';
}

function costKey(label) {
  if (label === 'GPT-5.5') return 'gpt-5.5';
  if (label === 'GPT-4o Mini') return 'gpt-4o-mini';
  if (label === 'Laguna') return 'laguna';
  if (label === 'Claude') return 'claude';
  if (label === 'DeepSeek') return 'deepseek';
  return 'other';
}

function simulatedCostUsd(interaction = {}) {
  const label = classifyModel(interaction.model, interaction.provider);
  const rate = SIMULATED_COST_PER_1M[costKey(label)] || SIMULATED_COST_PER_1M.other;
  const input = Number(interaction.inputTokens || 0);
  const output = Number(interaction.outputTokens || 0);
  const total = ((input / 1_000_000) * rate.input) + ((output / 1_000_000) * rate.output);
  return Number(total.toFixed(6));
}

function emptyTelemetry() {
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: 'empty',
    lastInteraction: null,
    totals: {
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      simulatedCostUsd: 0,
      realCostUsd: 0,
      count: 0
    },
    distribution: [
      { model: 'GPT-5.5', tokens: 0, percent: 0, simulatedCostUsd: 0, count: 0 },
      { model: 'Laguna', tokens: 0, percent: 0, simulatedCostUsd: 0, count: 0 },
      { model: 'Claude', tokens: 0, percent: 0, simulatedCostUsd: 0, count: 0 },
      { model: 'DeepSeek', tokens: 0, percent: 0, simulatedCostUsd: 0, count: 0 }
    ],
    liveFeed: []
  };
}

function buildTelemetry(raw = {}) {
  const interactions = Array.isArray(raw.interactions) ? raw.interactions : [];
  const normalized = interactions.map((item, index) => {
    const inputTokens = Number(item.inputTokens || 0);
    const outputTokens = Number(item.outputTokens || 0);
    const totalTokens = Number(item.totalTokens || inputTokens + outputTokens || 0);
    const label = classifyModel(item.model, item.provider);
    return {
      id: `${item.timestamp || 'event'}-${index}`,
      timestamp: item.timestamp || new Date().toISOString(),
      route: item.route || item.channel || item.source || 'unknown',
      provider: item.provider || 'unknown',
      model: label,
      rawModel: item.model || 'unknown',
      inputTokens,
      outputTokens,
      totalTokens,
      simulatedCostUsd: simulatedCostUsd({ ...item, inputTokens, outputTokens }),
      realCostUsd: 0,
      status: item.status || 'success'
    };
  });

  const totals = normalized.reduce((acc, item) => {
    acc.tokens += item.totalTokens;
    acc.inputTokens += item.inputTokens;
    acc.outputTokens += item.outputTokens;
    acc.simulatedCostUsd += item.simulatedCostUsd;
    acc.count += 1;
    return acc;
  }, { tokens: 0, inputTokens: 0, outputTokens: 0, simulatedCostUsd: 0, realCostUsd: 0, count: 0 });
  totals.simulatedCostUsd = Number(totals.simulatedCostUsd.toFixed(6));

  const distributionMap = new Map();
  for (const item of normalized) {
    const current = distributionMap.get(item.model) || { model: item.model, tokens: 0, simulatedCostUsd: 0, count: 0 };
    current.tokens += item.totalTokens;
    current.simulatedCostUsd += item.simulatedCostUsd;
    current.count += 1;
    distributionMap.set(item.model, current);
  }

  const canonical = ['GPT-5.5', 'Laguna', 'Claude', 'DeepSeek'];
  const distribution = canonical.map((model) => {
    const item = distributionMap.get(model) || { model, tokens: 0, simulatedCostUsd: 0, count: 0 };
    return {
      ...item,
      simulatedCostUsd: Number(item.simulatedCostUsd.toFixed(6)),
      percent: totals.tokens ? Number(((item.tokens / totals.tokens) * 100).toFixed(1)) : 0
    };
  });

  const others = [...distributionMap.values()].filter((item) => !canonical.includes(item.model));
  if (others.length) {
    const other = others.reduce((acc, item) => {
      acc.tokens += item.tokens;
      acc.simulatedCostUsd += item.simulatedCostUsd;
      acc.count += item.count;
      return acc;
    }, { model: 'Other', tokens: 0, simulatedCostUsd: 0, count: 0 });
    other.simulatedCostUsd = Number(other.simulatedCostUsd.toFixed(6));
    other.percent = totals.tokens ? Number(((other.tokens / totals.tokens) * 100).toFixed(1)) : 0;
    distribution.push(other);
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: raw.source || 'openclaw-runtime',
    lastInteraction: normalized[0] || null,
    totals,
    distribution,
    liveFeed: normalized.slice(0, 5)
  };
}

exports.handler = async function (event = {}) {
  const proxied = await proxyPortableApi(event, 'api/telemetry');
  if (proxied) return proxied;

  let payload = emptyTelemetry();
  try {
    const { collectInteractions } = require('../../runtime/collect-interactions');
    payload = buildTelemetry({ ...collectInteractions(80), source: 'local-runtime' });
  } catch (error) {
    payload = { ...payload, source: 'fallback-empty', error: error.message };
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(payload)
  };
};

exports.buildTelemetry = buildTelemetry;
