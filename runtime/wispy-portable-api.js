#!/usr/bin/env node
const http = require('http');
const { URL } = require('url');

const panelData = require('../netlify/functions/wispy-panel-data');
const chat = require('../netlify/functions/wispy-panel-chat');
const inbox = require('../netlify/functions/wispy-panel-inbox');
const followup = require('../netlify/functions/wispy-panel-followup');
const collaborators = require('../netlify/functions/wispy-panel-collaborators');
const pipeline = require('../netlify/functions/wispy-panel-pipeline');
const runtimeBridge = require('./wispy-runtime-bridge');

const port = Number(process.env.WISPY_API_PORT || 8788);
const host = process.env.WISPY_API_HOST || '0.0.0.0';
const token = process.env.WISPY_API_TOKEN || '';

function unauthorized(res) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function callHandler(handlerModule, req, body = '') {
  return await handlerModule.handler({
    httpMethod: req.method,
    body,
    headers: req.headers,
    path: req.url,
    rawUrl: req.url
  });
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'wispy-portable-api' }));
    return;
  }

  const auth = req.headers.authorization || '';
  if (token && auth !== `Bearer ${token}`) {
    unauthorized(res);
    return;
  }

  const body = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : '';
  let response;

  if (url.pathname === '/wispy-runtime' || url.pathname === '/api/runtime') {
    response = await callHandler(runtimeBridge, { ...req, method: 'GET', url: '/wispy-runtime' }, body);
  } else if (url.pathname === '/api/panel-data') {
    response = await callHandler(panelData, req, body);
  } else if (url.pathname === '/api/chat') {
    response = await callHandler(chat, req, body);
  } else if (url.pathname === '/api/inbox') {
    response = await callHandler(inbox, req, body);
  } else if (url.pathname === '/api/followup') {
    response = await callHandler(followup, req, body);
  } else if (url.pathname === '/api/collaborators') {
    response = await callHandler(collaborators, req, body);
  } else if (url.pathname === '/api/pipeline') {
    response = await callHandler(pipeline, req, body);
  } else {
    response = {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'not_found' })
    };
  }

  res.writeHead(response.statusCode || 200, response.headers || { 'Content-Type': 'application/json' });
  res.end(response.body || '');
}

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: error.message }));
  });
});

server.listen(port, host, () => {
  console.log(`wispy-portable-api listening on http://${host}:${port}`);
});
