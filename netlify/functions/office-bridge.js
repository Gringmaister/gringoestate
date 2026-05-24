/**
 * office-bridge.js — Proxy transparente para el panel Gringo Office
 *
 * Captura todos los requests a /office/api/* y los reenvía al bridge
 * del VPS en http://209.126.82.189:3002/api/*.
 *
 * Los datos sensibles (canarian) siguen protegidos por el PIN-gate
 * en el bridge (header X-Canarian-Pin). Este proxy es transparente:
 * pasa headers y body tal cual.
 */

const BRIDGE_URL = 'http://209.126.82.189:3002';

exports.handler = async (event) => {
  try {
    // event.path = "/office/api/wispy/status"  →  "/api/wispy/status"
    const apiPath = event.path.replace(/^\/office\/api/, '/api');

    // Construir URL completa con query string
    const qs = event.rawQuery ? `?${event.rawQuery}` : '';
    const targetUrl = `${BRIDGE_URL}${apiPath}${qs}`;

    // Headers pasados al upstream (quitar los propios de Netlify/CDN)
    const forwardHeaders = { 'Content-Type': 'application/json' };
    const passThrough = [
      'x-canarian-pin',
      'authorization',
      'content-type',
      'accept',
      'accept-language'
    ];
    for (const h of passThrough) {
      if (event.headers[h]) forwardHeaders[h] = event.headers[h];
    }

    const fetchOpts = {
      method: event.httpMethod || 'GET',
      headers: forwardHeaders
    };
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
        'Cache-Control': 'no-store, no-cache',
        'Access-Control-Allow-Origin': 'https://gringo.estate',
        'Access-Control-Allow-Headers': 'Content-Type, X-Canarian-Pin'
      },
      body
    };
  } catch (err) {
    console.error('[office-bridge] Error proxying to VPS:', err.message);
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Bridge no disponible', detail: err.message })
    };
  }
};
