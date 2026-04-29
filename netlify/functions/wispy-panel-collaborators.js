const { getContextData, getCollaboratorState, saveCollaboratorState } = require('./_wispy-panel-utils');
const { proxyPortableApi } = require('./_wispy-portable-proxy');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async function (event) {
  const proxied = await proxyPortableApi(event, 'api/collaborators');
  if (proxied) return proxied;
  try {
    const seed = getContextData().collaborators || [];
    const items = getCollaboratorState(seed);

    if (event.httpMethod === 'GET') return json(200, { ok: true, items });

    if (event.httpMethod === 'PATCH') {
      const { name, patch = {} } = JSON.parse(event.body || '{}');
      if (!name) return json(400, { ok: false, error: 'name requerido' });
      const updated = items.map((item) => item.name === name ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item);
      saveCollaboratorState(updated);
      return json(200, { ok: true, items: updated });
    }

    return json(405, { ok: false, error: 'Method Not Allowed' });
  } catch (error) {
    return json(500, { ok: false, error: error.message });
  }
};
