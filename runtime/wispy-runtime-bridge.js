#!/usr/bin/env node
const http = require('http');
const { collectRuntime } = require('./collect-openclaw-runtime');

const port = Number(process.env.WISPY_RUNTIME_PORT || 8787);
const host = process.env.WISPY_RUNTIME_HOST || '127.0.0.1';
const token = process.env.WISPY_RUNTIME_TOKEN || '';
const publicBind = process.env.WISPY_RUNTIME_PUBLIC === '1';
const bindHost = publicBind ? '0.0.0.0' : host;

function unauthorized(res) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
}

async function handler(event = {}) {
  const reqUrl = event.path || event.url || '/';
  const method = event.httpMethod || event.method || 'GET';
  const auth = event.headers?.authorization || event.headers?.Authorization || '';

  if (reqUrl === '/healthz') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true })
    };
  }

  if (reqUrl !== '/wispy-runtime' && reqUrl !== '/api/runtime') {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'not_found' })
    };
  }

  if (method !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'method_not_allowed' })
    };
  }

  if (token && auth !== `Bearer ${token}`) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'unauthorized' })
    };
  }

  try {
    const runtime = await collectRuntime();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ok: true, runtime })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: error.message })
    };
  }
}

if (require.main === module) {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.url !== '/wispy-runtime' || req.method !== 'GET') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'not_found' }));
      return;
    }

    const auth = req.headers.authorization || '';
    if (token && auth !== `Bearer ${token}`) {
      unauthorized(res);
      return;
    }

    try {
      const runtime = await collectRuntime();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, runtime }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
  });

  server.listen(port, bindHost, () => {
    console.log(`wispy-runtime-bridge listening on http://${bindHost}:${port}/wispy-runtime`);
  });
}

module.exports = {
  handler
};
