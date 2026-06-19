const { proxyPortableApi } = require('./_wispy-portable-proxy');
const fs = require('fs');
const path = require('path');

const SNAPSHOT_PATHS = [
  '/data/panel/cfo-profitability.json',
  '/tmp/cfo-profitability.json',
  path.join(__dirname, '../../data/cfo-profitability.json')
];

exports.handler = async function (event = {}) {
  const proxied = await proxyPortableApi({ httpMethod: 'GET' }, 'api/finance');
  if (proxied) return proxied;

  let data = null;
  for (const p of SNAPSHOT_PATHS) {
    try {
      if (fs.existsSync(p)) {
        data = JSON.parse(fs.readFileSync(p, 'utf8'));
        break;
      }
    } catch {}
  }

  if (!data) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ok: false, error: 'snapshot_not_found' })
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ ok: true, ...data })
  };
};
