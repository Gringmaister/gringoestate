/* Gringo Office Pixel — cliente de API contra el bridge (mismo backend que el office clásico) */
(function (g) {
  'use strict';
  // El panel vive en bridge.gringo.estate/office-pixel/ (servido por wispy_bridge port 3002 vía Cloudflare).
  // En local (python http.server / localhost) apunta al bridge externo para poder probar sin VPN.
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  const API = isLocal ? 'https://bridge.gringo.estate/api' : '/api';

  // Acceso directo al bridge (sin Netlify): el token x-office-token que antes
  // inyectaba la función de Netlify ahora lo aporta el navegador desde localStorage.
  // Se pide UNA sola vez y queda guardado. promptInFlight evita un aluvión de
  // prompts cuando varias llamadas disparan 401 en paralelo al cargar.
  let promptInFlight = null;
  function ensureToken(force) {
    let tok = '';
    try { tok = localStorage.getItem('officeToken') || ''; } catch (e) {}
    if (tok && !force) return Promise.resolve(tok);
    if (promptInFlight) return promptInFlight;
    promptInFlight = new Promise((resolve) => {
      const entered = (typeof prompt === 'function')
        ? prompt('Token de acceso al CRM (x-office-token):', '')
        : '';
      const t = (entered || '').trim();
      try { if (t) localStorage.setItem('officeToken', t); } catch (e) {}
      resolve(t);
    });
    promptInFlight.finally(() => { promptInFlight = null; });
    return promptInFlight;
  }

  async function apiFetch(path, opts = {}) {
    try {
      // Merge de headers robusto: el body de POST necesita Content-Type JSON, y
      // headers debe ir DESPUÉS de ...opts para no ser pisado por opts.
      var headers = { Accept: 'application/json', ...(opts.headers || {}) };
      if (opts.body != null && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
      let tok = await ensureToken(false);
      if (tok) headers['x-office-token'] = tok;
      let r = await fetch(API + path, { ...opts, headers });
      if (r.status === 401 || r.status === 403) {
        const fresh = await ensureToken(true);
        if (fresh) {
          headers['x-office-token'] = fresh;
          r = await fetch(API + path, { ...opts, headers });
        }
      }
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

  // Token sincrónico para los fetch() crudos (Canarian) que no pasan por apiFetch.
  function officeToken() {
    try { return localStorage.getItem('officeToken') || ''; } catch (e) { return ''; }
  }

  g.GO = { API, apiFetch, prom, promAll, isLocal, officeToken };
})(window);
