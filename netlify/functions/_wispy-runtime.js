async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  return data;
}

async function getBridgeRuntime() {
  const bridgeUrl = process.env.WISPY_RUNTIME_BRIDGE_URL || 'http://209.126.82.189:3002/wispy-runtime';

  const headers = {};
  if (process.env.WISPY_RUNTIME_BRIDGE_TOKEN) {
    headers.Authorization = `Bearer ${process.env.WISPY_RUNTIME_BRIDGE_TOKEN}`;
  }

  const payload = await fetchJson(bridgeUrl, { headers });
  return payload?.runtime || null;
}

async function getLocalRuntime() {
  try {
    const { collectRuntime } = require('../../runtime/collect-openclaw-runtime');
    const runtime = await collectRuntime();
    const hasRealSignals = Boolean(runtime?.gateway?.online || runtime?.sessions?.totalCount);
    return hasRealSignals ? runtime : null;
  } catch {
    return null;
  }
}

async function getRuntimeTelemetry() {
  try {
    const bridged = await getBridgeRuntime();
    if (bridged) return { ...bridged, source: 'bridge' };
  } catch (error) {
    return { error: error.message, source: 'bridge-error', pending: true };
  }

  const local = await getLocalRuntime();
  if (local) return local;
  return { source: 'bridge-pending', pending: true };
}

module.exports = {
  getRuntimeTelemetry
};
