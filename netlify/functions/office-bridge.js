/**
 * office-bridge.js — Proxy transparente para el panel Gringo Office
 *
 * Captura todos los requests a /office/api/* y los reenvía al bridge
 * VPS vía Cloudflare Tunnel (evita restricciones de firewall del CDN).
 *
 * BRIDGE_URL: ahora hay Named Tunnel con URL FIJA (https://bridge.gringo.estate),
 * así que el default ya no es un Quick Tunnel volátil. La env var OFFICE_BRIDGE_URL
 * en Netlify la sobreescribe si está seteada — para usar la URL fija, setearla a
 * https://bridge.gringo.estate (o borrarla para caer en este default).
 *
 * Los datos sensibles (canarian) siguen protegidos por PIN-gate en el
 * bridge (header X-Canarian-Pin). Este proxy pasa headers y body tal cual.
 */

const BRIDGE_URL = process.env.OFFICE_BRIDGE_URL || 'https://bridge.gringo.estate';

exports.handler = async (event) => {
  try {
    // event.path = "/office/api/wispy/status" o "/office-pixel/api/..."  →  "/api/..."
    const apiPath = event.path.replace(/^\/office(?:-pixel)?\/api/, '/api');

    // Query string
    const qs = event.rawQuery ? `?${event.rawQuery}` : '';
    const targetUrl = `${BRIDGE_URL}${apiPath}${qs}`;

    // Headers pasados al upstream
    const forwardHeaders = { 'Content-Type': 'application/json' };
    const passThrough = ['x-canarian-pin', 'authorization', 'content-type', 'accept'];
    for (const h of passThrough) {
      if (event.headers[h]) forwardHeaders[h] = event.headers[h];
    }

    const fetchOpts = { method: event.httpMethod || 'GET', headers: forwardHeaders };
    if (!['GET', 'HEAD'].includes(event.httpMethod) && event.body) {
      fetchOpts.body = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body;
    }

    const res = await fetch(targetUrl, fetchOpts);
    const body = await res.text();

    return {
      statusCode: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store, no-cache'
      },
      body
    };
  } catch (err) {
    console.error('[office-bridge] Error proxying to bridge:', err.message);
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Bridge no disponible', detail: err.message })
    };
  }
};
