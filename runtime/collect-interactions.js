const fs = require('fs');
const path = require('path');

const openclawRoot = process.env.OPENCLAW_HOME || path.join(require('os').homedir(), '.openclaw');
const modelUsagePath = path.join(openclawRoot, 'logs', 'model-usage.jsonl');
const sessionsDir = path.join(openclawRoot, 'agents', 'main', 'sessions');

function readLastLines(filePath, n = 50) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size === 0) return [];
    
    const bytesToRead = Math.min(stat.size, 100 * 1024);
    const start = Math.max(0, stat.size - bytesToRead);
    const buffer = Buffer.alloc(stat.size - start);
    const fd = fs.openSync(filePath, 'r');
    try {
      fs.readSync(fd, buffer, 0, buffer.length, start);
    } finally {
      fs.closeSync(fd);
    }
    
    const content = buffer.toString('utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines.slice(-n).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function extractProviderModel(fullModel) {
  if (!fullModel) return { provider: 'unknown', model: 'unknown' };
  const parts = String(fullModel).split('/');
  if (parts.length >= 2) {
    return { provider: parts[0], model: parts.slice(1).join('/') };
  }
  return { provider: 'openrouter', model: fullModel };
}

function parseModelUsageEntry(entry) {
  const providerModel = extractProviderModel(entry?.modelo_final || entry?.model || entry?.modelo_intentado);
  
  return {
    timestamp: entry.timestamp || new Date().toISOString(),
    source: 'model-usage.jsonl',
    channel: entry.canal || 'unknown',
    requestedModel: entry.modelo_intentado || null,
    model: providerModel.model,
    provider: providerModel.provider,
    inputTokens: entry.inputTokens || entry.tokens_input || 0,
    outputTokens: entry.outputTokens || entry.tokens_output || 0,
    totalTokens: entry.totalTokens || (entry.inputTokens || 0) + (entry.outputTokens || 0),
    cost: entry.costo_est ?? entry.cost ?? 0,
    fallback: entry.fallback || false,
    fallbackReason: entry.causa_fallback || null,
    status: entry.error ? 'failed' : 'success',
    error: entry.error || null,
    summary: entry.mensaje_resumen || entry.mensaje || null
  };
}

function collectFromTrajectories() {
  const interactions = [];
  
  try {
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.trajectory.jsonl'));
    for (const file of files.slice(0, 20)) {
      const filePath = path.join(sessionsDir, file);
      const stat = fs.statSync(filePath);
      if (stat.size > 1024 * 1024) continue;
      
      const entries = readLastLines(filePath, 10);
      for (const entry of entries) {
        if (entry?.type !== 'message') continue;
        const usage = entry?.message?.usage;
        if (!usage) continue;
        
        const providerModel = extractProviderModel(entry?.message?.model);
        interactions.push({
          timestamp: entry.timestamp,
          source: 'trajectory',
          channel: 'unknown',
          model: providerModel.model,
          provider: providerModel.provider,
          inputTokens: usage.input || 0,
          outputTokens: usage.output || 0,
          totalTokens: usage.totalTokens || 0,
          cost: usage.cost?.total || 0,
          fallback: false,
          status: 'success',
          summary: null
        });
      }
    }
  } catch {}
  
  return interactions;
}

function collectInteractions(limit = 50) {
  const modelUsage = readLastLines(modelUsagePath, 50).map(parseModelUsageEntry);
  const fromTrajectories = collectFromTrajectories();
  
  const all = [...modelUsage, ...fromTrajectories]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
  
  const last = all[0] || null;
  
  const byModel = {};
  const byProvider = {};
  
  for (const i of all) {
    if (!byModel[i.model]) byModel[i.model] = { tokens: 0, cost: 0, count: 0 };
    if (!byProvider[i.provider]) byProvider[i.provider] = { tokens: 0, cost: 0, count: 0 };
    
    byModel[i.model].tokens += i.totalTokens || 0;
    byModel[i.model].cost += i.cost || 0;
    byModel[i.model].count += 1;
    
    byProvider[i.provider].tokens += i.totalTokens || 0;
    byProvider[i.provider].cost += i.cost || 0;
    byProvider[i.provider].count += 1;
  }
  
  return {
    interactions: all,
    lastInteraction: last,
    count: all.length,
    modelUsage: byModel,
    usageByProvider: byProvider,
    totalTokens: all.reduce((s, i) => s + (i.totalTokens || 0), 0),
    totalCost: all.reduce((s, i) => s + (i.cost || 0), 0)
  };
}

if (require.main === module) {
  const result = collectInteractions(20);
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { collectInteractions };