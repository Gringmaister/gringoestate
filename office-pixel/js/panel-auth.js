/* S105H — Login overlay del panel office-pixel (front-only, additivo).
 * NO toca api.js. Pide el token UNA vez, lo manda por POST al bridge y el server
 * setea una cookie httpOnly de sesión. El token NUNCA queda en JS/HTML/localStorage.
 * Se monta solo si el panel detecta que no hay sesión (GET /panel/status).
 * Cargar con: <script src="js/panel-auth.js?v=sNN"></script>  (después de api.js)
 */
(function () {
  'use strict';
  // La cookie de sesión se emite con Path=/office-pixel → login/status/logout DEBEN ir a
  // /office-pixel/api/panel/* para que la cookie viaje. NO usar window.GO.API: en el panel
  // vivo (api.js desincronizado) vale '/api' y la cookie no llegaría al status → loop de login.
  var BASE = '/office-pixel/api';

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html != null) n.innerHTML = html;
    return n;
  }

  function showLogin(errMsg) {
    if (document.getElementById('panel-auth-ov')) {
      if (errMsg) document.getElementById('panel-auth-err').textContent = errMsg;
      return;
    }
    var ov = el('div', { id: 'panel-auth-ov', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'panel-auth-title' });
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(8,8,10,.92);backdrop-filter:blur(4px)';
    ov.innerHTML =
      '<form id="panel-auth-form" style="background:#15151a;border:1px solid #b8932f;border-radius:14px;padding:28px 26px;width:min(92vw,380px);box-shadow:0 18px 60px rgba(0,0,0,.6);font-family:system-ui,sans-serif">' +
        '<h2 id="panel-auth-title" style="margin:0 0 6px;color:#e8c766;font-size:20px;letter-spacing:.5px">Gringo Office</h2>' +
        '<p style="margin:0 0 18px;color:#9a9aa2;font-size:13px;line-height:1.5">Acceso privado. Ingresá el token del panel para iniciar sesión.</p>' +
        '<label for="panel-auth-tok" style="display:block;color:#c8c8d0;font-size:12px;margin-bottom:6px">Token</label>' +
        '<input id="panel-auth-tok" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" ' +
          'style="width:100%;box-sizing:border-box;padding:11px 12px;border-radius:9px;border:1px solid #3a3a44;background:#0e0e12;color:#fff;font-size:14px;outline:none">' +
        '<div id="panel-auth-err" role="alert" style="color:#e06666;font-size:12px;min-height:16px;margin:8px 2px 0"></div>' +
        '<button id="panel-auth-go" type="submit" style="width:100%;margin-top:12px;padding:12px;border:0;border-radius:9px;background:#b8932f;color:#101013;font-weight:700;font-size:14px;cursor:pointer">Entrar</button>' +
      '</form>';
    document.body.appendChild(ov);
    if (errMsg) document.getElementById('panel-auth-err').textContent = errMsg;
    var tok = document.getElementById('panel-auth-tok');
    tok.focus();
    document.getElementById('panel-auth-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = document.getElementById('panel-auth-go');
      var errBox = document.getElementById('panel-auth-err');
      errBox.textContent = '';
      btn.disabled = true; btn.textContent = 'Entrando…';
      fetch(BASE + '/panel/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tok.value })
      }).then(function (r) {
        if (r.ok) { location.reload(); return; }
        if (r.status === 429) throw new Error('Demasiados intentos. Esperá un minuto.');
        throw new Error('Token inválido.');
      }).catch(function (err) {
        errBox.textContent = err.message || 'No se pudo iniciar sesión.';
        btn.disabled = false; btn.textContent = 'Entrar';
        tok.select();
      });
    });
  }

  function boot() {
    fetch(BASE + '/panel/status', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { authenticated: false }; })
      .then(function (d) { if (!d || !d.authenticated) showLogin(); })
      .catch(function () { showLogin(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
