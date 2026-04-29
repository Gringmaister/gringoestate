async function proxyPortableApi(event, endpoint) {
  const baseUrl = process.env.WISPY_PORTABLE_API_URL;
  const token = process.env.WISPY_PORTABLE_API_TOKEN || process.env.WISPY_RUNTIME_BRIDGE_TOKEN || '';

  if (!baseUrl) return null;

  const url = new URL(endpoint, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  const headers = {
    'Content-Type': 'application/json'
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    method: event.httpMethod || 'GET',
    headers,
    body: ['GET', 'HEAD'].includes(event.httpMethod) ? undefined : (event.body || undefined)
  });

  const text = await response.text();
  return {
    statusCode: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store'
    },
    body: text
  };
}

module.exports = {
  proxyPortableApi
};
