async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  return data;
}

async function getBridgeRuntime() {
  const bridgeUrl = process.env.WISPY_RUNTIME_BRIDGE_URL;
  if (!bridgeUrl) return null;

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
    return await collectRuntime();
  } catch {
    return null;
  }
}

async function getRuntimeTelemetry() {
  try {
    const bridged = await getBridgeRuntime();
    if (bridged) return { ...bridged, source: 'bridge' };
  } catch (error) {
    return { error: error.message, source: 'bridge-error' };
  }

  const local = await getLocalRuntime();
  if (local) return local;
  return null;
}

module.exports = {
  getRuntimeTelemetry
};
