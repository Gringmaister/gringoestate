const crypto = require('crypto');

function getSecret() {
  return process.env.WISPY_PANEL_SECRET || process.env.WISPY_PANEL_PASSWORD || 'wispy-gringoestate-dev';
}

function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('hex');
}

function issueToken() {
  const payload = {
    issuedAt: Date.now(),
    nonce: crypto.randomBytes(12).toString('hex')
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return false;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return false;
  const expected = sign(encoded);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const maxAgeMs = 1000 * 60 * 60 * 12;
    return typeof payload.issuedAt === 'number' && Date.now() - payload.issuedAt < maxAgeMs;
  } catch {
    return false;
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ ok: false, error: 'Method Not Allowed' })
    };
  }

  try {
    const { mode, passcode, token } = JSON.parse(event.body || '{}');

    if (mode === 'verify') {
      return {
        statusCode: verifyToken(token) ? 200 : 401,
        body: JSON.stringify({ ok: verifyToken(token) })
      };
    }

    if (mode === 'login') {
      const expectedPasscode = process.env.WISPY_PANEL_PASSWORD;
      if (!expectedPasscode) {
        return {
          statusCode: 500,
          body: JSON.stringify({ ok: false, error: 'WISPY_PANEL_PASSWORD missing' })
        };
      }

      if (passcode !== expectedPasscode) {
        return {
          statusCode: 401,
          body: JSON.stringify({ ok: false, error: 'Invalid passcode' })
        };
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, token: issueToken() })
      };
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ ok: false, error: 'Invalid mode' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: error.message })
    };
  }
};
