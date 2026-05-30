/* Gringo Office Pixel — cliente de API contra el bridge (mismo backend que el office clásico) */
(function (g) {
  'use strict';
  // En prod el front vive en gringo.estate/office-pixel/ y pega same-origin a /office-pixel/api/*.
  // En local (python http.server) cae al Named Tunnel del bridge para poder probar.
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  const API = isLocal ? 'https://bridge.gringo.estate/api' : '/office-pixel/api';

  async function apiFetch(path, opts = {}) {
    try {
      const r = await fetch(API + path, {
        headers: { Accept: 'application/json', ...(opts.headers || {}) },
        ...opts
      });
      if (!r.ok) return { __error: r.status };
      const ct = r.headers.get('content-type') || '';
      return ct.includes('json') ? await r.json() : await r.text();
    } catch (e) {
      return { __error: e.message || 'network' };
    }
  }

  // Prometheus: valor instantáneo (primer resultado) o null
  async function prom(q) {
    const d = await apiFetch('/prometheus/query?q=' + encodeURIComponent(q));
    try {
      const r = d.data.result;
      return r && r.length ? parseFloat(r[0].value[1]) : null;
    } catch { return null; }
  }
  // Prometheus: todos los resultados como [{labels, value}]
  async function promAll(q) {
    const d = await apiFetch('/prometheus/query?q=' + encodeURIComponent(q));
    try { return d.data.result.map((x) => ({ labels: x.metric, value: parseFloat(x.value[1]) })); }
    catch { return []; }
  }

  g.GO = { API, apiFetch, prom, promAll, isLocal };
})(window);
