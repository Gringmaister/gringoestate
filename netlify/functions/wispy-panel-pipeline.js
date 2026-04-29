const { getContextData, getPipelineState, savePipelineState } = require('./_wispy-panel-utils');

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
  try {
    const seed = getContextData().pipeline || [];
    const items = getPipelineState(seed);

    if (event.httpMethod === 'GET') return json(200, { ok: true, items });

    if (event.httpMethod === 'PATCH') {
      const { name, patch = {} } = JSON.parse(event.body || '{}');
      if (!name) return json(400, { ok: false, error: 'name requerido' });
      const updated = items.map((item) => item.name === name ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item);
      savePipelineState(updated);
      return json(200, { ok: true, items: updated });
    }

    return json(405, { ok: false, error: 'Method Not Allowed' });
  } catch (error) {
    return json(500, { ok: false, error: error.message });
  }
};
