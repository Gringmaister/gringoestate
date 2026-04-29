const { getInbox, saveInbox } = require('./_wispy-panel-utils');
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
  const proxied = await proxyPortableApi(event, 'api/inbox');
  if (proxied) return proxied;
  try {
    const method = event.httpMethod;
    const items = getInbox();

    if (method === 'GET') {
      return json(200, { ok: true, items });
    }

    if (method === 'POST') {
      const { title, summary, priority = 'medium', nextStep = 'Revisar y ejecutar', source = 'panel' } = JSON.parse(event.body || '{}');
      if (!title || !summary) return json(400, { ok: false, error: 'title y summary son requeridos' });

      const newItem = {
        id: `inbox-${Date.now()}`,
        title: String(title).trim(),
        summary: String(summary).trim(),
        priority,
        nextStep,
        status: 'open',
        source,
        createdAt: new Date().toISOString()
      };

      const updated = [newItem, ...items].slice(0, 50);
      saveInbox(updated);
      return json(200, { ok: true, item: newItem, items: updated });
    }

    if (method === 'PATCH') {
      const { id, status } = JSON.parse(event.body || '{}');
      if (!id || !status) return json(400, { ok: false, error: 'id y status son requeridos' });
      const updated = items.map((item) => item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item);
      saveInbox(updated);
      return json(200, { ok: true, items: updated });
    }

    return json(405, { ok: false, error: 'Method Not Allowed' });
  } catch (error) {
    return json(500, { ok: false, error: error.message });
  }
};
