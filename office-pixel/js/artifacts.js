/* ─────────────────────────────────────────────────────────────────────────────
   artifacts.js v3 — Módulo ARTIFACTS del Gringo Office (S199)

   Race-proof (patrón tours.js): toda la lógica y el DOM viven en este archivo
   untracked; el módulo arma su propio scaffold en runtime (botón al FONDO del
   sidebar + vista + estilos am-*) y se engancha a window.nav sin tocar app.js.
   Si otra sesión pisa index.html, el módulo se reinstala mientras sobreviva su
   <script>.

   Antes esto era solo un botón que navegaba a la página estática artifacts.html.
   Ahora es una VISTA INTERNA: galería de tarjetas por categoría leída en runtime
   del manifest (GET /api/crm/artifacts) → clic en una tarjeta con fuente local =
   visor a pantalla casi completa DENTRO del Office (iframe grande, ⛶ pantalla
   completa, 🌐 web propia, ✕ volver). Tarjeta sin fuente (solo claude.ai) = abre
   el link en una pestaña nueva.
   ───────────────────────────────────────────────────────────────────────────── */
(function (g) {
  'use strict';

  var AM_VERSION = 's9';

  // Orden, etiqueta y color del rail por categoría (misma paleta que la galería vieja).
  var CAT_ORDER = ['roadmaps', 'italiano', 'radar', 'tours', 'cerebro', 'comercial'];
  var CAT_LABEL = {
    roadmaps: '🗺️ Roadmaps & documentación',
    italiano: '🏛️ Palestina 555 · Ambbi Italiano',
    radar: '📡 Radar Geo · Remates · Scrapers',
    tours: '🌐 Tours 360°',
    cerebro: '🧠 Segundo cerebro & IA',
    comercial: '💼 Comercial & operaciones',
    operaciones: '⚙️ Operaciones',
    otros: '📦 Otros',
  };
  var CAT_COLOR = {
    roadmaps: '#FFBF00', italiano: '#8b9cff', radar: '#37d29a',
    tours: '#c77dff', cerebro: '#fb9a3c', comercial: '#5ec8c0',
    operaciones: '#e0a3c8', otros: '#8a857b',
  };

  var AM = {
    _artifacts: [],
    _inited: false,
    _loading: false,

    // ── API ────────────────────────────────────────────────────────────────
    _api: function (path, opts) {
      var GO = g.GO;
      if (GO && GO.apiFetch) return GO.apiFetch(path, opts || {});
      return fetch('/office-pixel/api' + path, opts || {}).then(function (r) { return r.json(); });
    },
    // Misma base que tours: '/office-pixel/api' en público (same-origin → la cookie
    // de sesión autentica el iframe), Named Tunnel en local.
    _base: function () {
      var isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
      return isLocal ? 'https://bridge.gringo.estate/api' : '/office-pixel/api';
    },
    _tok: function () { var GO = g.GO; return (GO && GO.officeToken) ? GO.officeToken() : ''; },
    _toast: function (m, k) { if (g.toast) g.toast(m, k || 'ok'); },

    // ── Scaffold (se auto-instala si index.html quedó viejo) ────────────────
    // ARTIFACTS = ícono DIRECTO en el rail, en el grupo PERSONAL del fondo, JUSTO
    // ABAJO de COACH (porder 4; banco=1, minutas=2, coach=3). Suelto, sin drawer,
    // siempre visible en la columna (pedido de Franco). Mismo mecanismo que minutas.js:
    // el orden lo fija data-porder vía el helper compartido window._sortPersonalRail.
    _ensureScaffold: function () {
      if (!window._sortPersonalRail) {
        window._sortPersonalRail = function () {
          var infra = document.getElementById('rail-infra');
          var r = infra && infra.parentNode; if (!r) return;
          var bs = Array.prototype.slice.call(r.querySelectorAll('.rail-btn[data-porder]'))
            .sort(function (a, b) { return (+a.dataset.porder) - (+b.dataset.porder); });
          var prev = infra;
          bs.forEach(function (b) { r.insertBefore(b, prev.nextSibling); prev = b; });
        };
      }
      var railInfra = document.getElementById('rail-infra');
      var rail = railInfra && railInfra.parentNode;
      if (rail && !document.getElementById('rail-artifacts')) {
        var b = document.createElement('button');
        b.className = 'rail-btn'; b.id = 'rail-artifacts';
        b.dataset.module = 'artifacts'; b.dataset.porder = '4';
        b.setAttribute('title', 'ARTIFACTS — Biblioteca de deliverables');
        b.setAttribute('aria-label', 'ARTIFACTS');
        b.onclick = function () { g.nav('artifacts'); };
        b.innerHTML = '<span class="rail-icon" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24"><path d="M3 7.5V19h18V9H11L9 7H4.5A1.5 1.5 0 0 0 3 7.5z"/></svg>' +
          '</span><span class="rail-label">ARTIFACTS</span>';
        rail.appendChild(b); window._sortPersonalRail();
      }
      var v = document.getElementById('view-artifacts');
      if (!v) {
        v = document.createElement('div');
        v.className = 'view'; v.id = 'view-artifacts';
        var host = document.querySelector('.view') && document.querySelector('.view').parentNode;
        if (host) host.appendChild(v);
      }
      if (!document.getElementById('am-style')) {
        var s = document.createElement('style'); s.id = 'am-style'; s.textContent = AM._css();
        document.head.appendChild(s);
      }
      return v;
    },

    init: function () {
      var view = AM._ensureScaffold();
      if (!AM._inited) { console.log('[artifacts] módulo ' + AM_VERSION); AM._inited = true; }
      AM.renderLista(view);   // al entrar a la sección siempre mostramos la galería
    },

    // ── LISTA / GALERÍA ─────────────────────────────────────────────────────
    renderLista: function (view) {
      view = view || document.getElementById('view-artifacts');
      if (!view) return;
      view.innerHTML =
        '<div class="am-head"><div>' +
          '<h2 class="card-title">🗂️ Artifacts</h2>' +
          '<div class="card-sub">Todo lo que te fui armando — dossiers, calculadoras, roadmaps — en un solo lugar y clickeable. ' +
          'Las que tienen fuente propia se abren <b>acá adentro</b> a pantalla casi completa; el resto abren claude.ai.</div>' +
        '</div><div class="am-count" id="am-count"></div></div>' +
        // Barra de búsqueda + chips por categoría (s8). Vive ARRIBA de la lista y NO se
        // re-pinta al filtrar: si se redibujara, el input perdería el foco en cada tecla.
        '<div class="am-bar" id="am-bar" hidden>' +
          '<div class="am-search">' +
            '<span class="am-search-i" aria-hidden="true">🔎</span>' +
            '<input id="am-q" type="search" autocomplete="off" spellcheck="false" ' +
                   'placeholder="Buscar — podés poner varias palabras: uriburu cartera" ' +
                   'aria-label="Buscar artifacts">' +
            '<button type="button" class="am-x" id="am-x" hidden aria-label="Limpiar búsqueda">✕</button>' +
          '</div>' +
          '<div class="am-chips" id="am-chips" role="group" aria-label="Filtrar por categoría"></div>' +
          // Fila 2 (s9): CUÁNDO. El período filtra y el orden decide si la galería se
          // agrupa por tema o por mes — «verlos por fecha» es una vista, no sólo un filtro.
          '<div class="am-fila2">' +
            '<div class="am-chips am-fechas" id="am-fechas" role="group" aria-label="Filtrar por fecha"></div>' +
            '<div class="am-orden" role="group" aria-label="Cómo se agrupan">' +
              '<button type="button" class="am-ord on" data-ord="cat">Por tema</button>' +
              '<button type="button" class="am-ord" data-ord="fecha">Por fecha</button>' +
            '</div>' +
          '</div>' +
          '<div class="am-rango" id="am-rango" hidden>' +
            '<label>Desde <input type="date" id="am-d1"></label>' +
            '<label>Hasta <input type="date" id="am-d2"></label>' +
            '<button type="button" class="btn btn-xs" id="am-rango-x">Quitar</button>' +
          '</div>' +
        '</div>' +
        '<div id="am-lista"><div class="skeleton skeleton-block" style="height:90px"></div></div>';

      if (AM._loading) return;
      AM._loading = true;
      AM._api('/crm/artifacts').then(function (d) {
        AM._loading = false;
        var box = document.getElementById('am-lista');
        if (!box) return;
        if (!d || !d.ok) { box.innerHTML = '<div class="am-empty">No pude leer los artifacts.</div>'; return; }
        AM._artifacts = (d.artifacts || []).slice();
        var cnt = document.getElementById('am-count');
        if (cnt) cnt.textContent = AM._artifacts.length + (AM._artifacts.length === 1 ? ' artifact' : ' artifacts');
        if (!AM._artifacts.length) {
          box.innerHTML = '<div class="am-empty">Todavía no hay ningún artifact registrado.<br>' +
            '<small>Se cargan con <code>publicar-artifact.sh</code> en el VPS — aparecen acá solos.</small></div>';
          return;
        }
        AM._montarBarra();
        AM._pintarGaleria(box);
      }).catch(function (e) {
        AM._loading = false;
        var box = document.getElementById('am-lista');
        if (box) box.innerHTML = '<div class="am-empty">Error al leer los artifacts: ' + esc(e && e.message) + '</div>';
      });
    },

    // ── FILTRO: palabras clave + categoría + fecha (s9) ─────────────────────
    _q: '',        // texto tipeado
    _cat: '',      // '' = todas
    _per: '',      // '' = cualquier fecha · '7'|'30'|'90' días · 'rango'
    _d1: '', _d2: '',   // extremos del rango propio (YYYY-MM-DD, como los devuelve <input type=date>)
    _ord: 'cat',   // 'cat' = agrupar por tema · 'fecha' = agrupar por mes

    // Normaliza para buscar: sin acentos y en minúscula, así "italiano" encuentra
    // "Italïano" y "tasacion" encuentra "tasación" (que es como Franco lo va a tipear).
    _norm: function (s) {
      return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    },

    // Todo el texto del artifact en una sola tira, para buscar una sola vez por tarjeta.
    _blob: function (a) {
      if (a.__blob) return a.__blob;
      a.__blob = AM._norm([a.titulo, a.desc, a.slug, a.categoria, a.fecha].join(' '));
      return a.__blob;
    },

    // s9 — PALABRAS CLAVE, no frase exacta. Antes se buscaba el texto tipeado como
    // un solo pedazo contiguo: "uriburu cartera" no encontraba "Uriburu 1070 · Cartera
    // de Martín Lewi" y devolvía cero. Medido sobre el manifest del 1-sep: 7 de 14
    // búsquedas de dos palabras daban cero teniendo resultados. Ahora cada palabra se
    // busca por separado y TODAS tienen que aparecer (en título, descripción, slug o
    // categoría) — el orden en que se tipean deja de importar.
    _tokens: function () {
      return AM._norm(AM._q).split(/\s+/).filter(function (w) { return w.length > 0; });
    },

    // El orden importa y es una decisión: el TÍTULO manda (pedido explícito de Franco).
    // Puntúa cuántas palabras cayeron en el título; la descripción y el slug son red de
    // seguridad, no el criterio. A igual puntaje gana el más nuevo.
    _puntaje: function (a, ws) {
      var t = AM._norm(a.titulo), n = 0;
      for (var i = 0; i < ws.length; i++) if (t.indexOf(ws[i]) >= 0) n++;
      return n;
    },

    // Ventana de fechas activa, como [desde, hasta] en YYYY-MM-DD ('' = sin límite).
    _ventana: function () {
      if (AM._per === 'rango') return [AM._d1 || '', AM._d2 || ''];
      var d = parseInt(AM._per, 10);
      if (!d) return ['', ''];
      var t = new Date(); t.setDate(t.getDate() - d);
      return [t.toISOString().slice(0, 10), ''];
    },

    _filtrados: function () {
      var ws = AM._tokens();
      var v = AM._ventana(), desde = v[0], hasta = v[1];
      // Las fechas del manifest son YYYY-MM-DD: comparar como texto ya ordena bien y
      // no hay que construir Date (que en un string suelto interpreta huso y corre un día).
      var base = AM._artifacts.filter(function (a) {
        if (AM._cat && (a.categoria || 'otros') !== AM._cat) return false;
        var f = String(a.fecha || '');
        if (desde && (!f || f < desde)) return false;
        if (hasta && (!f || f > hasta)) return false;
        if (!ws.length) return true;
        var blob = AM._blob(a);
        for (var i = 0; i < ws.length; i++) if (blob.indexOf(ws[i]) < 0) return false;
        return true;
      });
      if (!ws.length) return base;
      return base.map(function (a) { return { a: a, p: AM._puntaje(a, ws) }; })
        .sort(function (x, y) {
          if (y.p !== x.p) return y.p - x.p;
          return String(y.a.fecha || '').localeCompare(String(x.a.fecha || ''));
        })
        .map(function (o) { return o.a; });
    },

    _montarBarra: function () {
      var bar = document.getElementById('am-bar');
      var chips = document.getElementById('am-chips');
      var inp = document.getElementById('am-q');
      var x = document.getElementById('am-x');
      if (!bar || !chips || !inp) return;
      bar.hidden = false;

      // Los chips salen de los datos, no de una lista escrita a mano: una categoría
      // nueva en el manifest aparece sola, y una que se vació no deja un chip muerto.
      var cuenta = {};
      AM._artifacts.forEach(function (a) {
        var c = a.categoria || 'otros';
        cuenta[c] = (cuenta[c] || 0) + 1;
      });
      var cats = CAT_ORDER.filter(function (c) { return cuenta[c]; });
      Object.keys(cuenta).forEach(function (c) { if (cats.indexOf(c) < 0) cats.push(c); });

      chips.innerHTML = '';
      function chip(cat, label, n, color) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'am-chip' + (AM._cat === cat ? ' on' : '');
        b.dataset.cat = cat;
        b.innerHTML = (color ? '<span class="am-dot" style="background:' + color + '"></span>' : '') +
                      '<span>' + esc(label) + '</span><span class="am-chip-n">' + n + '</span>';
        b.onclick = function () {
          AM._cat = (AM._cat === cat) ? '' : cat;   // volver a tocarlo lo apaga
          chips.querySelectorAll('.am-chip').forEach(function (o) {
            o.classList.toggle('on', o.dataset.cat === AM._cat);
          });
          AM._repintar();
        };
        chips.appendChild(b);
      }
      chip('', 'Todas', AM._artifacts.length, '');
      cats.forEach(function (c) {
        chip(c, (CAT_LABEL[c] || c).replace(/^\S+\s/, ''), cuenta[c], CAT_COLOR[c] || '#8a857b');
      });

      var t = null;
      inp.oninput = function () {
        AM._q = inp.value;
        if (x) x.hidden = !inp.value;
        clearTimeout(t);
        t = setTimeout(AM._repintar, 90);   // no repintar en cada tecla
      };
      inp.onkeydown = function (e) {
        if (e.key === 'Escape' && inp.value) { e.stopPropagation(); inp.value = ''; inp.oninput(); }
      };
      if (x) x.onclick = function () { inp.value = ''; AM._q = ''; x.hidden = true; AM._repintar(); inp.focus(); };

      AM._montarFechas();
    },

    // ── CUÁNDO: chips de período + rango propio + agrupado (s9) ─────────────
    // Los períodos son relativos a hoy a propósito: "los últimos 30 días" sigue
    // queriendo decir lo mismo mañana, un mes fijo no.
    _PERIODOS: [['', 'Cualquier fecha'], ['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'],
                ['90', 'Últimos 3 meses'], ['rango', 'Elegir fechas…']],

    _montarFechas: function () {
      var cont = document.getElementById('am-fechas');
      var rango = document.getElementById('am-rango');
      if (!cont) return;

      // Cuántos entran en cada período: un chip que no tiene nada detrás no se dibuja,
      // así no se ofrece un filtro que deja la pantalla vacía.
      function cuantos(per) {
        var guardado = [AM._per, AM._d1, AM._d2];
        AM._per = per;
        var v = AM._ventana(), d = v[0], h = v[1], n = 0;
        AM._artifacts.forEach(function (a) {
          var f = String(a.fecha || '');
          if (d && (!f || f < d)) return;
          if (h && (!f || f > h)) return;
          n++;
        });
        AM._per = guardado[0]; AM._d1 = guardado[1]; AM._d2 = guardado[2];
        return n;
      }

      cont.innerHTML = '';
      AM._PERIODOS.forEach(function (p) {
        var per = p[0], label = p[1];
        var n = per === 'rango' ? null : cuantos(per);
        if (n === 0) return;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'am-chip am-chip-f' + (AM._per === per ? ' on' : '');
        b.dataset.per = per;
        b.innerHTML = (per === '' ? '📅 ' : '') + '<span>' + esc(label) + '</span>' +
                      (n === null ? '' : '<span class="am-chip-n">' + n + '</span>');
        b.onclick = function () {
          AM._per = (AM._per === per && per !== '') ? '' : per;
          if (AM._per !== 'rango') { AM._d1 = ''; AM._d2 = ''; }
          cont.querySelectorAll('.am-chip-f').forEach(function (o) {
            o.classList.toggle('on', o.dataset.per === AM._per);
          });
          if (rango) rango.hidden = AM._per !== 'rango';
          AM._repintar();
        };
        cont.appendChild(b);
      });

      // Rango propio. <input type="date"> devuelve SIEMPRE YYYY-MM-DD en .value sin
      // importar cómo lo muestre el navegador — por eso se lee de ahí y no del texto.
      var d1 = document.getElementById('am-d1'), d2 = document.getElementById('am-d2');
      var fechas = AM._artifacts.map(function (a) { return String(a.fecha || ''); })
                     .filter(Boolean).sort();
      if (d1 && d2 && fechas.length) {
        d1.min = d2.min = fechas[0];
        d1.max = d2.max = fechas[fechas.length - 1];
        d1.onchange = function () { AM._d1 = d1.value; AM._per = 'rango'; AM._repintar(); };
        d2.onchange = function () { AM._d2 = d2.value; AM._per = 'rango'; AM._repintar(); };
      }
      var rx = document.getElementById('am-rango-x');
      if (rx) rx.onclick = function () {
        AM._per = ''; AM._d1 = ''; AM._d2 = '';
        if (d1) d1.value = ''; if (d2) d2.value = '';
        if (rango) rango.hidden = true;
        AM._montarFechas(); AM._repintar();
      };

      // Por tema ⇄ por fecha
      document.querySelectorAll('#view-artifacts .am-ord').forEach(function (b) {
        b.onclick = function () {
          AM._ord = b.dataset.ord;
          document.querySelectorAll('#view-artifacts .am-ord').forEach(function (o) {
            o.classList.toggle('on', o.dataset.ord === AM._ord);
          });
          AM._repintar();
        };
      });
    },

    _repintar: function () {
      var box = document.getElementById('am-lista');
      if (box) AM._pintarGaleria(box);
    },

    _pintarGaleria: function (box) {
      box.innerHTML = '';
      var lista = AM._filtrados();

      var cnt = document.getElementById('am-count');
      if (cnt) {
        var hayFiltro = AM._q || AM._cat || AM._per;
        cnt.textContent = hayFiltro
          ? lista.length + ' de ' + AM._artifacts.length
          : AM._artifacts.length + (AM._artifacts.length === 1 ? ' artifact' : ' artifacts');
      }
      if (!lista.length) {
        box.innerHTML = '<div class="am-empty">Ningún artifact coincide.<br>' +
          '<small>Probá con menos palabras, o sacá el filtro de tema o de fecha ' +
          'tocando el chip que quedó encendido.</small></div>';
        return;
      }

      // Dos formas de agrupar. La de tema es la de siempre; la de fecha arma un
      // grupo por MES —«qué te armé en agosto»— que es como se busca algo cuando no
      // se recuerda el nombre pero sí más o menos cuándo fue.
      var porFecha = AM._ord === 'fecha';
      var grupos = {}, orden = [];
      if (porFecha) {
        lista.slice()
          .sort(function (a, b) { return String(b.fecha || '').localeCompare(String(a.fecha || '')); })
          .forEach(function (a) {
            var k = String(a.fecha || '').slice(0, 7) || 'sin-fecha';
            if (!grupos[k]) { grupos[k] = []; orden.push(k); }
            grupos[k].push(a);
          });
      } else {
        lista.forEach(function (a) {
          var c = a.categoria || 'otros';
          (grupos[c] = grupos[c] || []).push(a);
        });
        orden = CAT_ORDER.slice();
        Object.keys(grupos).forEach(function (c) { if (orden.indexOf(c) < 0) orden.push(c); });
      }

      orden.forEach(function (k) {
        var items = grupos[k];
        if (!items || !items.length) return;
        var color = porFecha ? '#FFBF00' : (CAT_COLOR[k] || '#8a857b');
        var etiqueta = porFecha ? fmtMes(k) : (CAT_LABEL[k] || k);
        if (!porFecha) items.sort(function (a, b) {
          return String(b.fecha || '').localeCompare(String(a.fecha || ''));
        });
        var sec = document.createElement('section'); sec.className = 'am-sec';
        var h = document.createElement('div'); h.className = 'am-sec-h';
        h.innerHTML = '<span class="am-dot" style="background:' + color + '"></span>' +
          '<span>' + esc(etiqueta) + '</span>' +
          '<span class="am-ct">' + items.length + '</span>';
        sec.appendChild(h);
        var grid = document.createElement('div'); grid.className = 'am-grid';
        items.forEach(function (a) { grid.appendChild(AM._card(a, color)); });
        sec.appendChild(grid);
        box.appendChild(sec);
      });
    },

    _card: function (a, color) {
      var c = document.createElement('div');
      c.className = 'am-card';
      c.style.borderLeftColor = color;
      c.tabIndex = 0;
      c.setAttribute('role', 'button');
      var tiene = !!a.tieneFuente;
      var esPublica = !!a.url_publica;
      // El badge dice DÓNDE vive de verdad. Antes todo lo externo decía «claude.ai»,
      // y desde s9 la biblioteca también guarda carpetas en PDF del Drive: llamarlas
      // claude.ai era mentirle al que mira la tarjeta.
      var externa = a.url_publica || a.url_claude || '';
      var esDrive = externa.indexOf('drive.google.com') >= 0 || externa.indexOf('docs.google.com') >= 0;
      var accion = tiene ? '↥ Abrir acá' : (esDrive ? '↗ Abrir el documento' : '↗ Abrir en claude.ai');
      var badges = '';
      if (esPublica) badges += '<span class="am-badge pub" title="Publicada en la web">🌐 web</span>';
      badges += tiene ? '<span class="am-badge src">fuente propia</span>'
                      : (esDrive ? '<span class="am-badge ext">documento</span>'
                                 : '<span class="am-badge ext">claude.ai</span>');
      c.innerHTML =
        '<div class="am-h">' + esc(a.titulo || a.slug || '—') + '</div>' +
        '<div class="am-d">' + esc(a.desc || '') + '</div>' +
        '<div class="am-badges">' + badges + '</div>' +
        '<div class="am-foot"><span class="am-date">' + esc(fmtFecha(a.fecha)) + '</span>' +
        '<span class="am-open">' + accion + '</span></div>';

      function go() {
        if (tiene) { AM.abrirVisor(a); }
        else {
          var url = a.url_publica || a.url_claude;
          if (url) window.open(url, '_blank', 'noopener');
          else AM._toast('Este artifact no tiene ni fuente local ni link.', 'error');
        }
      }
      c.onclick = go;
      c.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
      return c;
    },

    // ── VISOR ("más grande, es mejor") ──────────────────────────────────────
    abrirVisor: function (a) {
      var view = document.getElementById('view-artifacts');
      if (!view) return;
      var webBtn = a.url_publica
        ? '<button class="btn btn-xs" id="am-web">🌐 Web propia</button>' : '';
      view.innerHTML =
        '<div class="am-visor" id="am-visor">' +
          '<div class="am-vbar">' +
            '<button class="btn btn-xs" id="am-volver">✕ Volver</button>' +
            '<div class="am-vttl" title="' + esc(a.titulo || '') + '">' + esc(a.titulo || a.slug) + '</div>' +
            '<div class="am-vacts">' +
              '<button class="btn btn-xs" id="am-retry" title="Si no carga, forzar la carga por otra vía">⟳</button>' +
              webBtn +
              '<button class="btn btn-xs" id="am-full" title="Pantalla completa">⛶ Pantalla completa</button>' +
            '</div>' +
          '</div>' +
          '<div class="am-frame-wrap"><iframe class="am-frame" id="am-frame" title="' + esc(a.titulo || 'artifact') +
            '" allow="fullscreen" referrerpolicy="no-referrer"></iframe></div>' +
        '</div>';

      var frame = document.getElementById('am-frame');
      AM._cargarFrame(a, frame);

      document.getElementById('am-volver').onclick = function () { AM.renderLista(); };
      document.getElementById('am-retry').onclick = function () { AM._blobFallback(a, frame); };
      document.getElementById('am-full').onclick = function () {
        var el = document.getElementById('am-visor');
        try {
          if (document.fullscreenElement) { document.exitFullscreen(); }
          else if (el.requestFullscreen) { el.requestFullscreen(); }
          else if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); }
          else { AM._toast('Tu navegador no soporta pantalla completa', 'error'); }
        } catch (e) { AM._toast('No pude poner pantalla completa: ' + e.message, 'error'); }
      };
      if (webBtn) document.getElementById('am-web').onclick = function () {
        window.open(a.url_publica, '_blank', 'noopener');
      };
    },

    // Primaria: iframe same-origin → la cookie de sesión del Office lo autentica
    // (probado E2E S199). Fallback: fetch con x-office-token → blob (los artifacts
    // son single-file, el blob funciona íntegro) por si la cookie no llegara.
    _cargarFrame: function (a, frame) {
      if (!frame) return;
      frame.onerror = function () { AM._blobFallback(a, frame); };
      frame.src = AM._base() + '/crm/artifacts/' + encodeURIComponent(a.slug) + '/';
    },
    _blobFallback: function (a, frame) {
      if (!frame) return;
      var h = {}; var t = AM._tok(); if (t) h['x-office-token'] = t;
      AM._toast('Cargando el artifact…', 'info');
      fetch(AM._base() + '/crm/artifacts/' + encodeURIComponent(a.slug) + '/', { headers: h, credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(function (html) {
          var b = new Blob([html], { type: 'text/html' });
          frame.onerror = null;
          frame.src = URL.createObjectURL(b);
        })
        .catch(function (e) { AM._toast('No pude cargar el artifact: ' + e.message, 'error'); });
    },

    // ── CSS ─────────────────────────────────────────────────────────────────
    _css: function () {
      return [
'#view-artifacts .am-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px;flex-wrap:wrap}',
'#view-artifacts .am-count{font-size:12.5px;color:var(--muted,#98938a);font-variant-numeric:tabular-nums;white-space:nowrap;padding-top:6px}',
// ── barra de búsqueda + chips (s8) ──
'#view-artifacts .am-bar{display:flex;flex-direction:column;gap:10px;margin:0 0 18px}',
'#view-artifacts .am-search{position:relative;display:flex;align-items:center;max-width:420px}',
'#view-artifacts .am-search-i{position:absolute;left:12px;font-size:13px;opacity:.65;pointer-events:none}',
'#view-artifacts #am-q{width:100%;min-height:44px;padding:10px 38px 10px 34px;border-radius:10px;',
'  border:1px solid var(--line,#2a2722);background:var(--panel-2,#1b1815);color:var(--fg,#efe9df);',
'  font-size:14.5px;outline:none;transition:border-color .15s,box-shadow .15s}',
'#view-artifacts #am-q::placeholder{color:var(--muted,#98938a)}',
'#view-artifacts #am-q:focus{border-color:#FFBF00;box-shadow:0 0 0 3px rgba(255,191,0,.16)}',
'#view-artifacts #am-q::-webkit-search-cancel-button{display:none}',
'#view-artifacts .am-x{position:absolute;right:6px;width:30px;height:30px;border:0;border-radius:8px;',
'  background:transparent;color:var(--muted,#98938a);cursor:pointer;font-size:13px;line-height:1}',
'#view-artifacts .am-x:hover{background:rgba(255,255,255,.07);color:var(--fg,#efe9df)}',
'#view-artifacts .am-chips{display:flex;flex-wrap:wrap;gap:7px}',
'#view-artifacts .am-chip{display:inline-flex;align-items:center;gap:7px;min-height:34px;padding:5px 12px;',
'  border-radius:999px;border:1px solid var(--line,#2a2722);background:transparent;color:var(--muted,#98938a);',
'  font-size:13px;cursor:pointer;transition:background .15s,color .15s,border-color .15s;white-space:nowrap}',
'#view-artifacts .am-chip:hover{background:rgba(255,255,255,.05);color:var(--fg,#efe9df)}',
'#view-artifacts .am-chip.on{background:rgba(255,191,0,.14);border-color:rgba(255,191,0,.5);color:#FFBF00}',
'#view-artifacts .am-chip .am-dot{width:7px;height:7px;border-radius:50%;flex:none}',
'#view-artifacts .am-chip-n{font-size:11.5px;opacity:.7;font-variant-numeric:tabular-nums}',
// ── fila 2 (s9): cuándo + cómo se agrupa ──
'#view-artifacts .am-fila2{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}',
'#view-artifacts .am-fechas{flex:1 1 auto;min-width:0}',
'#view-artifacts .am-chip-f.on{background:rgba(139,156,255,.14);border-color:rgba(139,156,255,.5);color:#8b9cff}',
'#view-artifacts .am-orden{display:inline-flex;flex:none;border:1px solid var(--line,#2a2722);border-radius:999px;padding:2px;gap:2px}',
'#view-artifacts .am-ord{min-height:30px;padding:4px 13px;border:0;border-radius:999px;background:transparent;',
'  color:var(--muted,#98938a);font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background .15s,color .15s}',
'#view-artifacts .am-ord:hover{color:var(--fg,#efe9df)}',
'#view-artifacts .am-ord.on{background:rgba(255,191,0,.14);color:#FFBF00}',
// El atributo hidden vale display:none, pero lo pone la hoja del NAVEGADOR y cualquier
// regla de autor con display se lo lleva puesto. Sin esta línea el panel del rango se ve siempre.
'#view-artifacts .am-rango[hidden]{display:none}',
'#view-artifacts .am-rango{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 12px;',
'  border:1px solid var(--line,#2a2722);border-radius:10px;background:var(--panel-2,#1b1815)}',
'#view-artifacts .am-rango label{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted,#98938a)}',
'#view-artifacts .am-rango input[type=date]{min-height:36px;padding:5px 9px;border-radius:8px;border:1px solid var(--line,#2a2722);',
'  background:var(--panel,#15151b);color:var(--fg,#efe9df);font-size:13px;color-scheme:dark}',
'@media(max-width:560px){#view-artifacts .am-fila2{align-items:stretch}',
// En el celular el toggle se aprieta con el pulgar: los 30px de escritorio quedan
// cortos. La caja es la que define la zona táctil, así que se agranda la caja.
'  #view-artifacts .am-orden{align-self:flex-start}#view-artifacts .am-ord{min-height:38px;padding:6px 16px}}',
'#view-artifacts .am-sec{margin-bottom:26px}',
'#view-artifacts .am-sec-h{display:flex;align-items:center;gap:10px;font-size:12.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--ink,#f2f2ee);padding-bottom:8px;margin-bottom:12px;border-bottom:1px solid var(--border,rgba(255,255,255,.09))}',
'#view-artifacts .am-dot{width:9px;height:9px;border-radius:2px;flex:0 0 auto}',
'#view-artifacts .am-sec-h .am-ct{margin-left:auto;font-size:11px;color:var(--muted,#98938a);font-weight:600;letter-spacing:.04em}',
'#view-artifacts .am-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px}',
'#view-artifacts .am-card{background:var(--panel,#15151b);border:1px solid var(--border,rgba(255,255,255,.09));border-left:3px solid #8a857b;border-radius:12px;padding:13px 15px;display:flex;flex-direction:column;gap:7px;cursor:pointer;transition:border-color .15s,transform .15s,background .15s}',
'#view-artifacts .am-card:hover{transform:translateY(-2px);background:var(--panel-2,#181818)}',
'#view-artifacts .am-card:focus-visible{outline:2px solid var(--gold,#ffbf00);outline-offset:2px}',
'#view-artifacts .am-card .am-h{font-size:14.5px;font-weight:700;line-height:1.25}',
'#view-artifacts .am-card .am-d{font-size:12.5px;color:var(--muted,#98938a);line-height:1.45;flex:1}',
'#view-artifacts .am-badges{display:flex;gap:6px;flex-wrap:wrap}',
'#view-artifacts .am-badge{font-size:10px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;padding:2px 7px;border-radius:999px;border:1px solid var(--border,rgba(255,255,255,.12));color:var(--muted,#98938a)}',
'#view-artifacts .am-badge.pub{color:#8b9cff;border-color:rgba(139,156,255,.4)}',
'#view-artifacts .am-badge.src{color:#37d29a;border-color:rgba(55,210,154,.35)}',
'#view-artifacts .am-badge.ext{color:var(--faint,#6a655c)}',
'#view-artifacts .am-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:2px}',
'#view-artifacts .am-date{font-size:11.5px;color:var(--faint,#6a655c);font-variant-numeric:tabular-nums}',
'#view-artifacts .am-open{font-size:12px;color:var(--gold,#ffbf00);font-weight:600}',
'#view-artifacts .am-empty{padding:30px;text-align:center;color:var(--muted,#98938a);border:1px dashed var(--border,rgba(255,255,255,.14));border-radius:12px}',
'#view-artifacts .am-empty code{background:rgba(255,191,0,.09);color:var(--gold,#ffbf00);padding:.05rem .35rem;border-radius:4px;font-size:.9em}',
// visor
'#view-artifacts .am-visor{display:flex;flex-direction:column;gap:10px}',
'#view-artifacts .am-vbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap}',
'#view-artifacts .am-vttl{font-weight:700;font-size:15px;flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'#view-artifacts .am-vacts{display:flex;gap:6px;align-items:center;flex:0 0 auto}',
'#view-artifacts .am-frame-wrap{position:relative;flex:1 1 auto;min-height:0;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:12px;overflow:hidden;background:#fff}',
'#view-artifacts .am-frame{display:block;width:100%;height:calc(100vh - 150px);min-height:520px;border:0;background:#fff}',
'#view-artifacts .am-visor:fullscreen{height:100vh;background:var(--bg,#0a0a0a);padding:10px;gap:8px}',
'#view-artifacts .am-visor:fullscreen .am-frame-wrap{border-radius:8px}',
'#view-artifacts .am-visor:fullscreen .am-frame{height:calc(100vh - 60px);min-height:0}',
'@media(max-width:640px){#view-artifacts .am-frame{height:calc(100vh - 190px)}}',
      ].join('\n');
    },
  };

  // ── helpers ───────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function fmtFecha(f) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(f || ''));
    if (!m) return f || '—';
    return parseInt(m[3], 10) + '-' + MESES[parseInt(m[2], 10) - 1] + '-' + m[1];
  }

  var MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function fmtMes(k) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(k || ''));
    if (!m) return 'Sin fecha';
    return MESES_L[parseInt(m[2], 10) - 1] + ' de ' + m[1];
  }

  // ── Aplanar el menú lateral (pedido de Franco, 2026-07-12) ────────────────
  // BROKERAGE / HOSPITALITY / PROYECTOS conservan su desplegable (tienen varias
  // secciones); el resto va DIRECTO a su contenido, sin submenú. SMART HOME pasa a
  // botón propio (antes vivía dentro del drawer de Infra). Vive acá y no en index.html
  // para no chocar con la sesión que está editando el front en paralelo (race-proof).
  // El hover-peek se apaga con CSS: si al pasar el mouse por un botón directo no queda
  // ningún panel activo, el drawer se oculta. Todo reversible (un solo archivo).
  function flattenNav() {
    if (window.__officeNavFlattened) return;
    if (typeof g.setModule !== 'function' || !document.querySelector('.nav-rail')) {
      return setTimeout(flattenNav, 200);   // esperar a que app.js defina setModule
    }
    // CSS: ocultar el drawer cuando no hay ningún panel activo (= hover sobre un directo)
    if (!document.getElementById('am-flatten-css')) {
      var st = document.createElement('style'); st.id = 'am-flatten-css';
      st.textContent = '.sidebar.nav-open .nav-drawer:not(:has(.drawer-panel.active)){opacity:0!important;pointer-events:none!important}';
      document.head.appendChild(st);
    }
    // BACK / IA / INFRA → click directo a su vista, sin abrir desplegable
    [['rail-home', 'home', 'home'], ['rail-backoffice', 'backoffice', 'canarian'], ['rail-ia', 'ia', 'agentes'], ['rail-infra', 'infra', 'infra']]
      .forEach(function (d) {
        var btn = document.getElementById(d[0]); if (!btn) return;
        btn.onclick = (function (mod, view) {
          return function () { g.setModule(mod, false); g.nav(view); };
        })(d[1], d[2]);
      });
    // quitar los desplegables que ya no se usan (así el hover no tiene nada que mostrar)
    ['drawer-home', 'drawer-backoffice', 'drawer-ia', 'drawer-infra'].forEach(function (id) {
      var p = document.getElementById(id); if (p && p.parentNode) p.parentNode.removeChild(p);
    });
    // SMART HOME → botón directo propio, pegado a Infra
    if (!document.getElementById('rail-smarthome')) {
      var infra = document.getElementById('rail-infra');
      if (infra && infra.parentNode) {
        var b = document.createElement('button');
        b.className = 'rail-btn'; b.id = 'rail-smarthome'; b.dataset.module = 'smarthome';
        b.setAttribute('title', 'Smart Home'); b.setAttribute('aria-label', 'Smart Home');
        b.onclick = function () { g.setModule('smarthome', false); g.nav('smarthome'); };
        b.innerHTML = '<span class="rail-icon" aria-hidden="true"><svg viewBox="0 0 24 24">' +
          '<path d="M15 14a5 5 0 0 0-6 0"/><path d="M17.66 11a8 8 0 0 0-11.32 0"/>' +
          '<path d="M6.34 8.34a12 12 0 0 1 11.32 0"/><line x1="12" y1="20" x2="12.01" y2="20" stroke-width="3" stroke-linecap="round"/>' +
          '</svg></span><span class="rail-label">SMART</span>';
        infra.parentNode.insertBefore(b, infra.nextSibling);
      }
    }
    // Re-anclar el grupo PERSONAL para que quede DESPUÉS de Smart Home (Smart Home es de
    // sistema, va pegado a Infra; luego Ideas/Minutas/Coach/Artifacts). Sobrescribe el
    // helper de minutas.js (que anclaba en rail-infra) — futuras llamadas usan esta versión.
    window._sortPersonalRail = function () {
      var anchor = document.getElementById('rail-smarthome') || document.getElementById('rail-infra');
      var r = anchor && anchor.parentNode; if (!r) return;
      var bs = Array.prototype.slice.call(r.querySelectorAll('.rail-btn[data-porder]'))
        .sort(function (a, b) { return (+a.dataset.porder) - (+b.dataset.porder); });
      var prev = anchor;
      bs.forEach(function (x) { r.insertBefore(x, prev.nextSibling); prev = x; });
    };
    window._sortPersonalRail();
    window.__officeNavFlattened = true;
  }

  // ── Enganche a nav() sin tocar app.js (race-proof) ────────────────────────
  function hook() {
    if (typeof g.nav !== 'function') return setTimeout(hook, 120);
    if (g.nav.__artifactsHooked) return;
    var prev = g.nav;
    g.nav = function (section) {
      prev.apply(this, arguments);
      if (section === 'artifacts') {
        if (g.setModule) g.setModule('artifacts', false);   // pinta rail-artifacts, sin drawer (fix highlight)
        AM.init();
      }
    };
    g.nav.__artifactsHooked = true;
    AM._ensureScaffold();   // instala el botón aunque index.html esté viejo
    flattenNav();
    // Deep-link bookmarkeable (pedido Franco 2026-07-16): …/office-pixel/#artifacts
    // abre la galería directo — "la página web donde están todos". El delay le da
    // aire a app.js para terminar su nav inicial; si algo falla, queda en Home.
    if (location.hash === '#artifacts') setTimeout(function () { try { g.nav('artifacts'); } catch (e) {} }, 400);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook);
  else hook();

  g.ArtifactsModule = AM;
})(window);
