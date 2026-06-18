/* Gringo Office Pixel — SPA futurista (S19 rewrite)
 * Reemplaza el Canvas/pixel lobby. Diseño: oro/negro glassmorphism.
 * Usa window.GO de api.js (apiFetch, prom, promAll, isLocal).
 * Sin dependencias externas — gauges dibujados con Canvas 2D nativo.
 * CSP-safe: sin cdn.jsdelivr.net, sin chart.js, connect-src same-origin.
 */
(function () {
  'use strict';

  const { apiFetch, prom, promAll } = window.GO;
  // S54.1 FIX: estos helpers viven dentro de este IIFE, pero los bloques agregados FUERA del IIFE
  // (Hermes Dock, Doc Inbox, Auditoría de cargas) los llaman por nombre → sin esto daban
  // ReferenceError al renderizar y la lista quedaba en skeleton ("badge carga, lista no").
  // escHtml es function declaration (hoisted), así que ya existe al asignarla acá.
  window.apiFetch = apiFetch;
  window.escHtml = escHtml;

  /* ─── STATE ────────────────────────────────────────────────────── */
  let canarianPin = null;
  let lockTimer   = null;
  let lockSecondsLeft = 300;
  let allTasks    = [];
  let profitData  = null;       // cached profitability response
  let occupancyData = null;     // cached occupancy response

  /* ─── CLOCK ────────────────────────────────────────────────────── */
  function tick() {
    const now = new Date();
    const arg = now.toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    var el = document.getElementById('sys-clock');
    if (el) el.textContent = 'ARG ' + arg;
    var dateEl = document.getElementById('home-date');
    if (dateEl) dateEl.textContent = now.toLocaleDateString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      weekday: 'short', day: 'numeric', month: 'short'
    });
  }
  setInterval(tick, 1000);
  tick();

  /* ─── TOAST ────────────────────────────────────────────────────── */
  function toast(msg, type) {
    type = type || 'ok';
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'show ' + type;
    setTimeout(function () { t.className = ''; }, 3200);
  }

  /* ─── MODAL ────────────────────────────────────────────────────── */
  function showModal(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }
  function hideModal(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay').forEach(function (m) {
        m.classList.add('hidden');
      });
    }
  });
  // expose for inline onclick
  window.showModal = showModal;
  window.hideModal = hideModal;
  window.toast = toast;

  /* ─── NAVIGATION ────────────────────────────────────────────────── */
  function nav(section) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
    document.querySelectorAll('.nav-btn').forEach(function (b) { b.classList.remove('active'); });
    var view = document.getElementById('view-' + section);
    if (view) view.classList.add('active');
    var btn  = document.getElementById('nav-' + section);
    if (btn)  btn.classList.add('active');

    if (section === 'home')      { loadHome(); }
    if (section === 'agentes')   { loadWispy(); loadBambiAgent(); loadAgentActivity('wispy'); }
    if (section === 'ambbi')     { loadAmbbiResumen(); renderPortfolio(); loadTasks(); }
    if (section === 'gebroker')  { loadCrm(); }
    if (section === 'documentos'){ if (window.loadDocAuditoria) window.loadDocAuditoria(); if (window.loadDocInbox) window.loadDocInbox(); }
    if (section === 'tasaciones'){ loadTasaciones(); }
    if (section === 'operaciones'){ loadCrmOperaciones(); }
    if (section === 'smarthome') { loadHue(); }
    if (section === 'infra')     { loadDocker(); }
    if (section === 'canarian')  { checkCanaSession(); }
  }
  window.nav = nav;

  /* ─── S80B1: grupos colapsables del sidebar (estado en localStorage) ── */
  function toggleNavGroup(key) {
    var g = document.querySelector('.nav-group[data-group="' + key + '"]');
    if (!g) return;
    var collapsed = g.classList.toggle('collapsed');
    var hdr = g.querySelector('.nav-group-header');
    if (hdr) hdr.setAttribute('aria-expanded', String(!collapsed));
    try {
      var st = JSON.parse(localStorage.getItem('navGroups') || '{}');
      st[key] = collapsed ? 'c' : 'o';
      localStorage.setItem('navGroups', JSON.stringify(st));
    } catch (e) { /* localStorage no disponible */ }
  }
  window.toggleNavGroup = toggleNavGroup;
  function initNavGroups() {
    try {
      var st = JSON.parse(localStorage.getItem('navGroups') || '{}');
      Object.keys(st).forEach(function (key) {
        if (st[key] !== 'c') return;
        var g = document.querySelector('.nav-group[data-group="' + key + '"]');
        if (!g) return;
        g.classList.add('collapsed');
        var hdr = g.querySelector('.nav-group-header');
        if (hdr) hdr.setAttribute('aria-expanded', 'false');
      });
    } catch (e) { /* localStorage no disponible */ }
  }

  /* ─── S80B2B: stubs / launchers (placeholders sin backend ni datos) ── */
  var STUBS = {
    petit:        { emoji: '🏗', title: 'AMBBI Petit', estado: 'En preparación', tipo: 'operativo',
      desc: 'Edificio AMBBI en formato petit — alquiler temporal. En etapa de incorporación.',
      pasos: ['Relevar unidades y superficies', 'Alta en CONFIG (Sistema Financiero)', 'iCal + tarifas por unidad', 'Fotos y fichas', 'Alta en RoboHost (cotizador)'],
      checklist: ['Unidades relevadas', 'Cargadas en CONFIG', 'iCal conectado', 'Tarifas base/finde', 'Fotos', 'RoboHost'] },
    italiano:     { emoji: '🏥', title: 'AMBBI Italiano', estado: 'En preparación', tipo: 'operativo',
      desc: 'Edificio en el polo Hospital Italiano — pipeline de apertura.',
      pasos: ['Cerrar acuerdo del edificio', 'Relevar unidades', 'Alta en CONFIG', 'iCal + tarifas', 'Fotos y publicación'],
      checklist: ['Acuerdo', 'Unidades relevadas', 'CONFIG', 'iCal', 'Tarifas', 'Publicación'] },
    nuevos:       { emoji: '🆕', title: 'Nuevos edificios AMBBI', estado: 'Pipeline', tipo: 'operativo',
      desc: 'Oportunidades de edificios en evaluación para incorporar al modelo AMBBI.',
      pasos: ['Relevar oportunidades', 'Due diligence comercial', 'Propuesta al propietario/desarrollador', 'Decisión'],
      checklist: ['Oportunidad detectada', 'Números', 'Propuesta enviada', 'Cerrado'] },
    miami:        { emoji: '🌴', title: 'Gringo Miami', estado: 'En desarrollo', tipo: 'venture',
      desc: 'Web de lujo para The Crosby (Miami). Reservas vía Airbnb (ReservationKey = fase 2).',
      pasos: ['Cerrar contenido y fotos', 'iCal de las unidades', 'Definir flujo de reservas', 'Dominio'], link: null },
    deco:         { emoji: '🕯', title: 'GringoDeco', estado: 'Pre-lanzamiento · landing LIVE', tipo: 'venture',
      desc: 'Marca propia de decoración — velas aromáticas/decorativas + aromatizantes.',
      pasos: ['Catálogo y fotos reales', 'Definir e-commerce', 'Cablear captura de leads', 'Dominio propio'], link: 'https://nueva-web-ambbi.vercel.app/deco' },
    pms:          { emoji: '⚙️', title: 'GringoPMS', estado: 'En desarrollo', tipo: 'venture',
      desc: 'Software propio de Property Management (Airbnb API + motor de reservas).',
      pasos: ['Definir alcance MVP', 'Integración Airbnb', 'Motor de reservas', 'Conectar con la operación AMBBI'], link: null },
    metropolitan: { emoji: '🏛', title: 'Metropolitan', estado: 'En preparación', tipo: 'hospitality',
      desc: 'Cartera propia (alquiler / sub-alquiler largos). Panel privado — sin datos cargados todavía.',
      pasos: ['Definir qué se gestiona acá', 'Cargar unidades (privado)', 'Vista de ocupación / cobros'],
      checklist: ['Unidades', 'Ocupación', 'Cobros'] },
    ambbiclean:   { emoji: '🧹', title: 'AMBBI Clean', estado: 'En preparación', tipo: 'hospitality',
      desc: 'Limpieza de unidades propias, oficinas y particulares — horas, clientes y cobranza.',
      pasos: ['Definir clientes y tarifas', 'Registro de horas', 'Cobranza mensual'],
      checklist: ['Clientes', 'Tarifas', 'Horas', 'Cobranza'] }
  };
  function renderStub(key) {
    var s = STUBS[key], v = document.getElementById('view-stub');
    if (!v || !s) return;
    var pasos = (s.pasos || []).map(function (p) { return '<li>' + escHtml(p) + '</li>'; }).join('');
    var checks = (s.checklist || []).map(function (c) { return '<div class="small" style="padding:3px 0;color:var(--muted);">☐ ' + escHtml(c) + '</div>'; }).join('');
    var link = s.link ? '<a class="btn btn-gold btn-sm" href="' + s.link + '" target="_blank" rel="noopener">Ver landing ↗</a>' : '';
    var resp = (s.tipo === 'operativo' || s.tipo === 'hospitality')
      ? '<div class="grid-2" style="margin-top:10px;"><div class="kpi" style="text-align:left;display:block;"><span>Responsable</span><strong>—</strong></div><div class="kpi" style="text-align:left;display:block;"><span>Fecha objetivo</span><strong>—</strong></div></div>' : '';
    v.innerHTML =
      '<div class="section-head"><h1>' + escHtml(s.title.toUpperCase()) + '</h1><span class="badge badge-muted">🚧 ' + escHtml(s.estado) + '</span></div>' +
      '<div class="card">' +
        '<div class="card-head"><div><h2 class="card-title">' + s.emoji + ' ' + escHtml(s.title) + '</h2><div class="card-sub">' + escHtml(s.desc) + '</div></div>' + link + '</div>' +
        (pasos ? '<div style="margin-top:10px;"><div class="small" style="color:var(--gold);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Próximos pasos</div><ul style="margin:0 0 0 18px;font-size:.84rem;line-height:1.8;">' + pasos + '</ul></div>' : '') +
        (checks ? '<div style="margin-top:12px;"><div class="small" style="color:var(--gold);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Checklist (placeholder)</div>' + checks + '</div>' : '') +
        resp +
        '<div class="small muted" style="margin-top:12px;">Módulo en preparación — sin conectar a backend. Se cableará cuando el proyecto avance.</div>' +
      '</div>';
  }
  function stub(key) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
    document.querySelectorAll('.nav-btn').forEach(function (b) { b.classList.remove('active'); });
    var view = document.getElementById('view-stub'); if (view) view.classList.add('active');
    var btn = document.getElementById('nav-stub-' + key); if (btn) btn.classList.add('active');
    renderStub(key);
  }
  window.stub = stub;

  /* ─── GAUGE (native Canvas 2D) ──────────────────────────────────
   * Draws a semi-circle arc gauge (left to right, bottom pivot).
   * pct: 0–100, color: stroke color string.
   */
  function drawGauge(canvasId, pct, color) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var W = canvas.width;
    var H = canvas.height;
    var cx = W / 2;
    var cy = H * 0.72;
    var r  = W * 0.38;
    var startAngle = Math.PI;          // left (180°)
    var endAngle   = 2 * Math.PI;     // right (360°)
    var fillAngle  = startAngle + (Math.PI * Math.min(Math.max(pct, 0), 100) / 100);

    ctx.clearRect(0, 0, W, H);

    // Track
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Fill
    if (pct > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, fillAngle);
      ctx.strokeStyle = color;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Glow
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, fillAngle);
      ctx.strokeStyle = color.replace(')', ', 0.3)').replace('rgb(', 'rgba(').replace('#', '');
      // fallback: just shadow
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  // Color by threshold
  function gaugeColor(pct) {
    if (pct >= 85) return '#ff7b7b';   // danger
    if (pct >= 65) return '#ffbb55';   // warn
    return '#4dde95';                   // ok
  }
  // Occupancy and cache use gold
  function gaugeColorAccent(pct) {
    return '#d4a640';
  }

  function setGauge(id, valId, pct, label, accentMode) {
    var color = accentMode ? gaugeColorAccent(pct) : gaugeColor(pct);
    drawGauge(id, pct, color);
    var el = document.getElementById(valId);
    if (el) {
      el.textContent = (pct !== null && pct !== undefined) ? Math.round(pct) + '%' : '—';
      el.style.color = (pct !== null) ? color : 'var(--muted)';
    }
  }

  /* ─── LOAD HOME (flat — everything visible, Promise.all) ─────────── */
  function loadHome() {
    // Fire all loaders in parallel — flat layout means all sections always visible
    Promise.all([
      loadSystemBar(),
      loadProfitability(),
      loadOccupancy(),
      loadExpenses(),
      loadGauges(),
      loadDocker(),
      loadBambiOps(),
      loadBambiInbox(),
      loadOpsTab(),
      loadOpsPipeline(),
      loadIAChart(),
      loadModelBars(),
      loadPulso(),
      loadBrainCard(),
      load3Pilares(),
      loadAlerts(),
      loadTokenMeters()
    ]).catch(function () {}); // individual loaders already handle errors
  }
  window.loadHome = loadHome;

  /* ─── NOTIFICATION BELL ─────────────────────────────────────────── */
  var notifItems = [];
  function toggleNotif() {
    var dd   = document.getElementById('notif-dropdown');
    var btn  = document.getElementById('notif-btn');
    if (!dd) return;
    var isOpen = !dd.classList.contains('hidden');
    dd.classList.toggle('hidden', isOpen);
    if (btn) btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    if (!isOpen) renderNotifDropdown();
  }
  window.toggleNotif = toggleNotif;

  // Close notif dropdown when clicking elsewhere
  document.addEventListener('click', function (e) {
    var dd = document.getElementById('notif-dropdown');
    var btn = document.getElementById('notif-btn');
    if (dd && btn && !dd.contains(e.target) && !btn.contains(e.target)) {
      dd.classList.add('hidden');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  });

  function addNotif(title, body, type) {
    notifItems.unshift({ title: title, body: body, type: type || 'info', ts: Date.now() });
    if (notifItems.length > 12) notifItems = notifItems.slice(0, 12);
    var badge = document.getElementById('notif-count');
    if (badge) badge.textContent = notifItems.length;
  }
  window.addNotif = addNotif;

  function renderNotifDropdown() {
    var el = document.getElementById('notif-list');
    if (!el) return;
    if (!notifItems.length) {
      el.innerHTML = '<div class="notif-empty">Sin notificaciones pendientes</div>';
      return;
    }
    var colorMap = { warn: 'var(--warn)', err: 'var(--danger)', ok: 'var(--ok)', info: 'var(--muted)' };
    el.innerHTML = notifItems.map(function (n) {
      var ago = Math.round((Date.now() - n.ts) / 60000);
      var agoStr = ago < 1 ? 'ahora' : ago + ' min atrás';
      return '<div class="notif-item">' +
        '<strong style="color:' + (colorMap[n.type] || 'var(--text)') + '">' + escHtml(n.title) + '</strong>' +
        '<p>' + escHtml(n.body) + ' <span style="opacity:.5;font-size:.68rem;">' + agoStr + '</span></p>' +
        '</div>';
    }).join('');
  }

  /* ─── PULSO EJECUTIVO ───────────────────────────────────────────── */
  async function loadPulso() {
    // Derive pulso from the data already being fetched
    // We just read cached values after other loaders complete
    // If no cached data yet, fetch minimal needed
    var pctEl  = document.getElementById('kpi-ocup');
    var pctStr = pctEl ? pctEl.textContent : '';
    var ocup   = pctStr && pctStr !== '—' ? pctStr : null;

    // Bambi escalated from bambi-ops if already loaded
    var bambiTile = document.querySelector('.bambi-tile strong[style*="warn"]');
    var escalated = bambiTile ? bambiTile.textContent : null;

    // Build pulso signals
    var focoEl = document.getElementById('pulso-foco');
    var proxEl = document.getElementById('pulso-proximo');
    var riskEl = document.getElementById('pulso-riesgo');
    var descEl = document.getElementById('pulso-desc');

    if (focoEl) focoEl.textContent = ocup ? 'Ocupación ' + ocup : 'Brief ejecutivo · cargando datos…';
    if (proxEl) proxEl.textContent = 'Cierre mensual CFO · sincronización iCal';
    if (riskEl) {
      var esc = escalated ? parseInt(escalated) : null;
      riskEl.textContent = esc !== null && esc > 0 ? 'Bambi escalados: ' + esc : 'Sin alertas activas';
      if (riskEl) riskEl.style.color = (esc && esc > 0) ? 'var(--warn)' : 'var(--ok)';
    }
    if (descEl) descEl.textContent = 'Pulso del ecosistema Gringo Labs · ' + new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  window.loadPulso = loadPulso;

  /* ─── BRAIN CARD (Cerebro de Wispy) ─────────────────────────────── */
  async function loadBrainCard() {
    var status = await apiFetch('/wispy/status');
    var ahora  = document.getElementById('brain-ahora');
    var ejec   = document.getElementById('brain-ejecutando');
    var superv = document.getElementById('brain-supervisando');
    var ultimo = document.getElementById('brain-ultimo');

    if (!status || status.__error) {
      if (ahora)  ahora.innerHTML  = '<span class="warn-text">Sin conexión al bridge</span>';
      if (ejec)   ejec.textContent  = '—';
      if (superv) superv.textContent = '—';
      if (ultimo) ultimo.textContent = '—';
      return;
    }

    var model    = status.model || 'desconocido';
    var waStatus = status.wa_status || '—';
    var isOnline = waStatus === 'WORKING';

    if (ahora)  ahora.innerHTML  = '<span class="highlight">' + escHtml(model) + '</span> · WA <span class="' + (isOnline ? 'ok-text' : 'warn-text') + '">' + escHtml(waStatus) + '</span>';
    if (ejec)   ejec.textContent  = 'Procesando mensajes WhatsApp · rutinas automáticas';
    if (superv) superv.innerHTML  = 'iCal calendarios · CFO snapshot · tareas Notion';
    if (ultimo) {
      var seriesArr = status['series_72h'] || null;
      if (seriesArr && seriesArr.length) {
        var last = seriesArr[seriesArr.length - 1];
        ultimo.textContent = 'tokens: ' + (last.tokens ? Math.round(last.tokens).toLocaleString('es-AR') : '—');
      } else {
        ultimo.textContent = 'Bridge online · sincronizado';
      }
    }
    addNotif('Wispy activo', 'WA: ' + waStatus + ' · Modelo: ' + model, isOnline ? 'ok' : 'warn');
  }
  window.loadBrainCard = loadBrainCard;

  /* ─── IA CHART — 72h Line Chart (native Canvas 2D) ─────────────── */
  function drawLineChart(canvasId, series, opts) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var parent = canvas.parentElement;
    var W = parent ? parent.clientWidth - 20 : 400;
    var H = parent ? parent.clientHeight - 20 : 160;
    if (H < 60) H = 160;
    canvas.width  = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    var padL = 36, padR = 10, padT = 12, padB = 28;
    var cW = W - padL - padR;
    var cH = H - padT - padB;

    if (!series || !series.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sin datos de serie temporal', W / 2, H / 2);
      return;
    }

    var vals = series.map(function (p) { return p.v; });
    var maxV = Math.max.apply(null, vals) || 1;
    var minV = Math.min.apply(null, vals);
    var range = maxV - minV || 1;

    // Grid lines
    var gridLines = 4;
    for (var g = 0; g <= gridLines; g++) {
      var gy = padT + cH - (cH * g / gridLines);
      ctx.beginPath();
      ctx.moveTo(padL, gy);
      ctx.lineTo(padL + cW, gy);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Y label
      var yVal = minV + (range * g / gridLines);
      ctx.fillStyle = 'rgba(159,152,141,0.7)';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(yVal).toLocaleString('es-AR'), padL - 4, gy + 3);
    }

    // X axis labels (sample every nth)
    var step = Math.max(1, Math.floor(series.length / 6));
    series.forEach(function (p, i) {
      if (i % step !== 0 && i !== series.length - 1) return;
      var x = padL + (cW * i / (series.length - 1 || 1));
      var label = p.label || '';
      ctx.fillStyle = 'rgba(159,152,141,0.6)';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, H - 6);
    });

    // Line + fill
    var color = opts && opts.color ? opts.color : '#d4a640';
    ctx.beginPath();
    series.forEach(function (p, i) {
      var x = padL + (cW * i / (series.length - 1 || 1));
      var y = padT + cH - (cH * (p.v - minV) / range);
      if (i === 0) ctx.moveTo(x, y);
      else         ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Gradient fill
    var grad = ctx.createLinearGradient(0, padT, 0, padT + cH);
    grad.addColorStop(0,   color.replace(')', ',0.18)').replace('rgb(','rgba(').replace('#d4a640','rgba(212,166,64,0.18)'));
    grad.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.beginPath();
    series.forEach(function (p, i) {
      var x = padL + (cW * i / (series.length - 1 || 1));
      var y = padT + cH - (cH * (p.v - minV) / range);
      if (i === 0) ctx.moveTo(x, y);
      else         ctx.lineTo(x, y);
    });
    ctx.lineTo(padL + cW, padT + cH);
    ctx.lineTo(padL, padT + cH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }

  async function loadIAChart() {
    // Try /telemetry first, then /wispy/status for series_72h
    var tel = await apiFetch('/telemetry');
    var series = null;

    if (tel && !tel.__error && tel.series) {
      series = tel.series;
    } else {
      var ws = await apiFetch('/wispy/status');
      if (ws && !ws.__error && ws['series_72h']) series = ws['series_72h'];
    }

    // Normalize series to [{v, label}]
    var normalized = [];
    if (Array.isArray(series) && series.length) {
      series.forEach(function (p, i) {
        var v = typeof p === 'number' ? p : (p.tokens || p.value || p.v || 0);
        var ts = p.ts || p.timestamp || p.time || null;
        var label = '';
        if (ts) {
          var d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts);
          label = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        } else {
          label = (i % 8 === 0) ? (Math.round(i * 72 / (series.length || 1)) + 'h') : '';
        }
        normalized.push({ v: v, label: label });
      });
    } else {
      // Fallback: generate flat placeholder data so chart still renders
      for (var i2 = 0; i2 < 24; i2++) {
        normalized.push({ v: 0, label: i2 % 4 === 0 ? (i2 * 3 + 'h') : '' });
      }
    }

    // Resize canvas to parent before drawing
    var canvas = document.getElementById('chart-ia-72h');
    if (canvas) {
      var parent = canvas.closest('.chart-stage');
      if (parent) {
        canvas.style.height = (parent.clientHeight - 20) + 'px';
      }
    }

    drawLineChart('chart-ia-72h', normalized, { color: '#d4a640' });

    // Update KPIs
    var [tokens, cost] = await Promise.all([
      prom('wispy_current_session_tokens{kind="total"}'),
      prom('wispy_current_session_cost_usd')
    ]);
    var labsTok  = document.getElementById('kpi-tokens-labs');
    var labsCost = document.getElementById('kpi-cost-labs');
    var labsGw   = document.getElementById('kpi-gateway-labs');
    if (labsTok)  labsTok.textContent  = tokens !== null ? Math.round(tokens).toLocaleString('es-AR') : '—';
    if (labsCost) labsCost.textContent = cost   !== null ? '$' + parseFloat(cost).toFixed(4) : '$—';
    var gwOnline = await prom('wispy_gateway_online');
    if (labsGw) {
      labsGw.textContent = gwOnline === 1 ? 'Online' : (gwOnline === null ? '—' : 'Offline');
      labsGw.style.color = gwOnline === 1 ? 'var(--ok)' : 'var(--warn)';
    }
  }
  window.loadIAChart = loadIAChart;

  /* ─── MODEL BARS (horizontal sorted bar chart) ───────────────────── */
  async function loadModelBars() {
    var el = document.getElementById('model-bars-content');
    if (!el) return;
    el.innerHTML = '<div class="skeleton skeleton-block" style="height:160px;"></div>';

    // Try Prometheus promAll for per-model tokens
    var byModel = await promAll('wispy_model_total_tokens');

    // Fallback: try telemetry endpoint
    if (!byModel || !byModel.length) {
      var tel = await apiFetch('/telemetry');
      if (tel && !tel.__error && tel.byModel) {
        byModel = Object.keys(tel.byModel).map(function (k) {
          return { labels: { model: k }, value: tel.byModel[k] };
        });
      }
    }

    if (!byModel || !byModel.length) {
      el.innerHTML = '<span style="color:var(--muted);font-size:.82rem;">Sin datos por modelo · Prometheus sin métricas wispy_model_total_tokens</span>';
      return;
    }

    // Sort descending by value
    var sorted = byModel.slice().sort(function (a, b) { return b.value - a.value; });
    var maxVal = sorted[0] ? sorted[0].value : 1;
    var palette = ['#d4a640', '#4dde95', '#7ec8e3', '#a78bfa', '#ffbb55', '#5b9cf6', '#ff7b7b'];

    el.innerHTML = '<div style="display:grid;gap:8px;margin-top:4px;">' +
      sorted.map(function (m, i) {
        var label = (m.labels && (m.labels.model || m.labels.name)) || ('modelo-' + i);
        var pct = maxVal ? Math.round(m.value * 100 / maxVal) : 0;
        var color = palette[i % palette.length];
        var valStr = m.value >= 1000
          ? Math.round(m.value / 1000).toLocaleString('es-AR') + 'k'
          : Math.round(m.value).toLocaleString('es-AR');
        return '<div class="expense-row">' +
          '<span class="expense-label" title="' + escHtml(label) + '">' + escHtml(label) + '</span>' +
          '<div class="expense-track"><div class="expense-fill" style="width:' + pct + '%;background:' + color + ';opacity:.8;"></div></div>' +
          '<span class="expense-val" style="color:' + color + ';">' + valStr + '</span>' +
          '</div>';
      }).join('') +
    '</div>';
  }
  window.loadModelBars = loadModelBars;

  /* ─── SYSTEM BAR ─────────────────────────────────────────────────── */
  async function loadSystemBar() {
    // Gateway / sessions from Prometheus
    var [gwOnline, sessActive, docker] = await Promise.all([
      prom('wispy_gateway_online'),
      prom('wispy_sessions_active'),
      apiFetch('/docker')
    ]);

    // Gateway status
    var sbGw = document.getElementById('sb-gateway');
    if (sbGw) {
      var gwOk = gwOnline === 1;
      sbGw.innerHTML = '<span class="dot ' + (gwOk ? 'ok' : 'err') + '"></span>' + (gwOk ? 'Online' : 'Offline');
    }
    var kpiGw = document.getElementById('kpi-gateway');
    if (kpiGw) kpiGw.textContent = gwOnline === 1 ? 'Online' : (gwOnline === null ? '—' : 'Offline');
    var kpiSess = document.getElementById('kpi-sessions');
    if (kpiSess) kpiSess.textContent = 'sesiones: ' + (sessActive !== null ? sessActive : '—');
    var sbSess = document.getElementById('sb-sessions');
    if (sbSess) sbSess.textContent = sessActive !== null ? sessActive : '—';

    // Docker
    if (docker && (docker.summary || docker.containers)) {
      var running = docker.summary ? docker.summary.running
        : docker.containers.filter(function (c) { return /up|running/.test((c.status || '').toLowerCase()); }).length;
      var total = docker.summary ? docker.summary.total : docker.containers.length;
      var sbDock = document.getElementById('sb-docker');
      if (sbDock) sbDock.innerHTML = '<span class="dot ' + (running === total ? 'ok' : 'warn') + '"></span>' + running + '/' + total;
      var kpiDock = document.getElementById('kpi-docker');
      if (kpiDock) kpiDock.textContent = running + ' / ' + total;
    }

    // Tokens + cost from Prometheus
    var [tokens, cost] = await Promise.all([
      prom('wispy_current_session_tokens{kind="total"}'),
      prom('wispy_current_session_cost_usd')
    ]);
    var tokStr  = tokens !== null ? Math.round(tokens).toLocaleString('es-AR') : '—';
    var costStr = cost   !== null ? '$' + parseFloat(cost).toFixed(4) : '$—';
    var gwStr   = gwOnline === 1 ? 'Online' : (gwOnline === null ? '—' : 'Offline');

    var kpiTok = document.getElementById('kpi-tokens');
    if (kpiTok) kpiTok.textContent = tokStr;
    var kpiCost = document.getElementById('kpi-cost');
    if (kpiCost) kpiCost.textContent = costStr;

    // Mirror into Labs sub-tab KPIs
    var labsTok = document.getElementById('kpi-tokens-labs');
    if (labsTok) labsTok.textContent = tokStr;
    var labsCost = document.getElementById('kpi-cost-labs');
    if (labsCost) labsCost.textContent = costStr;
    var labsGw = document.getElementById('kpi-gateway-labs');
    if (labsGw) { labsGw.textContent = gwStr; labsGw.style.color = gwOnline === 1 ? 'var(--ok)' : 'var(--warn)'; }
  }

  /* ─── GAUGES ─────────────────────────────────────────────────────── */
  async function loadGauges() {
    var [cpu, ramAvail, ramTotal, diskAvail, diskTotal, cache] = await Promise.all([
      prom('100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'),
      prom('node_memory_MemAvailable_bytes'),
      prom('node_memory_MemTotal_bytes'),
      prom('node_filesystem_avail_bytes{mountpoint="/"}'),
      prom('node_filesystem_size_bytes{mountpoint="/"}'),
      prom('wispy_cache_efficiency_percent')
    ]);

    var ramPct  = (ramAvail !== null && ramTotal) ? (100 * (1 - ramAvail / ramTotal)) : null;
    var diskPct = (diskAvail !== null && diskTotal) ? (100 - diskAvail * 100 / diskTotal) : null;

    setGauge('g-cpu',   'gv-cpu',   cpu,     'CPU');
    setGauge('g-ram',   'gv-ram',   ramPct,  'RAM');
    setGauge('g-disk',  'gv-disk',  diskPct, 'Disco');
    setGauge('g-cache', 'gv-cache', cache,   'Cache',  true);

    // Occupancy gauge uses cached data if available, otherwise fetch
    if (occupancyData) {
      var ocupPct = occupancyData.occupancyPct !== undefined
        ? occupancyData.occupancyPct * 100
        : (occupancyData.occupancy30d || null);
      setGauge('g-ocup', 'gv-ocup', ocupPct, 'Ocup', true);
    } else {
      var oData = await apiFetch('/occupancy?days=30&company=all');
      if (oData && !oData.__error) {
        occupancyData = oData;
        var pctVal = oData.occupancyPct !== undefined
          ? oData.occupancyPct * 100
          : (oData.occupancy30d || null);
        setGauge('g-ocup', 'gv-ocup', pctVal, 'Ocup', true);
        // update KPI bar
        var sbOcup = document.getElementById('sb-ocup');
        if (sbOcup && pctVal !== null) sbOcup.textContent = Math.round(pctVal) + '%';
        var kpiOcup = document.getElementById('kpi-ocup');
        if (kpiOcup && pctVal !== null) kpiOcup.textContent = Math.round(pctVal) + '%';
      } else {
        setGauge('g-ocup', 'gv-ocup', null, 'Ocup', true);
      }
    }
  }
  window.loadGauges = loadGauges;

  /* ─── DOCKER ─────────────────────────────────────────────────────── */
  async function loadDocker() {
    var d = await apiFetch('/docker');
    var grid = document.getElementById('docker-grid');
    if (!grid) return;
    if (!d || !d.containers) {
      grid.innerHTML = '<span style="color:var(--muted);font-size:.82rem;">Sin datos de Docker</span>';
      return;
    }
    var containers = d.containers;
    var running = containers.filter(function (c) { return /up|running/.test((c.status || '').toLowerCase()); }).length;

    // Update KPIs
    var kpiDock = document.getElementById('kpi-docker');
    if (kpiDock) kpiDock.textContent = running + ' / ' + containers.length;
    var sbDock = document.getElementById('sb-docker');
    if (sbDock) sbDock.innerHTML = '<span class="dot ' + (running === containers.length ? 'ok' : 'warn') + '"></span>' + running + '/' + containers.length + ' UP';

    // Resumen del stack
    var cpuSum = containers.reduce(function (s, c) { return s + (c.cpuPercent || 0); }, 0);
    var memSum = containers.reduce(function (s, c) { return s + ((c.memory && c.memory.usageMiB) || 0); }, 0);
    var sumEl = document.getElementById('stack-summary');
    if (sumEl) sumEl.innerHTML =
      '<div class="stat-item"><span>Contenedores</span><strong style="color:' + (running === containers.length ? 'var(--ok)' : 'var(--warn)') + '">' + running + ' / ' + containers.length + ' UP</strong></div>' +
      '<div class="stat-item"><span>CPU total</span><strong>' + cpuSum.toFixed(1) + '%</strong></div>' +
      '<div class="stat-item"><span>Memoria usada</span><strong>' + (memSum >= 1024 ? (memSum / 1024).toFixed(1) + ' GiB' : Math.round(memSum) + ' MiB') + '</strong></div>';

    // Mapa por capas
    var LAYERS = [
      { label: 'IA & Agentes',     re: /gringo_agents|wispy_core|ollama|whisper|robohost/i },
      { label: 'WhatsApp & Comms', re: /evolution|outbound/i },
      { label: 'Web & Bridge',     re: /bridge|cloudflared|n8n|miami/i },
      { label: 'Datos & Sync',     re: /redis|postgres|syncthing|notes/i },
      { label: 'Observabilidad',   re: /grafana|prometheus|cadvisor|exporter|dozzle/i }
    ];
    var maxMem = Math.max.apply(null, containers.map(function (c) { return (c.memory && c.memory.usageMiB) || 0; }).concat([1]));
    function nodeHtml(c) {
      var ok = /up|running/.test((c.status || '').toLowerCase());
      var cpu = c.cpuPercent || 0;
      var memMiB = (c.memory && c.memory.usageMiB) || 0;
      var cpuW = Math.max(cpu > 0 ? 2 : 0, Math.min(100, cpu));
      var memW = Math.max(memMiB > 0 ? 2 : 0, Math.round(memMiB / maxMem * 100));
      var memStr = memMiB >= 1024 ? (memMiB / 1024).toFixed(1) + 'G' : Math.round(memMiB) + 'M';
      return '<div class="stack-node">' +
        '<div class="sn-head"><span class="dot ' + (ok ? 'ok' : 'err') + '"></span><span class="sn-name" title="' + escHtml(c.name || '') + '">' + escHtml((c.name || '—').replace(/^wispy_|^gringo_/, '')) + '</span><span class="sn-up">' + escHtml(c.uptime || '') + '</span></div>' +
        '<div class="sn-bar"><span>CPU</span><div class="mb"><i style="width:' + cpuW + '%"></i></div><b>' + cpu.toFixed(1) + '%</b></div>' +
        '<div class="sn-bar"><span>MEM</span><div class="mb mb-metro"><i style="width:' + memW + '%"></i></div><b>' + memStr + '</b></div>' +
      '</div>';
    }
    var assigned = {};
    var html = '';
    LAYERS.forEach(function (L) {
      var nodes = containers.filter(function (c) { return !assigned[c.name] && L.re.test(c.name || ''); });
      nodes.forEach(function (n) { assigned[n.name] = true; });
      if (!nodes.length) return;
      html += '<div class="stack-layer"><div class="stack-layer-label">' + L.label + ' <em>' + nodes.length + '</em></div><div class="stack-nodes">' + nodes.map(nodeHtml).join('') + '</div></div>';
    });
    var rest = containers.filter(function (c) { return !assigned[c.name]; });
    if (rest.length) html += '<div class="stack-layer"><div class="stack-layer-label">Otros <em>' + rest.length + '</em></div><div class="stack-nodes">' + rest.map(nodeHtml).join('') + '</div></div>';
    grid.innerHTML = html;
  }
  window.loadDocker = loadDocker;

  /* ─── 3 PILARES (GringoLabs / AMBBI / Metropolitan) ─── */
  async function load3Pilares() {
    function fmtM(v) { if (v == null) return '—'; var p = Math.abs(v) <= 1 ? v * 100 : v; return Math.round(p) + '%'; }
    function fmtU(v) { if (v == null) return '—'; return '$' + parseFloat(v).toLocaleString('es-AR', { maximumFractionDigits: 0 }); }
    // GringoLabs: stack (containers UP) + tokens
    try {
      var dk = await apiFetch('/docker');
      var st = await apiFetch('/wispy/status');
      var labs = document.getElementById('pil-labs'), sub = document.getElementById('pil-labs-sub');
      if (labs) {
        if (dk && !dk.__error && dk.containers && dk.containers.length) {
          var up = dk.containers.filter(function (c) { return /up|running/.test(((c.status || '') + '').toLowerCase()); }).length;
          labs.textContent = '🟢 ' + up + '/' + dk.containers.length;
        } else { labs.textContent = '🟢 Online'; }
      }
      if (sub) {
        var md = (st && !st.__error && st.model) ? st.model : 'gpt-5.5';
        var tt = (st && !st.__error) ? (st.tokens_total || 0) : 0;
        var tStr = Number(tt).toLocaleString('es-AR');
        sub.textContent = md + ' · ' + tStr + ' tok';
      }
    } catch (e) {}
    // AMBBI + Metropolitan: rentabilidad (misma forma que loadProfitability)
    try {
      var d = await apiFetch('/business/profitability?empresa=all');
      var co = (d && !d.__error && d.companies) ? d.companies : {};
      var a = co.Ambbi || {}, m = co.Metropolitan || {};
      var ea = document.getElementById('pil-ambbi'), eas = document.getElementById('pil-ambbi-sub');
      if (ea) ea.textContent = fmtM(a.margenPct);
      if (eas) eas.textContent = 'ingresos ' + fmtU(a.ingresosUSD);
      var em = document.getElementById('pil-metro'), ems = document.getElementById('pil-metro-sub');
      if (em) em.textContent = fmtM(m.margenPct);
      if (ems) ems.textContent = 'ingresos ' + fmtU(m.ingresosUSD);
    } catch (e) {}
  }
  window.load3Pilares = load3Pilares;

  /* ─── ALERTAS URGENTES (reusa bambi-analytics + wispy/status + tasks) ─── */
  async function loadAlerts() {
    var el = document.getElementById('alerts-list');
    if (!el) return;
    var items = [];
    try {
      var b = await apiFetch('/agents/bambi-analytics');
      if (b && !b.__error && (b.escalated || 0) > 0)
        items.push({ ico: '🔴', txt: b.escalated + ' huésped(es) escalado(s) a Mano Derecha (Bambi)', col: 'var(--danger)' });
    } catch (e) {}
    try {
      var st = await apiFetch('/wispy/status');
      if (st && !st.__error && st.wa_status && st.wa_status !== 'connected' && st.wa_status !== 'unknown')
        items.push({ ico: '⚠️', txt: 'WhatsApp: ' + st.wa_status + ' — revisar conexión', col: 'var(--warn)' });
    } catch (e) {}
    try {
      var t = await apiFetch('/tasks');
      var urg = 0;
      if (t && !t.__error) {
        if (Array.isArray(t.all)) urg = t.all.filter(function (x) { return ((x.prioridad || x.priority || '') + '').toLowerCase() === 'urgente'; }).length;
        if (!urg && Array.isArray(t.urgent_personal)) urg = t.urgent_personal.length;
      }
      if (urg > 0) items.push({ ico: '🔥', txt: urg + ' tarea(s) urgente(s) en TASK OS', col: 'var(--gold)' });
    } catch (e) {}

    if (!items.length) { el.innerHTML = '<div class="small muted">✅ Sin alertas urgentes ahora.</div>'; return; }
    el.innerHTML = items.map(function (a) {
      return '<div style="display:flex;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.05);">' +
        '<span>' + a.ico + '</span><span style="color:' + a.col + ';font-size:.85rem;">' + a.txt + '</span></div>';
    }).join('');
  }
  window.loadAlerts = loadAlerts;

  /* ─── TOKENS · MEDIDORES (Motor IA O2) ─── */
  function fmtTok(n) { return (Number(n) || 0).toLocaleString('es-AR'); }
  async function loadTokenMeters() {
    // Wispy gateway (gpt-5.5) — tokens reales del entorno (= total GringoLabs)
    try {
      var st = await apiFetch('/wispy/status');
      var w = document.getElementById('tok-wispy'), ws = document.getElementById('tok-wispy-sub');
      if (st && !st.__error) {
        if (w) w.textContent = fmtTok(st.tokens_total || 0) + ' tok';
        if (ws) ws.textContent = (st.model || 'gpt-5.5') + ' · total GringoLabs';
        var w24 = document.getElementById('tok-wispy-24h');
        if (w24) w24.textContent = fmtTok(st.tokens_24h || 0) + ' tok';
        var wc = document.getElementById('tok-wispy-cost');
        if (wc) wc.textContent = 'costo $' + (st.cost_24h != null ? Number(st.cost_24h).toFixed(2) : '0.00') + ' · ' + (st.iterations_24h || 0) + ' iteraciones';
      }
    } catch (e) {}
    // Bambi + actividad por agente (history-db) — mensajes reales (tokens locales/ollama = sin costo)
    try {
      var at = await apiFetch('/agent-tokens');
      var ags = (at && !at.__error && at.agents) ? at.agents : [];
      var bambi = ags.find(function (a) { return a.agent === 'bambi'; });
      var wisp = ags.find(function (a) { return a.agent === 'wispy'; });
      var b = document.getElementById('tok-bambi'), bs = document.getElementById('tok-bambi-sub');
      if (b) b.textContent = (bambi ? bambi.turns : 0) + ' mensajes';
      if (bs) bs.textContent = 'ollama local · sin costo';
      var foot = document.getElementById('token-meters-foot');
      if (foot) foot.innerHTML = 'Actividad runtime: 🤖 Wispy <b>' + (wisp ? wisp.turns : 0) + '</b> · 🦌 Bambi <b>' + (bambi ? bambi.turns : 0) + '</b> mensajes · <span style="opacity:.7">tokens exactos por agente = próximo (O2b)</span>';
    } catch (e) {}
    // Claude Code (dev) — cc-stats
    try {
      var cc = await apiFetch('/stats/cc');
      var c = document.getElementById('tok-cc'), cs = document.getElementById('tok-cc-sub');
      if (cc && !cc.__error && cc.summary) {
        var tot = cc.summary.tokensTotal || 0;
        var out = cc.summary.tokens ? (cc.summary.tokens.output || 0) : 0;
        var cr = cc.summary.tokens ? (cc.summary.tokens.cacheRead || 0) : 0;
        var cachePct = tot ? Math.round(cr / tot * 100) : 0;
        if (c) c.textContent = fmtTok(tot) + ' tok';
        if (cs) cs.textContent = 'output real ' + fmtTok(out) + ' · ' + cachePct + '% cache';
        var el2 = document.getElementById('tok-cc-out');
        if (el2) el2.textContent = fmtTok(out) + ' tok';
        el2 = document.getElementById('tok-cc-cache');
        if (el2) el2.textContent = fmtTok(cr) + ' tok';
        el2 = document.getElementById('tok-cc-cachepct');
        if (el2) el2.textContent = cachePct + '% del total (barato, contexto releído)';
        el2 = document.getElementById('tok-cc-sessions');
        if (el2) el2.textContent = (cc.summary.sessions || 0);
        el2 = document.getElementById('tok-cc-days');
        if (el2) el2.textContent = (cc.summary.activeDays || 0) + ' días activos · racha ' + (cc.summary.currentStreak || 0);
      }
    } catch (e) {}
  }
  window.loadTokenMeters = loadTokenMeters;

  /* ─── PROFITABILITY ──────────────────────────────────────────────── */
  async function loadProfitability() {
    var d = await apiFetch('/business/profitability?empresa=all');
    var grid = document.getElementById('profit-grid');
    var periodEl = document.getElementById('profit-period');
    if (!d || d.__error || !d.companies) {
      if (grid) grid.innerHTML = '<span style="color:var(--muted);font-size:.82rem;">Sin datos de rentabilidad — ejecutá el snapshot CFO.</span>';
      return;
    }
    profitData = d;

    // Period label
    var ambbi = d.companies.Ambbi || {};
    var metro = d.companies.Metropolitan || {};
    if (periodEl) {
      var mes  = ambbi.mes  || metro.mes  || '—';
      var anio = ambbi.anio || metro.anio || '';
      periodEl.textContent = mes + ' ' + anio;
    }

    // Update sidebar KPIs
    function fmtMargen(v) {
      if (v === null || v === undefined) return '—';
      // ratio <= 1 means it's a decimal fraction
      var pct = Math.abs(v) <= 1 ? (v * 100) : v;
      return (pct >= 0 ? '' : '') + Math.round(pct) + '%';
    }
    function fmtUSD(v) {
      if (v === null || v === undefined) return '—';
      return '$' + parseFloat(v).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    function colorMargen(v) {
      if (v === null || v === undefined) return 'var(--muted)';
      var pct = Math.abs(v) <= 1 ? (v * 100) : v;
      return pct >= 15 ? 'var(--ok)' : pct >= 0 ? 'var(--warn)' : 'var(--danger)';
    }

    var kpiMA = document.getElementById('kpi-margen-ambbi');
    if (kpiMA) { kpiMA.textContent = fmtMargen(ambbi.margenPct); kpiMA.style.color = colorMargen(ambbi.margenPct); }
    var kpiIA = document.getElementById('kpi-ingresos-ambbi');
    if (kpiIA) kpiIA.textContent = 'ingresos: ' + fmtUSD(ambbi.ingresosUSD);

    var kpiMM = document.getElementById('kpi-margen-metro');
    if (kpiMM) { kpiMM.textContent = fmtMargen(metro.margenPct); kpiMM.style.color = colorMargen(metro.margenPct); }
    var kpiIM = document.getElementById('kpi-ingresos-metro');
    if (kpiIM) kpiIM.textContent = 'ingresos: ' + fmtUSD(metro.ingresosUSD);

    // Render company cards
    if (grid) {
      grid.innerHTML = '';

      // Ambbi card
      grid.innerHTML += buildProfitCard('AMBBI', ambbi, '#d4a640', 'card-gold', fmtUSD, fmtMargen, colorMargen);
      // Metropolitan card
      grid.innerHTML += buildProfitCard('METROPOLITAN', metro, '#7ec8e3', 'card-metro', fmtUSD, fmtMargen, colorMargen);
    }

    // Render unit breakdowns
    var unitsWrap = document.getElementById('profit-units-wrap');
    if (unitsWrap) {
      var hasUnits = d.byUnit && (d.byUnit.Ambbi || d.byUnit.Metropolitan);
      if (hasUnits) {
        unitsWrap.style.display = '';
        renderUnitTable('pv-ambbi', d.byUnit.Ambbi || [], '#d4a640', fmtUSD);
        renderUnitTable('pv-metro', d.byUnit.Metropolitan || [], '#7ec8e3', fmtUSD);
      }
    }
  }
  window.loadProfitability = loadProfitability;

  function buildProfitCard(label, co, accent, cardClass, fmtUSD, fmtMargen, colorMargen) {
    var margenPct = co.margenPct !== undefined ? co.margenPct : null;
    var margenV = margenPct !== null && Math.abs(margenPct) <= 1 ? margenPct * 100 : margenPct;
    var ebitdaSign = (co.ebitdaUSD || 0) >= 0 ? '' : '-';
    return '<div class="card ' + cardClass + '">' +
      '<div class="card-head" style="margin-bottom:10px;">' +
      '<div class="card-title" style="color:' + accent + '">' + label + '</div>' +
      '<span class="badge" style="background:' + accent + '18;color:' + accent + ';border:1px solid ' + accent + '30;font-size:.68rem;">' +
        (co.nUnidActivas || 0) + ' unidades</span>' +
      '</div>' +
      '<div class="profit-kpi-row">' +
        kpiBox('Ingresos', fmtUSD(co.ingresosUSD), 'neutral', accent) +
        kpiBox('EBITDA', fmtUSD(co.ebitdaUSD), (co.ebitdaUSD || 0) >= 0 ? 'pos' : 'neg', accent) +
        kpiBox('Margen', fmtMargen(margenPct), margenV >= 15 ? 'pos' : margenV >= 0 ? 'neutral' : 'neg', accent) +
      '</div>' +
      '<div class="profit-kpi-row">' +
        kpiBox('ADR', fmtUSD(co.adrUSD), 'neutral', accent) +
        kpiBox('RevPAR', fmtUSD(co.revparUSD), 'neutral', accent) +
        kpiBox('Ocup.', co.ocupacionPct !== undefined ? (co.ocupacionPct <= 1 ? Math.round(co.ocupacionPct * 100) : Math.round(co.ocupacionPct)) + '%' : '—', 'neutral', accent) +
      '</div>' +
      '<div style="font-size:.72rem;color:var(--muted);margin-top:4px;">' +
        (co.nReservas || 0) + ' reservas · período: ' + (co.mes || '—') + ' ' + (co.anio || '') +
      '</div>' +
    '</div>';
  }

  function kpiBox(label, value, cls, accent) {
    return '<div class="profit-kpi ' + cls + '">' +
      '<span>' + label + '</span>' +
      '<strong>' + (value || '—') + '</strong>' +
    '</div>';
  }

  function renderUnitTable(containerId, units, accent, fmtUSD) {
    var el = document.getElementById(containerId);
    if (!el) return;
    if (!units || !units.length) {
      el.innerHTML = '<div style="color:var(--muted);font-size:.82rem;padding:10px;">Sin datos por unidad</div>';
      return;
    }
    // Sort by revenue descending
    var sorted = units.slice().sort(function (a, b) { return (b.ingresosUSD || 0) - (a.ingresosUSD || 0); });
    var maxIng = sorted[0] ? (sorted[0].ingresosUSD || 1) : 1;

    el.innerHTML = '<div style="display:grid;gap:6px;margin-top:4px;">' +
      sorted.map(function (u) {
        var barPct = maxIng ? Math.round((u.ingresosUSD || 0) * 100 / maxIng) : 0;
        var resSign = (u.resultadoUSD || 0) >= 0;
        return '<div class="unit-row">' +
          '<span style="min-width:90px;font-size:.78rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escHtml(u.nombre || u.unidad || '') + '">' +
            escHtml(u.nombre || u.unidad || '—') + '</span>' +
          '<div class="unit-bar-track"><div class="unit-bar-fill" style="width:' + barPct + '%;background:' + accent + ';opacity:.7;"></div></div>' +
          '<span style="font-family:var(--mono);font-size:.74rem;min-width:60px;text-align:right;">' + fmtUSD(u.ingresosUSD) + '</span>' +
          '<span style="font-size:.74rem;min-width:56px;text-align:right;color:' + (resSign ? 'var(--ok)' : 'var(--danger)') + ';">' +
            fmtUSD(u.resultadoUSD) + '</span>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  function profitTab(which) {
    var tabs = document.querySelectorAll('#profit-units-wrap .sub-tab');
    var views = document.querySelectorAll('#profit-units-wrap .sub-view');
    tabs.forEach(function (t) { t.classList.remove('active'); });
    views.forEach(function (v) { v.classList.remove('active'); });
    var targetView = document.getElementById('pv-' + which);
    if (targetView) targetView.classList.add('active');
    // activate matching tab
    tabs.forEach(function (t) {
      if (t.getAttribute('onclick') && t.getAttribute('onclick').includes(which)) t.classList.add('active');
    });
  }
  window.profitTab = profitTab;

  /* ─── OCCUPANCY ──────────────────────────────────────────────────── */
  async function loadOccupancy() {
    var d = await apiFetch('/occupancy?days=30&company=all');
    if (!d || d.__error) {
      var el = document.getElementById('ocup-detail');
      if (el) el.innerHTML = '<span style="color:var(--muted);">Sin datos de ocupación</span>';
      return;
    }
    occupancyData = d;

    var pct = d.occupancyPct !== undefined
      ? (d.occupancyPct <= 1 ? d.occupancyPct * 100 : d.occupancyPct)
      : (d.occupancy30d || null);

    // System bar + KPI
    var sbOcup = document.getElementById('sb-ocup');
    if (sbOcup && pct !== null) sbOcup.textContent = Math.round(pct) + '%';
    var kpiOcup = document.getElementById('kpi-ocup');
    if (kpiOcup && pct !== null) kpiOcup.textContent = Math.round(pct) + '%';

    // Gauge update
    setGauge('g-ocup', 'gv-ocup', pct, 'Ocup', true);

    // Detail card
    var detailEl = document.getElementById('ocup-detail');
    if (detailEl) {
      detailEl.innerHTML =
        '<div class="stats-row" style="margin-bottom:12px;">' +
        '<div class="stat-item"><span>Ocupación 30d</span><strong style="color:var(--gold)">' + (pct !== null ? Math.round(pct) + '%' : '—') + '</strong></div>' +
        '<div class="stat-item"><span>Noches ocupadas</span><strong>' + (d.busyNights != null ? d.busyNights : '—') + '</strong></div>' +
        '<div class="stat-item"><span>Unidades</span><strong>' + (d.unitsCounted != null ? d.unitsCounted : '—') + '</strong></div>' +
        '</div>' +
        '<div style="font-size:.72rem;color:var(--muted);">Distinto a rentabilidad contable (CFO). Fuente: iCal Airbnb / Booking.</div>';
    }

    // Upcoming reservations
    var upcoming = d.upcoming || [];
    var upEl = document.getElementById('upcoming-list');
    if (upEl) {
      if (!upcoming.length) {
        upEl.innerHTML = '<div style="color:var(--muted);font-size:.82rem;">Sin reservas próximas</div>';
      } else {
        upEl.innerHTML = upcoming.slice(0, 8).map(function (r) {
          var startDate = r.start ? new Date(r.start).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '—';
          var endDate   = r.end   ? new Date(r.end).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '—';
          return '<div class="reserva-item">' +
            '<span class="reserva-alias">' + escHtml(r.alias || r.id || '—') + '</span>' +
            '<span class="reserva-dates">' + startDate + ' → ' + endDate + '</span>' +
            '<span class="reserva-nights">' + (r.nights || '—') + 'n</span>' +
            '</div>';
        }).join('');
      }
    }
  }
  window.loadOccupancy = loadOccupancy;

  /* ─── WISPY STATUS ───────────────────────────────────────────────── */
  async function loadWispy() {
    var d = await apiFetch('/wispy/status');
    if (!d || d.__error) {
      var badge = document.getElementById('wispy-wa-badge');
      if (badge) { badge.textContent = 'Sin datos'; badge.className = 'badge badge-muted'; }
      return;
    }
    var ok = d.wa_status === 'WORKING';
    var badge = document.getElementById('wispy-wa-badge');
    if (badge) {
      badge.textContent = d.wa_status || '—';
      badge.className = 'badge ' + (ok ? 'badge-ok' : 'badge-warn');
    }
    var wModel = document.getElementById('w-model');
    if (wModel) wModel.textContent = d.model || '—';
    var wWa = document.getElementById('w-wa');
    if (wWa) {
      wWa.textContent = d.wa_status || '—';
      wWa.style.color = ok ? 'var(--ok)' : 'var(--warn)';
    }
    // Update system bar gateway dot
    var sbGw = document.getElementById('sb-gateway');
    if (sbGw) sbGw.innerHTML = '<span class="dot ' + (ok ? 'ok' : 'warn') + '"></span>' + (d.wa_status || '—');
  }
  window.loadWispy = loadWispy;

  /* ─── BAMBI STATUS ───────────────────────────────────────────────── */
  async function loadBambi() {
    // Bambi container was removed; the gringo_agents runtime replaced it.
    // Try the endpoint gracefully and show appropriate message.
    var d = await apiFetch('/bambi/api/mode');
    var badge = document.getElementById('bambi-status-badge');
    if (!d || d.__error) {
      if (badge) { badge.textContent = 'Runtime unificado'; badge.className = 'badge badge-warn'; }
      return;
    }
    if (badge) {
      badge.textContent = (d.mode || 'unknown').toUpperCase();
      badge.className = 'badge ' + (d.mode === 'live' ? 'badge-ok' : 'badge-warn');
    }
    // If live data is available, show it
    var liveWrap = document.getElementById('bambi-live-wrap');
    var statsRow = document.getElementById('bambi-stats-row');
    if (liveWrap && statsRow && d.mode) {
      liveWrap.style.display = '';
      statsRow.innerHTML =
        '<div class="stat-item"><span>Modo</span><strong style="color:' + (d.mode === 'live' ? 'var(--ok)' : 'var(--warn)') + '">' + (d.mode || '—').toUpperCase() + '</strong></div>' +
        '<div class="stat-item"><span>Kill switch</span><strong>' + (d.kill ? '🔴 ON' : '🟢 OFF') + '</strong></div>';
    }
  }
  window.loadBambi = loadBambi;

  /* ─── TASKS ──────────────────────────────────────────────────────── */
  async function loadTasks() {
    var d = await apiFetch('/tasks');
    allTasks = (d && d.all) ? d.all : [];
    renderTasks(allTasks);
  }
  window.loadTasks = loadTasks;

  function renderTasks(tasks) {
    var colorMap = { Pamela: '#d4a640', Augusto: '#4dde95', Marcelo: '#5b9cf6', Franco: '#ff7b7b' };
    var prioColor = { Urgente: 'var(--danger)', Alta: 'var(--warn)', Media: 'var(--ok)', Baja: 'var(--muted)' };
    var body = document.getElementById('tasks-body');
    if (!body) return;
    if (!tasks || !tasks.length) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px;">Sin tareas</td></tr>';
      return;
    }
    body.innerHTML = tasks.slice(0, 40).map(function (t) {
      var r  = t.responsable || '—';
      var col = colorMap[r] || 'var(--muted)';
      var pc  = prioColor[t.priority] || prioColor[t.prioridad] || 'var(--muted)';
      var prio = t.priority || t.prioridad || '—';
      return '<tr>' +
        '<td style="font-weight:600;">' + escHtml(t.title || '—') + '</td>' +
        '<td><span style="background:' + col + '22;color:' + col + ';padding:2px 8px;border-radius:8px;font-size:.76rem;font-weight:700;">' + escHtml(r) + '</span></td>' +
        '<td><span style="color:var(--muted);font-size:.78rem;">' + escHtml(t.status || '—') + '</span></td>' +
        '<td><span style="color:' + pc + ';font-size:.78rem;font-weight:700;">' + escHtml(prio) + '</span></td>' +
        '<td style="color:var(--muted);font-size:.78rem;">' + escHtml(t.area || '—') + '</td>' +
      '</tr>';
    }).join('');
  }

  function filterTasks(f) {
    if (f === 'all') return renderTasks(allTasks);
    renderTasks(allTasks.filter(function (t) {
      var s = ((t.status || '') + (t.priority || '') + (t.prioridad || '')).toLowerCase();
      return s.includes(f.toLowerCase());
    }));
  }
  window.filterTasks = filterTasks;

  async function createTask() {
    var title      = document.getElementById('t-title');
    var respSelect = document.getElementById('t-responsable');
    var areaSelect = document.getElementById('t-area');
    var prioSelect = document.getElementById('t-prioridad');
    var notasArea  = document.getElementById('t-notas');
    if (!title || !title.value.trim()) return toast('El título es requerido', 'err');
    var body = {
      title:      title.value.trim(),
      responsable: respSelect ? respSelect.value : '',
      area:       areaSelect  ? areaSelect.value  : '',
      priority:   prioSelect  ? prioSelect.value  : 'Media',
      notes:      notasArea   ? notasArea.value   : ''
    };
    var d = await apiFetch('/tasks/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (d && d.ok) {
      hideModal('modal-task');
      toast('Tarea creada' + (body.responsable ? ' + WA a ' + body.responsable : ''), 'ok');
      loadTasks();
    } else {
      toast('Error al crear la tarea', 'err');
    }
  }
  window.createTask = createTask;

  /* ─── GUESTS ─────────────────────────────────────────────────────── */
  async function loadGuests() {
    var d = await apiFetch('/notion/guests?limit=30');
    var body = document.getElementById('guests-body');
    if (!body) return;
    var guests = (d && d.guests) ? d.guests : [];
    if (!guests.length) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px;">Sin datos</td></tr>';
      return;
    }
    var hTotal = document.getElementById('h-total');
    var hEmail = document.getElementById('h-email');
    if (hTotal) hTotal.textContent = d.count || guests.length;
    if (hEmail) hEmail.textContent = guests.filter(function (g) { return g.email; }).length + '+';
    body.innerHTML = guests.map(function (g) {
      return '<tr>' +
        '<td style="font-weight:600;">' + escHtml(g.nombre || '—') + '</td>' +
        '<td style="font-family:var(--mono);font-size:.76rem;color:var(--muted);">' + escHtml(g.telefono || '—') + '</td>' +
        '<td style="font-size:.78rem;">' + escHtml(g.email || '—') + '</td>' +
        '<td><span style="background:rgba(91,156,246,0.12);color:var(--blue);padding:2px 6px;border-radius:6px;font-size:.74rem;">' + escHtml(g.unidad || '—') + '</span></td>' +
        '<td style="font-size:.78rem;color:var(--muted);">' + escHtml(g.plataforma || '—') + '</td>' +
        '<td style="font-size:.76rem;color:var(--muted);">' + (g.ultimoContacto ? new Date(g.ultimoContacto).toLocaleDateString('es-AR') : '—') + '</td>' +
      '</tr>';
    }).join('');
  }
  window.loadGuests = loadGuests;

  /* ─── AMBBI OCCUPANCY BY UNIT ────────────────────────────────────── */
  async function loadAmbiOcup() {
    var d = await apiFetch('/occupancy?company=Ambbi');
    var body = document.getElementById('ambbi-ocup-body');
    if (!body) return;
    var byUnit = (d && d.byUnit) ? d.byUnit : [];
    if (!byUnit.length) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px;">Sin datos por unidad</td></tr>';
      return;
    }
    byUnit = byUnit.slice().sort(function (x, y) { return (y.occupancyPct || 0) - (x.occupancyPct || 0); });
    body.innerHTML = byUnit.map(function (u) {
      var ocPct = (u.occupancyPct !== undefined && u.occupancyPct !== null)
        ? Math.round(u.occupancyPct <= 1 ? u.occupancyPct * 100 : u.occupancyPct)
        : '—';
      var next = (u.upcoming && u.upcoming[0] && u.upcoming[0].start)
        ? new Date(u.upcoming[0].start).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
        : '—';
      var barCol = ocPct >= 60 ? 'var(--ok)' : ocPct >= 30 ? 'var(--warn)' : 'var(--danger)';
      var barW = (ocPct === '—') ? 0 : Math.min(100, ocPct);
      return '<tr>' +
        '<td style="font-family:var(--mono);font-size:.78rem;color:var(--muted);">' + escHtml(u.id || '—') + '</td>' +
        '<td style="font-weight:600;">' + escHtml(u.alias || '—') + '</td>' +
        '<td>' + (u.busyNights != null ? u.busyNights : '—') + '</td>' +
        '<td><div style="display:flex;align-items:center;gap:8px;min-width:120px;">' +
          '<div style="flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,0.07);overflow:hidden;"><div style="height:100%;width:' + barW + '%;border-radius:3px;background:' + barCol + ';"></div></div>' +
          '<span style="color:' + barCol + ';font-weight:700;font-family:var(--mono);font-size:.78rem;width:38px;text-align:right;">' + ocPct + (ocPct !== '—' ? '%' : '') + '</span>' +
        '</div></td>' +
        '<td style="color:var(--gold);font-family:var(--mono);font-size:.8rem;">' + next + '</td>' +
      '</tr>';
    }).join('');
  }
  window.loadAmbiOcup = loadAmbiOcup;

  /* ─── AMBBI · RESUMEN DEL NEGOCIO (KPIs + ocupación diaria) ─── */
  async function loadAmbbiResumen() {
    try {
      var d = await apiFetch('/occupancy?days=30&company=Ambbi');
      if (!d || d.__error || !d.ok) return;
      var pct = Math.round((d.occupancyPct || 0) * 100);
      var el = document.getElementById('ar-ocup');
      if (el) { el.textContent = pct + '%'; el.style.color = pct >= 60 ? 'var(--ok)' : pct >= 30 ? 'var(--warn)' : 'var(--danger)'; }
      el = document.getElementById('ar-ocup-sub');
      if (el) el.textContent = (d.busyNights || 0) + ' / ' + (d.availableNights || 0) + ' noches';
      var today = (d.daily && d.daily[0]) ? d.daily[0] : null;
      el = document.getElementById('ar-hoy');
      if (el) el.textContent = today ? (today.busy + ' / ' + today.total) : '—';
      var todayISO = new Date().toISOString().slice(0, 10);
      var in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      var checkins = (d.upcoming || []).filter(function (r) { return r.start >= todayISO && r.start <= in7; }).length;
      el = document.getElementById('ar-checkins');
      if (el) el.textContent = checkins;
      el = document.getElementById('ar-units');
      if (el) el.textContent = (d.unitsCounted || 0) + ' / ' + (d.unitsTotal || 0);
      if (d.daily && d.daily.length) {
        var series = d.daily.map(function (x) {
          var p = x.date.split('-');
          return { v: Math.round((x.pct || 0) * 100), label: parseInt(p[2]) + '/' + parseInt(p[1]) };
        });
        drawLineChart('chart-ambbi-daily', series, { color: '#d4a640' });
      }
    } catch (e) {}
  }
  window.loadAmbbiResumen = loadAmbbiResumen;

  /* ─── PORTFOLIO (toggle AMBBI / Metropolitan / ambas) ─── */
  var pfCurrent = 'ambbi';
  function portfolioTab(which) {
    pfCurrent = which;
    ['ambbi', 'metro', 'all'].forEach(function (k) {
      var b = document.getElementById('pf-tab-' + k);
      if (b) b.classList.toggle('active', k === which);
    });
    renderPortfolio();
  }
  window.portfolioTab = portfolioTab;

  async function renderPortfolio() {
    function fU(v) { return (v == null) ? '—' : '$' + Math.round(Number(v)).toLocaleString('es-AR'); }
    function fM(v) { if (v == null) return '—'; var p = Math.abs(v) <= 1 ? v * 100 : v; return Math.round(p) + '%'; }
    try {
      var results = await Promise.all([
        apiFetch('/business/profitability?empresa=all'),
        apiFetch('/occupancy?days=30&company=' + (pfCurrent === 'ambbi' ? 'Ambbi' : pfCurrent === 'metro' ? 'Metropolitan' : 'all'))
      ]);
      var prof = results[0], oc = results[1];
      var co = (prof && !prof.__error && prof.companies) ? prof.companies : {};
      var a = co.Ambbi || {}, m = co.Metropolitan || {};
      var sel;
      if (pfCurrent === 'ambbi') sel = a;
      else if (pfCurrent === 'metro') sel = m;
      else sel = {
        ingresosUSD: (a.ingresosUSD || 0) + (m.ingresosUSD || 0),
        ebitdaUSD: (a.ebitdaUSD || 0) + (m.ebitdaUSD || 0),
        margenPct: ((a.ingresosUSD || 0) + (m.ingresosUSD || 0)) ? ((a.ebitdaUSD || 0) + (m.ebitdaUSD || 0)) / ((a.ingresosUSD || 0) + (m.ingresosUSD || 0)) : null,
        adrUSD: a.adrUSD || m.adrUSD || null,
        mes: a.mes || m.mes, anio: a.anio || m.anio
      };
      var byU = (oc && !oc.__error && oc.byUnit) ? oc.byUnit : [];
      var el = document.getElementById('pf-units'); if (el) el.textContent = byU.length || '—';
      el = document.getElementById('pf-units-sub');
      if (el) {
        if (pfCurrent === 'all') {
          var na = byU.filter(function (u) { return (u.empresa || '').toLowerCase() === 'ambbi'; }).length;
          el.textContent = na + ' AMBBI · ' + (byU.length - na) + ' Metro';
        } else { el.textContent = 'con calendario activo'; }
      }
      el = document.getElementById('pf-ingresos'); if (el) el.textContent = fU(sel.ingresosUSD);
      el = document.getElementById('pf-ebitda');
      if (el) { el.textContent = fU(sel.ebitdaUSD); el.style.color = (sel.ebitdaUSD || 0) >= 0 ? 'var(--ok)' : 'var(--danger)'; }
      el = document.getElementById('pf-margen'); if (el) el.textContent = fM(sel.margenPct);
      el = document.getElementById('pf-adr'); if (el) el.textContent = fU(sel.adrUSD);
      el = document.getElementById('pf-ocup');
      if (el) el.textContent = (oc && !oc.__error) ? Math.round((oc.occupancyPct || 0) * 100) + '%' : '—';
      el = document.getElementById('pf-period');
      if (el && (sel.mes || sel.anio)) el.textContent = 'unidades + rentabilidad · ' + (sel.mes || '') + ' ' + (sel.anio || '');
    } catch (e) {}
  }
  window.renderPortfolio = renderPortfolio;

  /* ─── AMBBI TAB SWITCHER ─────────────────────────────────────────── */
  function ambiTab(which) {
    var prefixes = ['tareas', 'huespedes', 'ocupacion'];
    prefixes.forEach(function (p) {
      var sv = document.getElementById('at-' + p);
      if (sv) sv.classList.remove('active');
    });
    var sv = document.getElementById('at-' + which);
    if (sv) sv.classList.add('active');
    // Sync tab buttons (scoped al contenedor operativo — el Portfolio tiene sus propios tabs)
    var tabs = document.querySelectorAll('#ambbi-op-tabs .sub-tab');
    tabs.forEach(function (t) { t.classList.remove('active'); });
    var idx = prefixes.indexOf(which);
    if (tabs[idx]) tabs[idx].classList.add('active');
    // Lazy load
    if (which === 'huespedes') loadGuests();
    if (which === 'ocupacion') loadAmbiOcup();
    if (which === 'tareas')    loadTasks();
  }
  window.ambiTab = ambiTab;

  /* ─── GRINGO CRM (banco Notion) ─────────────────────────────────── */
  var CRM_ETIQ_COLOR = { A: 'var(--ok)', B: 'var(--gold)', C: 'var(--warn)', D: 'var(--muted)' };
  // S50 (consultor): mini-acciones CONCRETAS debajo de cada embudo — no solo etapas decorativas
  var ACCIONES_CAP = { 'Lead propietario': 'contactarlo y calificar (NURC)', 'Contactado': 'completar NURC + agendar tasación', 'Tasación': 'cargar comparables + generar Carpeta Wow', 'Autorización': 'mandar autorización + Compromiso de Calidad', 'Captada': 'documentación + fotos/plano → publicar' };
  var ACCIONES_DEM = { 'Consulta': 'calificar (PUFA) y responder en <1 min', 'Calificado': 'proponer visita con 2 horarios', 'Visita coordinada': 'confirmar el día antes + preparar la unidad', 'Oferta/Reserva': 'crear la operación 💼 y pedir refuerzo' };
  function accionesEmbudo(etapas, mapa) {
    var lineas = (etapas || []).filter(function (e) { return e.count > 0 && mapa[e.etapa]; }).map(function (e) {
      return '<div style="font-size:.74rem;padding:2px 0;color:var(--muted);">▶ <b style="color:var(--text);">' + e.count + ' en ' + escHtml(e.etapa) + '</b> → ' + mapa[e.etapa] + '</div>';
    });
    return lineas.length ? '<div style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.06);padding-top:6px;">' + lineas.join('') + '</div>' : '';
  }

  // S47: embudos con COLOR — progresión frío→oro→verde por avance; descartes en gris (pedido Franco)
  var FUNNEL_PALETTE = ['#5ec8d8', '#6fa8e8', '#9b8cf0', '#c9a0f0', '#d4af37', '#e8c96a', '#67d98b', '#46b97a', '#3da06a', '#67d98b'];
  function funnelColor(etapa, i) {
    if (/descart|perdid|ca[íi]da|rechaz/i.test(etapa || '')) return '#6b7078';
    return FUNNEL_PALETTE[Math.min(i, FUNNEL_PALETTE.length - 1)];
  }
  function crmFunnelHtml(etapas) {
    var max = Math.max.apply(null, etapas.map(function (e) { return e.count; }).concat([1]));
    return '<div class="crm-cols">' + etapas.map(function (e, fi) {
      var h = Math.max(e.count > 0 ? 14 : 4, Math.round(e.count / max * 64));
      var col = funnelColor(e.etapa, fi);
      return '<div class="crm-col" title="' + escHtml(e.etapa) + ': ' + e.count + '">' +
        '<strong style="color:' + (e.count > 0 ? col : 'var(--muted)') + ';">' + e.count + '</strong>' +
        '<div class="crm-bar"><i style="height:' + h + 'px;background:linear-gradient(180deg,' + col + ',' + col + '55);box-shadow:0 0 8px ' + col + '33;"></i></div>' +
        '<span>' + escHtml(e.etapa) + '</span>' +
        (e.cards && e.cards.length ? '<div class="crm-cards">' + e.cards.slice(0, 3).map(function (c) {
          var col = CRM_ETIQ_COLOR[c.etiqueta] || 'var(--muted)';
          var handler = c.onclick || (c.id ? 'abrirContactoEdit(\'' + c.id + '\')' : '');
          var click = handler ? ' onclick="' + handler + '" style="cursor:pointer;border-left-color:' + col + '"' : ' style="border-left-color:' + col + '"';
          return '<div class="crm-card"' + click + ' title="' + escHtml(c.title || 'Click para editar (etapas, NURC/PUFA)') + '">' + escHtml(c.nombre) + '</div>';
        }).join('') + (e.cards.length > 3 ? '<div class="small muted">+' + (e.cards.length - 3) + '</div>' : '') + '</div>' : '') +
      '</div>';
    }).join('') + '</div>';
  }

  async function loadCrm() {
    try {
      var d = await apiFetch('/crm/pipeline');
      if (!d || d.__error || !d.ok) {
        var c1 = document.getElementById('crm-captacion');
        if (c1) c1.innerHTML = '<span class="small muted">No pude leer el CRM (bridge /api/crm/pipeline).</span>';
        return;
      }
      var emptyState = function (msg, botones) {
        return '<div style="border:1px dashed var(--border);border-radius:12px;padding:18px;text-align:center;margin-bottom:12px;">' +
          '<div style="font-size:.82rem;color:var(--muted);margin-bottom:10px;">' + msg + '</div>' +
          '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">' + botones + '</div></div>';
      };
      var cap = document.getElementById('crm-captacion');
      var capTotal = (d.captacion || []).reduce(function (s, e) { return s + e.count; }, 0);
      if (cap) cap.innerHTML = (capTotal === 0 ? emptyState(
        'Todavía no hay propietarios en el embudo. Cargá un lead, promové desde tus contactos o importá una ficha.',
        '<button class="btn btn-gold btn-sm" onclick="showModal(\'modal-contacto\')">+ Lead propietario</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="crmTab(\'contactos\')">⭐ Promover desde contactos</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="showModal(\'modal-import\')">📥 Importar</button>') : '') + crmFunnelHtml(d.captacion || []) + accionesEmbudo(d.captacion, ACCIONES_CAP);
      var el = document.getElementById('crm-cap-total'); if (el) el.textContent = capTotal + ' propietarios';
      var dem = document.getElementById('crm-demanda');
      var demTotal = (d.demanda || []).reduce(function (s, e) { return s + e.count; }, 0);
      if (dem) dem.innerHTML = (demTotal === 0 ? emptyState(
        'Todavía no hay compradores/inquilinos. Cargá una consulta, mandale el screenshot del lead a Wispy o promové desde contactos.',
        '<button class="btn btn-gold btn-sm" onclick="showModal(\'modal-contacto\')">+ Lead demanda</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="crmTab(\'contactos\')">⭐ Promover desde contactos</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="showModal(\'modal-import\')">📥 Importar</button>') : '') + crmFunnelHtml(d.demanda || []) + accionesEmbudo(d.demanda, ACCIONES_DEM);
      el = document.getElementById('crm-dem-total'); if (el) el.textContent = demTotal + ' leads';
      // Los 250
      el = document.getElementById('crm-250-total'); if (el) el.textContent = (d.los250?.total || 0) + ' / 250';
      (d.los250?.porEtiqueta || []).forEach(function (x) {
        var e = document.getElementById('crm-250-' + x.etiqueta);
        if (e) e.textContent = x.count;
      });
      // Propiedades + documental
      el = document.getElementById('crm-props-total'); if (el) el.textContent = (d.propiedades?.total || 0) + ' propiedades';
      var pr = document.getElementById('crm-propiedades');
      if (pr) {
        var items = d.propiedades?.items || [];
        crmFichaCache = {};
        items.forEach(function (p) { crmFichaCache[p.id] = p; });
        // S48: flujo guiado — el orden del funnel de una propiedad, clickeable (pedido Franco)
        var paso = function (n, icon, label, accion, tip) {
          return '<div onclick="' + accion + '" class="kpi" style="cursor:pointer;display:flex;align-items:center;gap:7px;padding:7px 12px;text-align:left;" title="' + escHtml(tip) + '">' +
            '<span style="font-family:var(--mono);font-size:.66rem;color:var(--gold);border:1px solid rgba(212,166,64,0.5);border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">' + n + '</span>' +
            '<span style="font-size:.74rem;white-space:nowrap;">' + icon + ' ' + label + '</span></div>';
        };
        var journey = '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">' +
          paso(1, '📥', 'Cargar propiedad', 'showModal(\'modal-import\')', 'Importá la ficha: PDF de Zonaprop, texto pegado, audio o carga manual') +
          '<span style="color:var(--muted);">→</span>' +
          paso(2, '📎', 'Documentos', 'toast(\'Click en la propiedad → su legajo → arrastrá los docs (la escritura se analiza sola)\',\'ok\')', 'Abrí el legajo de la propiedad y arrastrá escritura/expensas/ABL — semáforo y análisis automáticos') +
          '<span style="color:var(--muted);">→</span>' +
          paso(3, '🧮', 'Tasar', 'showModal(\'modal-tasacion\')', 'Creá la tasación (podés pre-llenarla desde un audio o la ficha) y pegale comparables de Zonaprop') +
          '<span style="color:var(--muted);">→</span>' +
          paso(4, '🤝', 'Captar', 'toast(\'Con la Carpeta Wow entregada: si el propietario acepta el precio → etapa Captada en el embudo Captación\',\'ok\')', 'PDF Carpeta Wow → negociación → autorización firmada → Captada') +
          '<span style="color:var(--muted);">→</span>' +
          paso(5, '📣', 'Publicar y matchear', 'crmTab(\'demanda\')', 'Publicada → entran leads → matching automático con tu demanda → visitas → operación') +
        '</div>';
        pr.innerHTML = journey + (items.length ? items.map(function (p) {
          var docsCol = p.docsPct >= 100 ? 'var(--ok)' : p.docsPct >= 50 ? 'var(--gold)' : 'var(--warn)';
          var valor = p.valorVenta ? ('$' + Number(p.valorVenta).toLocaleString('es-AR')) : p.valorAlquiler ? ('$' + Number(p.valorAlquiler).toLocaleString('es-AR') + '/mes') : (p.valorPedido || '—');
          var specs = [p.tipoPropiedad, p.m2Totales ? p.m2Totales + 'm²' : null, p.ambientes ? p.ambientes + ' amb' : null].filter(Boolean).join(' · ');
          // 4 semáforos derivados: comercial / documental / marketing / operativo
          var semComercial = p.estado === 'Publicada' ? 'var(--ok)' : p.estado === 'Reservada' ? 'var(--gold)' : p.estado === 'Cerrada' ? 'var(--metro)' : 'var(--muted)';
          var semDoc = p.docsPct >= 100 ? 'var(--ok)' : p.docsPct >= 50 ? 'var(--gold)' : 'var(--danger)';
          var mkCount = (p.pedidosPublicacion || []).length;
          var semMkt = mkCount >= 4 ? 'var(--ok)' : mkCount >= 2 ? 'var(--gold)' : 'var(--danger)';
          var semOp = (window.crmOpsByProp && window.crmOpsByProp[p.id]) ? 'var(--ok)' : 'var(--muted)';
          var semaforos = '<span style="display:inline-flex;gap:3px;flex-shrink:0;" title="Comercial · Documental · Marketing · Operativo">' +
            ['Comercial:' + (p.estado || '—'), 'Docs ' + p.docsPct + '%', 'Marketing ' + mkCount + '/4', (window.crmOpsByProp && window.crmOpsByProp[p.id]) ? 'Con operación activa' : 'Sin operación'].map(function (tt, i) {
              var col = [semComercial, semDoc, semMkt, semOp][i];
              return '<i title="' + escHtml(tt) + '" style="width:8px;height:8px;border-radius:50%;background:' + col + ';display:inline-block;"></i>';
            }).join('') + '</span>';
          return '<div onclick="abrirLegajo(\'' + p.id + '\')" style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;" title="Click para abrir el LEGAJO 360">' +
            semaforos +
            '<div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:.84rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(p.propiedad) + '</div>' +
            (specs ? '<div style="font-size:.68rem;color:var(--muted);">' + escHtml(specs) + '</div>' : '') + '</div>' +
            '<span class="badge badge-muted">' + escHtml(p.operacion || '—') + '</span>' +
            '<span style="color:var(--gold);font-family:var(--mono);font-size:.78rem;">' + escHtml(String(valor)) + '</span>' +
            '<div style="display:flex;align-items:center;gap:6px;width:130px;">' +
              '<div style="flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,0.07);overflow:hidden;"><div style="height:100%;width:' + p.docsPct + '%;background:' + docsCol + ';border-radius:3px;"></div></div>' +
              '<span style="font-size:.7rem;font-family:var(--mono);color:' + docsCol + ';width:54px;">docs ' + p.docsPct + '%</span>' +
            '</div>' +
            '<span class="badge ' + (p.estado === 'Publicada' ? 'badge-ok' : 'badge-muted') + '">' + escHtml(p.estado || '—') + '</span>' +
            '<button class="btn btn-ghost btn-sm" title="Subir documentación (escritura, informes…) — copia SIEMPRE al Drive de gringoestate + tick en el checklist" onclick="event.stopPropagation();abrirDocUpload(\'' + p.id + '\')">📎</button>' +
          '</div>';
        }).join('') : '<span class="small muted">Sin propiedades todavía — cargá la primera con «+ Propiedad».</span>');
        // S50 (consultor): card Documental OPERATIVA — checklist vivo por propiedad, no párrafo
        var docEl = document.getElementById('crm-doc-operativo');
        if (docEl) {
          var DOC_CHECK = { 'Venta': ['Escritura', 'DNI/CUIT', 'ABL', 'Expensas', 'Reglamento', 'Certif. dominio', 'Inhibiciones', 'COTI', 'Poder', 'Plano', 'Fotos', 'Autorización'], 'Alquiler': ['Escritura', 'DNI/CUIT', 'Expensas', 'Reglamento', 'Autorización', 'Plano', 'Fotos', 'Contrato'] };
          var DOC_CRIT = { 'Escritura': 1, 'Plano': 1, 'Fotos': 1, 'Autorización': 1 };
          docEl.innerHTML = items.length ? items.map(function (p) {
            var lista = DOC_CHECK[p.operacion] || DOC_CHECK['Alquiler'];
            var g = p.docsGestion || {};
            var rec = function (tp) { return (p.docs || []).indexOf(tp) >= 0 || g[tp] === 'recibido'; };
            var chips = lista.map(function (tipo) {
              var st = rec(tipo) ? 'recibido' : (g[tipo] || 'pendiente');
              var col = st === 'recibido' ? 'var(--ok)' : st === 'pedido' ? '#5ec8d8' : st === 'revisar' ? 'var(--warn)' : st === 'no_aplica' ? '#555' : (DOC_CRIT[tipo] && p.estado === 'Publicada' ? 'var(--danger)' : '#999');
              var icon = st === 'recibido' ? '✓' : st === 'pedido' ? '📨' : st === 'no_aplica' ? '—' : '○';
              return '<span title="' + tipo + ': ' + st + '" style="display:inline-flex;align-items:center;gap:4px;border:1px solid ' + col + '55;border-left:3px solid ' + col + ';border-radius:7px;padding:2px 8px;font-size:.7rem;' + (st === 'no_aplica' ? 'opacity:.4;' : '') + '">' + icon + ' ' + tipo + '</span>';
            }).join(' ');
            var nAplica = lista.filter(function (tp) { return g[tp] !== 'no_aplica'; }).length;
            var nRec = lista.filter(rec).length;
            return '<div style="border:1px solid var(--border);border-radius:10px;padding:9px 12px;margin-bottom:8px;">' +
              '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:7px;">' +
                '<strong style="font-size:.82rem;">' + escHtml(p.propiedad) + '</strong>' +
                '<span class="badge badge-muted">' + escHtml(p.operacion || '') + '</span>' +
                '<span style="font-family:var(--mono);font-size:.72rem;color:' + (nRec >= nAplica ? 'var(--ok)' : 'var(--gold)') + ';">' + nRec + '/' + nAplica + '</span>' +
                '<span style="margin-left:auto;display:inline-flex;gap:5px;">' +
                  '<button class="btn btn-gold btn-sm" onclick="abrirLegajo(\'' + p.id + '\')">📂 Legajo</button>' +
                  '<button class="btn btn-ghost btn-sm" onclick="abrirDocUpload(\'' + p.id + '\')">📎 Subir</button>' +
                '</span></div>' +
              '<div style="display:flex;gap:5px;flex-wrap:wrap;">' + chips + '</div>' +
            '</div>';
          }).join('') : '<div class="small muted">Sin propiedades — el documental arranca cuando cargues la primera.</div>';
        }
      }
      window.crmPipelineCache = d;
      renderVista360();
      loadCrmSeguimientos();
      loadCrmInbox();
      loadCrmOperaciones();
      loadCrmResumen();
      loadCrmHigiene();
      loadPlanSemanal();
      loadCrmMatching();
      loadTasaciones();
      loadDocInbox();
      // S52.2: precargar el badge de Auditoría de cargas (que el contador se vea sin abrir la solapa)
      apiFetch('/crm/docs-auditoria').then(function (a) { var e = document.getElementById('crm-audit-count'); if (e && a && a.ok) e.textContent = a.count || 0; }).catch(function () {});
    } catch (e) {}
  }
  window.loadCrm = loadCrm;

  async function loadCrmSeguimientos() {
    var el = document.getElementById('crm-seguimientos');
    if (!el) return;
    var d = await apiFetch('/crm/seguimientos');
    if (!d || d.__error || !d.ok) { el.innerHTML = '<span class="small muted">—</span>'; return; }
    var items = [];
    (d.reportesVencidos || []).forEach(function (r) {
      items.push('<div style="display:flex;gap:8px;align-items:center;padding:5px 0;font-size:.8rem;"><span>📨</span><span style="flex:1;">Reporte 21d vencido: <b>' + escHtml(r.propiedad) + '</b></span><span class="small muted">' + (r.ultimoReporte || 'nunca') + '</span></div>');
    });
    (d.followupsVencidos || []).forEach(function (f) {
      items.push('<div style="display:flex;gap:8px;align-items:center;padding:5px 0;font-size:.8rem;"><span>🔁</span><span style="flex:1;">Seguir a <b>' + escHtml(f.nombre) + '</b> (' + escHtml(f.tipo || '—') + ')</span><span class="small muted">' + (f.proximoSeguimiento || '') + '</span></div>');
    });
    el.innerHTML = items.length ? items.join('') : '<span class="small muted">✅ Sin seguimientos vencidos.</span>';
  }
  window.loadCrmSeguimientos = loadCrmSeguimientos;

  // S51/S52.1: sub-modos del depurador — relacional · refinamiento WhatsApp · auditoría de cargas
  window.contactosModo = function (modo) {
    window._contactosModo = modo; // S80B2A: Auditoría se mudó a Documentos (top-level); modos = relacional/hablar/refinar
    var bloques = { refinar: 'cblock-refinar', relacional: 'cblock-relacional', hablar: 'cblock-hablar' };
    var botones = { refinar: 'cmode-refinar', relacional: 'cmode-relacional', hablar: 'cmode-hablar' };
    Object.keys(bloques).forEach(function (k) {
      var bl = document.getElementById(bloques[k]); if (bl) bl.style.display = (k === modo ? '' : 'none');
      var bt = document.getElementById(botones[k]); if (bt) { bt.classList.toggle('btn-gold', k === modo); bt.classList.toggle('btn-ghost', k !== modo); }
    });
    if (modo === 'refinar' && window.loadCrmHigiene) loadCrmHigiene();
  };

  /* ─── FICHA DE PROPIEDAD (create + edit desde la web) ─── */
  var crmFichaCache = {}; // id → ficha completa (del pipeline)
  var FICHA_FIELDS = [
    ['f-propiedad', 'propiedad'], ['f-direccion', 'direccion'], ['f-piso', 'pisoDepto'],
    ['f-tipo', 'tipoPropiedad'], ['f-operacion', 'operacion'], ['f-estado', 'estado'],
    ['f-valorventa', 'valorVenta'], ['f-valoralquiler', 'valorAlquiler'], ['f-expensas', 'expensas'],
    ['f-m2tot', 'm2Totales'], ['f-m2cub', 'm2Cubiertos'], ['f-orientacion', 'orientacion'],
    ['f-ambientes', 'ambientes'], ['f-dormitorios', 'dormitorios'], ['f-banos', 'banos'],
    ['f-pisosedificio', 'pisosEdificio'], ['f-antiguedad', 'antiguedad'], ['f-financiacion', 'financiacion'],
    ['f-zonaprop', 'linkZonaprop'], ['f-descripcion', 'descripcion'], ['f-notas', 'notas'],
    // C3.1 — ficha completa
    ['f-barrio', 'barrio'], ['f-disposicion', 'disposicion'], ['f-luminosidad', 'luminosidad'],
    ['f-m2semi', 'm2Semicubiertos'], ['f-m2desc', 'm2Descubiertos'], ['f-toilettes', 'toilettes'],
    ['f-estadocons', 'estadoConservacion'], ['f-cocheras', 'cocheras'], ['f-abl', 'ablArs'],
    ['f-alqars', 'valorAlquilerArs'], ['f-pretendido', 'precioPretendido'], ['f-recomendado', 'precioRecomendado'],
    ['f-preciomin', 'precioMinimo'], ['f-comision', 'comisionPactada'], ['f-condfin', 'condFinanciacion']
  ];
  var FICHA_EXTRAS = ['Ascensor', 'Calefacción', 'Aire acondicionado', 'Seguridad', 'Baulera', 'Balcón', 'Terraza', 'Patio', 'Apto profesional', 'Apto comercial', 'Accesibilidad', 'Gas natural', 'Unidad complementaria'];
  function renderExtras(selected) {
    var box = document.getElementById('f-extras');
    if (!box) return;
    var sel = selected || [];
    box.innerHTML = '<span style="font-size:.7rem;color:var(--muted);width:100%;">Extras:</span>' + FICHA_EXTRAS.map(function (x) {
      return '<label style="display:inline-flex;gap:4px;align-items:center;font-size:.72rem;color:var(--muted);cursor:pointer;border:1px solid var(--border);border-radius:14px;padding:3px 9px;">' +
        '<input type="checkbox" class="f-extra-chk" value="' + x + '"' + (sel.indexOf(x) >= 0 ? ' checked' : '') + '> ' + x + '</label>';
    }).join('');
  }

  function abrirFicha(id) {
    var f = (id && crmFichaCache[id]) || {};
    var t = document.getElementById('f-titulo-modal');
    if (t) t.textContent = id ? ('Editar — ' + (f.propiedad || 'ficha')) : 'Nueva Propiedad (ficha completa)';
    var hid = document.getElementById('f-id'); if (hid) hid.value = id || '';
    FICHA_FIELDS.forEach(function (m) {
      var el = document.getElementById(m[0]);
      if (!el) return;
      var val = f[m[1]];
      el.value = (val === null || val === undefined) ? '' : String(val);
    });
    var co = document.getElementById('f-cochera'); if (co) co.checked = !!f.cochera;
    renderExtras(f.extras || []);
    var fw = document.getElementById('f-fuente-wrap'); if (fw && !id) fw.style.display = 'none';
    showModal('modal-prop');
  }
  window.abrirFicha = abrirFicha;

  async function saveCrmFicha() {
    var v = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };
    if (!v('f-propiedad')) return toast('El título es requerido', 'err');
    var body = {};
    FICHA_FIELDS.forEach(function (m) { body[m[1]] = v(m[0]); });
    var co = document.getElementById('f-cochera'); body.cochera = !!(co && co.checked);
    body.extras = Array.prototype.slice.call(document.querySelectorAll('.f-extra-chk:checked')).map(function (c) { return c.value; });
    var id = v('f-id');
    var url = id ? '/crm/propiedad/actualizar' : '/crm/propiedad';
    if (id) body.id = id;
    var d = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (d && d.ok) { hideModal('modal-prop'); toast(id ? 'Ficha actualizada' : 'Propiedad creada en el CRM', 'ok'); loadCrm(); }
    else toast('Error: ' + ((d && d.error) || 'sin conexión'), 'err');
  }
  window.saveCrmFicha = saveCrmFicha;

  /* ─── IMPORTAR FICHA ZONAPROP (PDF → gpt-5.5 → modal pre-llenado) ─── */
  async function importarFicha(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    input.value = '';
    if (file.size > 15 * 1024 * 1024) return toast('Archivo muy grande (máx 15MB)', 'err');
    var esAudio = /^audio\//.test(file.type) || /\.(ogg|opus|mp3|m4a|wav|aac|webm)$/i.test(file.name);
    toast(esAudio ? '🎙 Transcribiendo y procesando… (~40s)' : 'Procesando ficha con IA… (~20s)', 'ok');
    var reader = new FileReader();
    reader.onload = async function () {
      var d = await apiFetch('/crm/ficha-import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, base64: String(reader.result) })
      });
      procesarImportRespuesta(d);
    };
    reader.readAsDataURL(file);
  }
  window.importarFicha = importarFicha;

  /* ─── C3 PRO ───────────────────────────────────────────────────── */
  function crmTab(which) {
    document.querySelectorAll('.crm-tab').forEach(function (t) { t.classList.remove('active'); });
    var tab = document.getElementById('ct-' + which);
    if (tab) tab.classList.add('active');
    document.querySelectorAll('#crm-tabs .sub-tab').forEach(function (b) { b.classList.remove('active'); });
    var idx = ['resumen', 'captacion', 'demanda', 'propiedades', 'contactos'].indexOf(which);
    var btns = document.querySelectorAll('#crm-tabs .sub-tab');
    if (btns[idx]) btns[idx].classList.add('active');
    if (which === 'contactos' && window.contactosModo) { var _cm = window._contactosModo; if (!_cm || _cm === 'auditoria') _cm = 'relacional'; contactosModo(_cm); } // S80B2A: Auditoría se mudó a Documentos
  }
  window.crmTab = crmTab;

  async function loadCrmResumen() {
    var m = await apiFetch('/crm/metricas');
    if (m && !m.__error && m.ok) {
      var set = function (id, v, sub, subId) {
        var e = document.getElementById(id); if (e) e.textContent = v;
        if (subId) { var s = document.getElementById(subId); if (s && sub) s.textContent = sub; }
      };
      var a = m.actividad || {}, o = m.oportunidades7d || {}, p = m.pipeline || {}, h = m.higieneRapida || {};
      set('cm-reuniones', (a.reuniones?.semana ?? '—'), 'semana · ' + (a.reuniones?.mes ?? '—') + ' en el mes', 'cm-reuniones-sub');
      set('cm-visitas', (a.visitas?.semana ?? '—'), 'semana · ' + (a.visitas?.mes ?? '—') + ' en el mes', 'cm-visitas-sub');
      set('cm-convos', a.conversacionesNuevas7d ?? '—');
      set('cm-trabajados', a.contactosTrabajados7d ?? '—');
      set('cm-oport', (o.contactos + o.propiedades + o.operaciones), o.contactos + ' cont · ' + o.propiedades + ' props · ' + o.operaciones + ' ops', 'cm-oport-sub');
      set('cm-honorarios', '$' + Number(p.honorariosPipeline || 0).toLocaleString('es-AR'));
      set('cm-absintocar', h.abSinTocar30d ?? '—');
      set('cm-segvencidos', h.seguimientosVencidos ?? '—');
      // C3.1: modo compacto cuando el pipeline está vacío
      var row2vacio = !(o.contactos + o.propiedades + o.operaciones) && !(p.honorariosPipeline) && !(h.abSinTocar30d) && !(h.seguimientosVencidos);
      var r2 = document.getElementById('cm-row2'), r2e = document.getElementById('cm-row2-empty');
      if (r2) r2.style.display = row2vacio ? 'none' : '';
      if (r2e) r2e.style.display = row2vacio ? '' : 'none';
      // conversiones por embudo (solo cuando hay datos)
      var cv = document.getElementById('cm-conversiones');
      if (cv) {
        // S48: conversiones como mini-cards con barra (pedido Franco "visualmente más atractivo")
        var chips = [];
        ['captacion', 'demanda'].forEach(function (k) {
          var obj = (m.conversiones || {})[k] || {};
          Object.keys(obj).forEach(function (par) {
            if (obj[par] === null) return;
            var v = obj[par];
            var c = v >= 50 ? 'var(--ok)' : v >= 25 ? 'var(--gold)' : '#c9803a';
            chips.push('<div class="kpi" style="min-width:150px;padding:7px 11px;text-align:left;display:block;" title="Embudo ' + escHtml(k) + '">' +
              '<div style="font-size:.64rem;color:var(--muted);letter-spacing:.04em;">' + escHtml(par.replace('→', ' → ')) + '</div>' +
              '<div style="font-family:var(--mono);font-size:1.05rem;font-weight:700;color:' + c + ';margin:2px 0;">' + v + '%</div>' +
              '<div style="height:4px;border-radius:3px;background:rgba(255,255,255,0.08);overflow:hidden;"><i style="display:block;height:100%;width:' + Math.min(100, v) + '%;background:' + c + ';border-radius:3px;"></i></div></div>');
          });
        });
        cv.innerHTML = chips.length ? '<div style="font-size:.68rem;color:var(--muted);margin-bottom:2px;text-transform:uppercase;letter-spacing:.06em;">Conversión por etapa</div>' +
          '<div style="font-size:.7rem;color:var(--muted);margin-bottom:7px;">De los contactos que llegaron a cada etapa, qué % avanzó a la siguiente — son TUS números reales; compará contra las referencias Magnin de abajo.</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;">' + chips.join('') + '</div>' : '';
      }
      // Benchmarks Magnin + plan semanal 40-5-5-1
      var bm = document.getElementById('cm-benchmarks');
      if (bm && m.benchmarks) {
        // S48: benchmarks como tarjetas con ícono (pedido Franco)
        var bench = function (icon, valor, label, tip) {
          return '<div class="kpi" style="min-width:118px;padding:8px 11px;text-align:center;" title="' + escHtml(tip) + '">' +
            '<div style="font-size:1.05rem;">' + icon + '</div>' +
            '<div style="font-family:var(--mono);font-size:.98rem;font-weight:700;color:var(--gold);margin:1px 0;">' + valor + '</div>' +
            '<div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;line-height:1.3;">' + label + '</div></div>';
        };
        bm.innerHTML =
          (m.carteraAlerta ? '<div style="font-size:.78rem;color:var(--warn);padding:6px 0;">' + escHtml(m.carteraAlerta) + '</div>' : '') +
          '<div style="font-size:.68rem;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em;">Referencias Magnin (benchmarks — para comparar, no automatizan nada)</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
            bench('📐', '33%', 'Tasación → Captada', 'Captar 1 de cada 3 tasaciones; antes, descartar la mitad de los pedidos que no califican') +
            bench('🏆', '50%', 'Captación → Venta', '2 captaciones en cartera por cada venta') +
            bench('👀', '15 : 1', 'Visitas → Reserva', '600 clics → 30 consultas → 15 visitas → 1 reserva (reserva→venta 1:1)') +
            bench('🗂', 'máx 5', 'Cartera activa', 'Cartera chica y rotativa, marketing de altísima calidad') +
            bench('📞', '12/día', 'Contactos prospección', '12 contactos diarios prospectando = 12 ventas/año') +
            bench('⚡', '&lt;1 min', 'Speed-to-lead', 'Responder en menos de 1 minuto; 2-3hs ya es tarde') +
          '</div>';
      }
    }
    var hh = await apiFetch('/crm/hablar-hoy');
    var recs = (hh && hh.ok && hh.recomendados) || [];
    window.crmRecsCache = {};
    recs.forEach(function (r) { window.crmRecsCache[r.id] = r; });
    pintarRecomendados(document.getElementById('crm-hablar-hoy'), recs);
    pintarRecomendados(document.getElementById('crm-hablar-contactos'), recs); // S51: franja en Contactos
  }
  window.loadCrmResumen = loadCrmResumen;

  // S51: render reutilizable de "a quién hablarle hoy" (Resumen + franja superior de Contactos)
  function pintarRecomendados(el, recs) {
    if (!el) return;
    el.innerHTML = recs.length ? recs.map(function (r) {
      return '<div style="border:1px solid var(--border);border-radius:10px;padding:9px 12px;margin-bottom:7px;background:rgba(255,255,255,0.02);">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<strong style="font-size:.86rem;">' + escHtml(r.nombre) + '</strong>' +
          (r.etiqueta ? '<span class="badge badge-gold">' + r.etiqueta + '</span>' : '') +
          '<span class="badge badge-muted">' + escHtml(r.tipo || '—') + '</span>' +
          '<span style="margin-left:auto;font-family:var(--mono);font-size:.7rem;color:var(--gold);">score ' + r.score + '</span>' +
        '</div>' +
        '<div style="font-size:.76rem;color:var(--muted);margin:4px 0 7px;"><b style="color:var(--text);">Motivo:</b> ' + r.motivos.map(escHtml).join(' · ') + (r.busca ? ' · busca: ' + escHtml(r.busca) : '') + '</div>' +
        '<div class="btn-row">' +
          (r.telefono ? '<a class="btn btn-gold btn-sm" style="text-decoration:none;" href="' + waHref(r.telefono) + '" target="_blank" rel="noopener">💬 Abrir chat</a>' : '') +
          '<button class="btn btn-ghost btn-sm" onclick="marcarContactado(\'' + r.id + '\')">✓ Contactado</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="crearTareaContacto(\'' + r.id + '\')">📋 Crear tarea</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="posponerContacto(\'' + r.id + '\')">⏰ Posponer 3d</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="abrirContactoEdit(\'' + r.id + '\')">✏️ Editar</button>' +
        '</div>' +
      '</div>';
    }).join('') : '<span class="small muted">Sin recomendaciones todavía — el recomendador cobra vida cuando tus contactos tienen etiqueta, etapa o seguimiento. Cargá los primeros desde 🧹 Refinamiento o el Import Center.</span>';
  }
  window.pintarRecomendados = pintarRecomendados;

  async function posponerContacto(id) {
    var f = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    var d = await apiFetch('/crm/contacto/actualizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, proximoSeguimiento: f }) });
    if (d && d.ok) { toast('Pospuesto — seguimiento el ' + f, 'ok'); loadCrmResumen(); }
    else toast('Error al posponer', 'err');
  }
  window.posponerContacto = posponerContacto;

  async function crearTareaContacto(id) {
    var r = (window.crmRecsCache || {})[id] || {};
    var d = await apiFetch('/tasks/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Contactar ' + (r.nombre || 'contacto CRM'), notes: 'Gringo CRM — ' + ((r.motivos || []).join(' · ') || 'seguimiento') + (r.telefono ? ' · ' + r.telefono : '') }) });
    if (d && d.ok) toast('Tarea creada en el Task OS', 'ok');
    else toast('Error al crear la tarea', 'err');
  }
  window.crearTareaContacto = crearTareaContacto;

  /* ─── LEGAJO 360 de propiedad (P1 consultor) ─── */
  async function abrirLegajo(id) {
    var t = document.getElementById('lg-titulo'); if (t) t.textContent = '📂 Legajo';
    var body = document.getElementById('lg-body');
    if (body) body.innerHTML = '<div class="skeleton skeleton-block" style="height:120px;"></div>';
    showModal('modal-legajo');
    var d = await apiFetch('/crm/propiedad/' + id + '/legajo');
    if (!d || d.__error || !d.ok) { if (body) body.innerHTML = '<span class="small muted">Error al cargar el legajo.</span>'; return; }
    window.lgData = d; window.lgId = id;
    var p = d.propiedad, sem = d.semaforoDocumental || {};
    if (t) t.textContent = '📂 ' + p.propiedad;
    var seccion = function (titulo, contenido, extraHeader) {
      return '<div class="lg-sec" style="margin-bottom:18px;background:rgba(255,255,255,0.018);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:12px 14px;">' +
        '<div style="display:flex;align-items:center;gap:8px;font-size:.74rem;color:var(--gold);text-transform:uppercase;letter-spacing:.08em;font-weight:700;border-bottom:1px solid var(--border);padding-bottom:6px;margin-bottom:9px;"><span style="flex:1;">' + titulo + '</span>' + (extraHeader || '') + '</div>' + contenido + '</div>';
    };
    // ═ S51: CABECERA PREMIUM — título + specs + 4 semáforos grandes + barra de avance comercial
    var valorHdr = p.valorVenta ? 'USD ' + Number(p.valorVenta).toLocaleString('es-AR') : p.valorAlquiler ? 'USD ' + Number(p.valorAlquiler).toLocaleString('es-AR') + '/mes' : (p.valorPedido || '');
    var specs = [p.operacion, valorHdr, (p.m2Totales ? p.m2Totales + ' m²' : ''), (p.ambientes ? p.ambientes + ' amb' : ''), p.estado, ((d.interesados || []).length ? (d.interesados.length + ' interesados') : '')].filter(Boolean).join(' · ');
    var sf = d.semaforos || {};
    var SF_ICON = { verde: '🟢', amarillo: '🟡', rojo: '🔴', gris: '⚪' };
    var SF_COL = { verde: 'var(--ok)', amarillo: 'var(--warn)', rojo: 'var(--danger)', gris: 'var(--muted)' };
    var semChip = function (lbl, s) {
      s = s || { estado: 'gris', detalle: '—' };
      return '<div style="flex:1;min-width:150px;border:1px solid ' + SF_COL[s.estado] + '55;border-left:4px solid ' + SF_COL[s.estado] + ';border-radius:10px;padding:8px 11px;background:rgba(255,255,255,0.015);">' +
        '<div style="font-size:.64rem;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;">' + lbl + '</div>' +
        '<div style="font-size:.86rem;font-weight:700;">' + SF_ICON[s.estado] + ' <span style="color:' + SF_COL[s.estado] + ';">' + escHtml((s.detalle || '').split(' · ')[0] || s.estado) + '</span></div></div>';
    };
    // barra de avance comercial (stepper)
    var tieneTas = (d.tasaciones || []).some(function (x) { return x.precioCierre; });
    var opsActivas = (d.operaciones || []).some(function (o) { return ['Cerrada', 'Caída'].indexOf(o.etapa) < 0; });
    var cerrada = (d.operaciones || []).some(function (o) { return o.etapa === 'Cerrada'; });
    var docPct = sem.pct || 0;
    var pasos = [
      { l: 'Cargada', ok: 'verde' },
      { l: 'Docs', ok: docPct >= 100 ? 'verde' : docPct > 0 ? 'amarillo' : 'rojo', extra: docPct + '%' },
      { l: 'Tasación', ok: tieneTas ? 'verde' : 'gris' },
      { l: 'Publicada', ok: p.estado === 'Publicada' ? 'verde' : 'gris' },
      { l: 'Leads', ok: (d.interesados || []).length ? 'verde' : 'gris', extra: (d.interesados || []).length || '' },
      { l: 'Operación', ok: opsActivas ? 'verde' : 'gris' },
      { l: 'Cerrada', ok: cerrada ? 'verde' : 'gris' }
    ];
    var stepper = '<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-top:10px;">' + pasos.map(function (s, i) {
      return (i ? '<span style="color:var(--muted);font-size:.7rem;">›</span>' : '') +
        '<span style="font-size:.66rem;padding:3px 8px;border-radius:7px;border:1px solid ' + SF_COL[s.ok] + '44;color:' + SF_COL[s.ok] + ';white-space:nowrap;">' + SF_ICON[s.ok] + ' ' + s.l + (s.extra ? ' ' + s.extra : '') + '</span>';
    }).join('') + '</div>';
    // S62A.3: tipo de unidad visible + editable (alimenta el checklist contextual, la tasación y la ficha)
    var TIPO_UNIDAD_OPTS = ['Departamento', 'Casa', 'Oficina', 'Local', 'Cochera', 'Terreno', 'PH', 'Otro'];
    var tipoUnidadHtml = '<select class="input" id="lg-tipo-unidad" style="width:auto;font-size:.74rem;padding:2px 8px;" onchange="lgSetTipoUnidad(this.value)" title="Tipo de unidad — alimenta el checklist documental, la tasación y la ficha comercial">' +
      '<option value="">🏷 Tipo de unidad…</option>' + TIPO_UNIDAD_OPTS.map(function (tu) { return '<option' + (p.tipoPropiedad === tu ? ' selected' : '') + '>' + tu + '</option>'; }).join('') + '</select>';
    var cabeceraHtml = '<div style="border:1px solid rgba(212,166,64,0.25);border-radius:14px;padding:14px 16px;margin-bottom:14px;background:linear-gradient(160deg,rgba(212,166,64,0.06),rgba(255,255,255,0.01));">' +
      '<div style="font-size:1.3rem;font-weight:800;letter-spacing:.01em;line-height:1.15;">' + escHtml(p.propiedad || '—') + '</div>' +
      '<div style="font-size:.86rem;color:var(--muted);margin:3px 0 9px;">' + escHtml(specs) + (p.direccion ? ' · 📍 ' + escHtml(p.direccion) : '') + '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;"><span style="font-size:.7rem;color:var(--muted);">Tipo de unidad:</span>' + tipoUnidadHtml + (p.tipoPropiedad ? '' : '<span style="font-size:.66rem;color:var(--warn);">⚠️ sin definir — impacta checklist y tasación</span>') + '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' + semChip('Comercial', sf.comercial) + semChip('Documental', sf.documental) + semChip('Marketing', sf.marketing) + semChip('Demanda', sf.demanda) + '</div>' +
      stepper + '</div>';
    // ═ PRÓXIMA ACCIÓN — enorme, arriba, con botones
    var faltan = (d.checklist || []).filter(function (c) { return c.estado === 'pendiente' || c.estado === 'bloqueante'; }).map(function (c) { return c.tipo; });
    var accionHtml = '<div style="border:2px solid var(--gold);border-radius:12px;padding:12px 14px;margin-bottom:14px;">' +
      '<div style="font-size:.68rem;color:var(--gold);text-transform:uppercase;letter-spacing:.08em;">▶ Próxima acción recomendada</div>' +
      '<div style="font-size:1rem;font-weight:700;margin:4px 0 2px;">' + escHtml(d.proximaAccion || '—') + '</div>' +
      (faltan.length ? '<div style="font-size:.76rem;color:var(--muted);margin-bottom:8px;">Faltan: ' + faltan.join(' · ') + '</div>' : '<div style="margin-bottom:8px;"></div>') +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
        ((d.mensajesSugeridos || []).length ? '<button class="btn btn-gold btn-sm" onclick="copiarBorrador(this)" data-msg="' + escHtml(d.mensajesSugeridos[0].texto) + '">📋 Copiar mensaje</button>' : '') +
        '<button class="btn btn-ghost btn-sm" onclick="lgCrearTarea()">✚ Crear tarea</button>' +
        (faltan.length ? '<button class="btn btn-ghost btn-sm" onclick="lgMarcarPedidos()" title="Marca como PEDIDOS todos los docs faltantes">📨 Marcar pedidos</button>' : '') +
        '<button class="btn btn-ghost btn-sm" onclick="hideModal(\'modal-legajo\');abrirDocUpload(\'' + p.id + '\')">📎 Subir doc</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="hideModal(\'modal-legajo\');abrirFicha(\'' + p.id + '\')">✏️ Ficha</button>' +
      '</div></div>';
    // ═ COLUMNA IZQUIERDA
    var valor = p.valorVenta ? 'USD ' + Number(p.valorVenta).toLocaleString('es-AR') : p.valorAlquiler ? 'USD ' + Number(p.valorAlquiler).toLocaleString('es-AR') + '/mes' : (p.valorPedido || '—');
    // S47: hero del resumen — nombre + dirección protagonistas y características en grilla clara
    var carac = [
      ['M² totales', p.m2Totales], ['M² cubiertos', p.m2Cubiertos], ['Ambientes', p.ambientes],
      ['Dormitorios', p.dormitorios], ['Baños', p.banos], ['Piso/Depto', p.pisoDepto],
      ['Orientación', p.orientacion], ['Disposición', p.disposicion], ['Antigüedad', p.antiguedad ? p.antiguedad + ' años' : null],
      ['Expensas', p.expensas ? '$ ' + Number(p.expensas).toLocaleString('es-AR') : null],
      ['Estado', p.estadoConservacion], ['Cochera', p.cochera ? 'Sí' : null]
    ].filter(function (x) { return x[1] != null && x[1] !== '' && x[1] !== '—'; });
    var izq = seccion('Resumen',
      '<div style="font-size:1.12rem;font-weight:800;letter-spacing:.01em;margin-bottom:2px;">' + escHtml(p.propiedad || '—') + '</div>' +
      '<div style="font-size:.82rem;color:var(--muted);margin-bottom:9px;">📍 ' + escHtml([p.direccion, p.barrio].filter(Boolean).join(' · ') || 'sin dirección cargada') + '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">' +
        '<span class="badge badge-muted">' + escHtml(p.tipoPropiedad || '—') + '</span>' +
        '<span class="badge badge-muted">' + escHtml(p.operacion || '—') + '</span>' +
        '<span class="badge ' + (p.estado === 'Publicada' ? 'badge-ok' : 'badge-muted') + '">' + escHtml(p.estado || '—') + '</span>' +
        '<span style="font-family:var(--mono);font-size:.95rem;font-weight:700;color:var(--gold);margin-left:auto;">' + valor + '</span>' +
      '</div>' +
      (carac.length ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px;">' +
        carac.map(function (x) {
          return '<div style="border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:5px 9px;background:rgba(255,255,255,0.012);">' +
            '<div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;">' + x[0] + '</div>' +
            '<div style="font-size:.84rem;font-weight:600;">' + escHtml(String(x[1])) + '</div></div>';
        }).join('') + '</div>' : '') +
      (d.propietario ? '<div style="font-size:.8rem;margin-top:9px;">🏠 Propietario: <b>' + escHtml(d.propietario.nombre) + '</b>' + (d.propietario.telefono ? ' · <a href="' + waHref(d.propietario.telefono) + '" target="_blank" rel="noopener" style="color:var(--gold);">' + escHtml(d.propietario.telefono) + '</a>' : '') + '</div>' : '<div class="small muted" style="margin-top:9px;">Sin propietario vinculado — vinculalo desde la ficha ✏️.</div>'));
    // checklist por COLORES — S44: grid de tarjetas high-quality + barra de progreso + dropzone
    var colorDe = { recibido: 'var(--ok)', pedido: '#5ec8d8', revisar: 'var(--warn)', recomendado: 'var(--warn)', bloqueante: 'var(--danger)', no_aplica: '#555', pendiente: '#999' };
    var lblDe = { recibido: '🟢 Validado', pedido: '📨 Pedido', revisar: '🟡 Recibido — revisar', recomendado: '🟡 Recomendado — falta', bloqueante: '🔴 OBLIGATORIO — falta', no_aplica: '⚪ No aplica', pendiente: '⚪ Opcional' };
    var nRec = (d.checklist || []).filter(function (c) { return c.estado === 'recibido'; }).length;
    var nTot = (d.checklist || []).filter(function (c) { return c.estado !== 'no_aplica'; }).length;
    var pct = nTot ? Math.round(nRec / nTot * 100) : 0;
    var chk = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">' +
      '<span class="badge" style="border:1.5px solid ' + (/legal|obligatorios/.test(sem.nivel) ? 'var(--danger)' : /comercial|operativo|proceso|pendiente|recibida/.test(sem.nivel) ? 'var(--warn)' : /Completo/.test(sem.nivel) ? 'var(--ok)' : 'var(--muted)') + ';font-size:.72rem;padding:3px 10px;">' + escHtml(sem.nivel || '—') + (sem.fase ? ' · ' + ({ captacion: 'captación', publicacion: 'publicación', operacion: 'operación' }[sem.fase] || sem.fase) : '') + '</span>' +
      '<div style="flex:1;min-width:140px;height:7px;border-radius:5px;background:rgba(255,255,255,0.07);overflow:hidden;"><div style="height:100%;width:' + pct + '%;border-radius:5px;background:linear-gradient(90deg,var(--gold),#e8c96a);transition:width .4s;"></div></div>' +
      '<span style="font-family:var(--mono);font-size:.74rem;color:var(--gold);">' + nRec + '/' + nTot + ' · ' + pct + '%</span></div>';
    // S63.1: checklist AGRUPADO por ETAPA (gate) — "qué falta para publicar / reserva / firma"
    var GATE_LBL_FRONT = { captacion: '📋 Para captar', publicacion: '🎯 Para PUBLICAR', reserva: '🎯 Para RESERVA / operación', firma: '🎯 Para CIERRE / firma', opcional: '⚪ Opcionales' };
    var GATE_SORT = ['captacion', 'publicacion', 'reserva', 'firma', 'opcional'];
    var LEG_FRONT = ['Escritura', 'Testimonio / Declaratoria / Partición', 'Certif. dominio', 'Inhibiciones', 'Poder'];
    var cardDoc = function (c) {
      var col = colorDe[c.estado] || '#999';
      var nombre = c.etiqueta || c.tipo;
      var esLeg = LEG_FRONT.indexOf(c.tipo) >= 0;
      return '<div style="border:1px solid rgba(255,255,255,0.07);border-left:3px solid ' + col + ';border-radius:9px;padding:7px 9px;background:rgba(255,255,255,0.015);' + (c.estado === 'no_aplica' ? 'opacity:.4;' : '') + '">' +
        '<div style="display:flex;align-items:center;gap:6px;">' +
          '<span style="flex:1;font-size:.79rem;font-weight:600;' + (c.estado === 'no_aplica' ? 'text-decoration:line-through;' : '') + '">' + escHtml(nombre) + (c.driveLink ? ' <a href="' + escHtml(c.driveLink) + '" target="_blank" rel="noopener" style="color:var(--muted);text-decoration:none;">↗</a>' : '') + '</span>' +
          '<span style="font-size:.62rem;color:' + col + ';white-space:nowrap;">' + lblDe[c.estado] + '</span></div>' +
        '<div style="display:flex;gap:3px;margin-top:5px;flex-wrap:wrap;">' +
          (c.estado !== 'recibido' ? '<button class="btn btn-ghost btn-sm" style="padding:1px 7px;font-size:.66rem;" title="Marcar pedido" onclick="lgDocAccion(\'' + c.tipo + '\',\'pedido\')">📨 pedir</button>' : '') +
          (c.estado !== 'recibido' ? '<button class="btn btn-ghost btn-sm" style="padding:1px 7px;font-size:.66rem;" title="' + (esLeg ? 'Validar LEGALMENTE: lo revisaste y está OK (revisión escribanía)' : 'Validar recepción: lo tengo y sirve') + '" onclick="lgValidarDoc(\'' + c.tipo + '\')">✓ ' + (esLeg ? 'validar legalmente' : 'validar recepción') + '</button>' : '<button class="btn btn-ghost btn-sm" style="padding:1px 7px;font-size:.66rem;" title="Volver a pendiente de revisión (desvalidar)" onclick="lgDesvalidarTipo(\'' + c.tipo + '\')">↩ desvalidar</button>') +
          (c.estado !== 'no_aplica' ? '<button class="btn btn-ghost btn-sm" style="padding:1px 7px;font-size:.66rem;" title="No aplica" onclick="lgDocAccion(\'' + c.tipo + '\',\'no_aplica\')">🚫</button>' : '<button class="btn btn-ghost btn-sm" style="padding:1px 7px;font-size:.66rem;" title="Restaurar" onclick="lgDocAccion(\'' + c.tipo + '\',\'reset\')">↺</button>') +
        '</div>' +
        (c.redFlags ? '<div style="font-size:.68rem;color:var(--danger);margin-top:4px;">🚩 ' + escHtml(c.redFlags) + '</div>' : '') +
      '</div>';
    };
    var grupos = {};
    (d.checklist || []).forEach(function (c) { (grupos[c.gate] = grupos[c.gate] || []).push(c); });
    GATE_SORT.forEach(function (gk) {
      var items = grupos[gk]; if (!items || !items.length) return;
      var nFalta = items.filter(function (c) { return c.estado === 'bloqueante'; }).length;
      chk += '<div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin:11px 0 5px;font-weight:700;">' + GATE_LBL_FRONT[gk] + (nFalta ? ' <span style="color:var(--danger);">· faltan ' + nFalta + '</span>' : '') + '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:7px;">' + items.map(cardDoc).join('') + '</div>';
    });
    // S44: DROPZONE — arrastrá el documento directo al legajo (o click para elegir)
    chk += '<div id="lg-dropzone" onclick="document.getElementById(\'lg-dropfile\').click()" style="margin-top:10px;border:2px dashed rgba(212,175,55,0.35);border-radius:11px;padding:16px;text-align:center;cursor:pointer;transition:all .2s;font-size:.8rem;color:var(--muted);">' +
      '📎 <b style="color:var(--text);">Arrastrá acá</b> la escritura, expensas, ABL, plano… <span style="opacity:.7;">(o hacé click)</span> — va al Drive y tilda el checklist solo' +
      '<input type="file" id="lg-dropfile" style="display:none;" onchange="lgFileElegido(this.files[0])"></div>' +
      '<div id="lg-droptipo" style="display:none;margin-top:8px;"></div>';
    // S61: lista de DOCUMENTOS ASOCIADOS (recibidos, pendientes de revisión) — arriba del checklist
    if ((d.documentos || []).length) {
      var docsAsoc = '<div style="font-size:.73rem;margin-bottom:7px;"><b style="color:var(--text);">📎 Documentos asociados (' + d.documentos.length + ')</b> <span style="color:var(--muted);">— recibidos por Hermes, pendientes de revisión</span></div>';
      docsAsoc += (d.documentos || []).map(function (x) {
        var ec = (typeof DOC_ESTADO_COLOR !== 'undefined' && DOC_ESTADO_COLOR[x.estado]) || 'var(--muted)';
        var fch = (x.creada || '').slice(0, 10);
        var orig = x.fuente === 'WhatsApp' ? '📱 WhatsApp' : '🖥 ' + (x.fuente || 'Panel');
        return '<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;border:1px solid rgba(255,255,255,0.06);border-left:3px solid ' + ec + ';border-radius:8px;padding:5px 9px;margin-bottom:5px;font-size:.76rem;">' +
          '<span style="font-weight:600;">' + escHtml(x.documento || 'documento') + '</span>' +
          (x.tipo ? '<span class="badge badge-muted">' + escHtml(x.tipo) + '</span>' : '<span class="badge" style="border:1px solid var(--muted);color:var(--muted);">sin tipo</span>') +
          '<span class="badge" style="border:1px solid ' + ec + '66;color:' + ec + ';">' + escHtml(x.estado || '') + '</span>' +
          '<span style="font-size:.64rem;color:var(--muted);font-family:var(--mono);">' + escHtml(orig) + ' · ' + fch + '</span>' +
          '<span style="margin-left:auto;display:inline-flex;gap:4px;">' +
            (x.driveLink ? '<a class="btn btn-ghost btn-sm" style="text-decoration:none;padding:1px 7px;font-size:.66rem;" href="' + escHtml(x.driveLink) + '" target="_blank" rel="noopener">↗ Drive</a>' : '') +
            '<button class="btn btn-ghost btn-sm" style="padding:1px 7px;font-size:.66rem;" title="Verlo en la Auditoría de cargas (marcar tipo / reasignar)" onclick="hideModal(\'modal-legajo\');crmTab(\'contactos\');contactosModo(\'auditoria\')">🗂 Auditoría</button>' +
          '</span></div>';
      }).join('');
      chk = docsAsoc + '<div style="height:9px;border-top:1px solid rgba(255,255,255,0.06);margin:4px 0 9px;"></div>' + chk;
    }
    // S62A.2: datos mínimos de captación (🔴 si faltan, aunque sea Borrador) — solo en fase captación
    if (d.fase === 'captacion' && (d.datosCaptacion || []).length) {
      var datosCapHtml = '<div style="margin-bottom:9px;font-size:.74rem;border:1px solid rgba(255,255,255,0.06);border-radius:9px;padding:7px 10px;background:rgba(255,255,255,0.012);"><b style="color:var(--text);">📋 Datos mínimos de captación</b> ' +
        (d.datosCaptacion || []).map(function (x) { return '<span class="badge" style="border:1px solid ' + (x.ok ? 'var(--ok)' : 'var(--danger)') + '66;color:' + (x.ok ? 'var(--ok)' : 'var(--danger)') + ';margin-left:5px;">' + (x.ok ? '🟢' : '🔴') + ' ' + escHtml(x.item) + '</span>'; }).join('') + '</div>';
      chk = datosCapHtml + chk;
    }
    izq += seccion('📥 Documental', chk);
    // S64.1: bloque Sucesión / Tracto abreviado (cuando hay Testimonio/Declaratoria) — ítems manuales de revisión
    if (d.esSucesion && (d.sucesion || []).length) {
      var SUC_COL = { recibido: 'var(--ok)', pedido: '#5ec8d8', pendiente: 'var(--warn)', no_aplica: '#555' };
      var SUC_LBL = { recibido: '🟢 Verificado', pedido: '📨 Pedido / gestión', pendiente: '🟡 Pendiente escribanía', no_aplica: '⚪ No aplica' };
      var sucHtml = '<div style="font-size:.72rem;color:var(--muted);margin-bottom:8px;">Una declaratoria/partición <b style="color:var(--text);">no limpia el riesgo sola</b> — revisá con escribanía: ¿se escritura por tracto abreviado?, ¿firman todos los herederos o uno solo?, ¿asentimiento conyugal?, ¿la UF/matrícula es la unidad exacta?, ¿dominio/inhibiciones/deudas?</div>';
      sucHtml += (d.sucesion || []).map(function (s) {
        var col = SUC_COL[s.estado] || 'var(--warn)';
        var it = (s.item || '').replace(/'/g, '');
        return '<div style="border:1px solid rgba(255,255,255,0.07);border-left:3px solid ' + col + ';border-radius:9px;padding:6px 9px;margin-bottom:5px;">' +
          '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
            '<span style="flex:1;font-size:.77rem;font-weight:600;' + (s.estado === 'no_aplica' ? 'text-decoration:line-through;opacity:.6;' : '') + '">' + escHtml(s.item) + '</span>' +
            '<span style="font-size:.62rem;color:' + col + ';white-space:nowrap;">' + (SUC_LBL[s.estado] || s.estado) + '</span></div>' +
          '<div style="display:flex;gap:3px;margin-top:4px;flex-wrap:wrap;">' +
            (s.estado !== 'recibido' ? '<button class="btn btn-ghost btn-sm" style="padding:1px 7px;font-size:.66rem;" title="Marcar verificado (revisado y OK con escribanía)" onclick="lgDocAccion(\'' + it + '\',\'recibido\')">✓ verificado</button>' : '<button class="btn btn-ghost btn-sm" style="padding:1px 7px;font-size:.66rem;" title="Volver a pendiente" onclick="lgDocAccion(\'' + it + '\',\'reset\')">↩ pendiente</button>') +
            (s.estado !== 'pedido' && s.estado !== 'recibido' ? '<button class="btn btn-ghost btn-sm" style="padding:1px 7px;font-size:.66rem;" title="En gestión / pedido a escribanía" onclick="lgDocAccion(\'' + it + '\',\'pedido\')">📨 en gestión</button>' : '') +
            (s.estado !== 'no_aplica' ? '<button class="btn btn-ghost btn-sm" style="padding:1px 7px;font-size:.66rem;" title="No aplica" onclick="lgDocAccion(\'' + it + '\',\'no_aplica\')">🚫</button>' : '<button class="btn btn-ghost btn-sm" style="padding:1px 7px;font-size:.66rem;" title="Restaurar" onclick="lgDocAccion(\'' + it + '\',\'reset\')">↺</button>') +
          '</div></div>';
      }).join('');
      izq += seccion('🏛 Sucesión / Tracto abreviado', sucHtml);
    }
    izq += seccion('🧮 Tasaciones (' + (d.tasaciones || []).length + ')',
      (d.tasaciones || []).length ? d.tasaciones.map(function (x) {
        return '<div style="display:flex;gap:8px;align-items:center;padding:3px 0;font-size:.78rem;flex-wrap:wrap;"><span style="flex:1;">' + escHtml(x.tasacion) + '</span><span class="badge badge-muted">' + escHtml(x.estado || '') + '</span>' + (x.precioCierre ? '<span style="font-family:var(--mono);color:var(--gold);">USD ' + Number(x.precioCierre).toLocaleString('es-AR') + '</span>' : '') + '<button class="btn btn-ghost btn-sm" onclick="hideModal(\'modal-legajo\');crmTab(\'propiedades\');abrirTasacion(\'' + x.id + '\')">abrir</button></div>';
      }).join('') : '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:.8rem;color:var(--muted);">Todavía no hay tasación para esta propiedad.<button class="btn btn-gold btn-sm" onclick="tasarDesdeLegajo()">+ Tasar esta propiedad</button></div>',
      '<button class="btn btn-gold btn-sm" style="padding:2px 9px;font-size:.7rem;" onclick="tasarDesdeLegajo()" title="Crea una tasación pre-llenada y VINCULADA a esta propiedad">+ Tasar esta propiedad</button>');
    izq += seccion('🛒 Interesados (' + (d.interesados || []).length + ')',
      (d.interesados || []).length ? d.interesados.map(function (c) {
        return '<div style="display:flex;gap:8px;align-items:center;padding:2px 0;font-size:.78rem;"><span style="flex:1;">' + escHtml(c.nombre) + '</span><span class="badge badge-muted">' + escHtml(c.etapaDemanda || '—') + '</span>' + (c.telefono ? '<a class="btn btn-ghost btn-sm" style="text-decoration:none;padding:0 6px;" href="' + waHref(c.telefono) + '" target="_blank" rel="noopener">💬</a>' : '') + '</div>';
      }).join('') : '<div class="small muted">Sin interesados.</div>');
    izq += seccion('💼 Operaciones (' + (d.operaciones || []).length + ')',
      (d.operaciones || []).length ? d.operaciones.map(function (o) {
        return '<div style="display:flex;gap:8px;font-size:.78rem;padding:2px 0;"><span style="flex:1;">' + escHtml(o.operacion) + '</span><span class="badge badge-muted">' + escHtml(o.etapa || '') + '</span></div>';
      }).join('') : '<div class="small muted">Sin operaciones.</div>');
    // ═ DOCK DE HERMES (derecha) — S44: avatar real + header high-quality
    var dock = '<div style="border:1px solid rgba(94,200,216,0.45);border-radius:14px;padding:13px;position:sticky;top:0;background:linear-gradient(180deg,rgba(94,200,216,0.06),rgba(94,200,216,0.01));">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding-bottom:9px;border-bottom:1px solid rgba(94,200,216,0.2);">' +
        '<img src="/images/hermes-avatar.webp" alt="Hermes" style="width:38px;height:38px;border-radius:50%;object-fit:cover;border:2px solid rgba(94,200,216,0.6);box-shadow:0 0 12px rgba(94,200,216,0.25);" onerror="this.style.display=\'none\'">' +
        '<div><strong style="color:#5ec8d8;font-size:.92rem;display:block;letter-spacing:.02em;">HERMES</strong><span style="font-size:.66rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;">Asistente del Legajo</span></div></div>' +
      '<div style="display:flex;gap:4px;margin-bottom:10px;flex-wrap:wrap;">' +
        ['resumen|📊 Resumen', 'chat|💬 Chat', 'comentarios|🗒 Notas', 'mensajes|📨 Mensajes'].map(function (x) {
          var pr = x.split('|');
          return '<button class="btn btn-ghost btn-sm lgdock-tab" data-t="' + pr[0] + '" onclick="lgDockTab(\'' + pr[0] + '\')">' + pr[1] + '</button>';
        }).join('') + '</div>';
    // resumen
    var tiene = (d.checklist || []).filter(function (c) { return c.estado === 'recibido'; }).map(function (c) { return c.tipo; });
    var pedir = (d.checklist || []).filter(function (c) { return c.estado === 'pendiente' || c.estado === 'bloqueante'; }).map(function (c) { return c.tipo; });
    var revisar = (d.checklist || []).filter(function (c) { return c.estado === 'revisar'; }).map(function (c) { return c.tipo; });
    // S51 F6: resumen ACTIVO en lenguaje natural (derivado de semáforos — instantáneo, sin LLM)
    var resumenActivo = (function () {
      var partes = [];
      partes.push('La propiedad está ' + (p.estado === 'Publicada' ? '**publicada**' : '**' + (p.estado || 'en preparación').toLowerCase() + '**'));
      if ((d.interesados || []).length) partes.push('con ' + d.interesados.length + ' interesado(s)');
      var frase = partes.join(' ');
      if (pedir.length) frase += ', pero documentalmente incompleta. Bloquea/falta: ' + pedir.slice(0, 5).join(', ') + '.';
      else frase += '. Documentación al día.';
      if (!tiene.length && !pedir.length) frase = 'Recién cargada. Arrancá pidiendo la documentación inicial.';
      return frase;
    })();
    var primerMsg = (d.mensajesSugeridos || [])[0];
    dock += '<div class="lgdock-pane" id="lgdock-resumen">' +
      '<div style="background:rgba(94,200,216,0.08);border-left:3px solid #5ec8d8;border-radius:8px;padding:9px 11px;font-size:.8rem;line-height:1.5;margin-bottom:10px;">' + escHtml(resumenActivo) + '</div>' +
      '<div style="font-size:.74rem;line-height:1.6;">' +
        '<div>✅ <b>Tenemos:</b> ' + (tiene.join(', ') || '—') + '</div>' +
        '<div>📨 <b>Falta pedir:</b> ' + (pedir.join(', ') || '—') + '</div>' +
        (revisar.length ? '<div>🟡 <b>Falta revisar:</b> ' + revisar.join(', ') + '</div>' : '') +
        ((sem.bloqueos || []).length ? '<div style="color:var(--danger);">⛔ <b>Bloquea:</b> ' + sem.bloqueos.map(function (b) { return b.detalle; }).join(' · ') + '</div>' : '') +
        '<div style="margin-top:6px;">▶ <b>' + escHtml(d.proximaAccion || '') + '</b></div>' +
      '</div>' +
      (primerMsg ? '<button class="btn btn-gold btn-sm" style="margin-top:10px;width:100%;" onclick="copiarBorrador(this)" data-msg="' + escHtml(primerMsg.texto) + '">📋 Copiar mensaje al propietario</button>' : '') +
      '</div>';
    // chat — S44: + nota de voz (Whisper) y altura más generosa
    dock += '<div class="lgdock-pane" id="lgdock-chat" style="display:none;">' +
      '<div id="lg-chat-log" style="max-height:380px;overflow-y:auto;font-size:.76rem;margin-bottom:8px;"><div class="small muted">Preguntale a Hermes sobre ESTA propiedad — por texto o con una 🎤 nota de voz: "¿qué falta para publicar?" · "¿qué le pido al propietario?" · "¿qué riesgos ves?"</div></div>' +
      '<div style="display:flex;gap:6px;align-items:center;">' +
        '<input class="input" id="lg-chat-input" placeholder="Preguntale a Hermes…" style="flex:1;" onkeydown="if(event.key===\'Enter\')lgChatSend()">' +
        '<button class="btn btn-ghost btn-sm" id="lg-mic-btn" title="Mantené una conversación por voz: grabás, Whisper transcribe y Hermes responde" onclick="lgAudioToggle()">🎤</button>' +
        '<button class="btn btn-gold btn-sm" onclick="lgChatSend()">➤</button></div></div>';
    // comentarios
    dock += '<div class="lgdock-pane" id="lgdock-comentarios" style="display:none;">' +
      '<div style="max-height:240px;overflow-y:auto;font-size:.74rem;margin-bottom:8px;">' +
      ((d.comentarios || []).length ? d.comentarios.map(function (c) { return '<div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);"><b>' + escHtml(c.autor) + '</b> <span style="color:var(--muted);font-size:.66rem;">' + escHtml((c.ts || '').slice(5, 16).replace('T', ' ')) + '</span><br>' + escHtml(c.texto) + '</div>'; }).join('') : '<div class="small muted">Sin notas todavía.</div>') +
      ((d.historial || []).filter(function (h) { return h.accion !== 'comentario'; }).slice(0, 6).map(function (h) { return '<div style="padding:3px 0;color:var(--muted);font-size:.68rem;">⚙ ' + escHtml((h.ts || '').slice(5, 16).replace('T', ' ')) + ' · ' + escHtml(h.accion) + '</div>'; }).join('')) +
      '</div>' +
      '<div style="display:flex;gap:6px;"><input class="input" id="lg-coment-input" placeholder="Nota interna…" style="flex:1;" onkeydown="if(event.key===\'Enter\')lgComentar()"><button class="btn btn-ghost btn-sm" onclick="lgComentar()">＋</button></div></div>';
    // mensajes
    dock += '<div class="lgdock-pane" id="lgdock-mensajes" style="display:none;">' +
      ((d.mensajesSugeridos || []).length ? d.mensajesSugeridos.map(function (m) {
        return '<div style="border:1px solid var(--border);border-radius:8px;padding:7px 9px;margin-bottom:7px;">' +
          '<div style="font-size:.74rem;font-weight:700;margin-bottom:3px;">' + escHtml(m.titulo) + '</div>' +
          '<div style="font-size:.7rem;color:var(--muted);max-height:64px;overflow:hidden;">' + escHtml(m.texto) + '</div>' +
          '<div style="display:flex;gap:5px;margin-top:5px;"><button class="btn btn-gold btn-sm" onclick="copiarBorrador(this)" data-msg="' + escHtml(m.texto) + '">📋 Copiar</button>' +
          (m.destinatario ? '<a class="btn btn-ghost btn-sm" style="text-decoration:none;" href="' + waHref(m.destinatario) + '" target="_blank" rel="noopener">💬 Abrir chat</a>' : '') + '</div></div>';
      }).join('') : '<div class="small muted">Sin mensajes sugeridos.</div>') + '</div>';
    dock += '</div>';
    if (body) body.innerHTML = cabeceraHtml + accionHtml + '<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;"><div style="flex:1.5;min-width:420px;">' + izq + '</div><div style="flex:1;min-width:320px;">' + dock + '</div></div>';
    lgDockTab('resumen');
    lgDropWire();
  }
  window.abrirLegajo = abrirLegajo;
  // S62A.3: guardar el tipo de unidad desde el Legajo (editable). Reusa /crm/propiedad/actualizar.
  window.lgSetTipoUnidad = async function (tipo) {
    if (!tipo || !window.lgId) return;
    var r = await apiFetch('/crm/propiedad/actualizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: window.lgId, tipoPropiedad: tipo }) });
    if (r && r.ok) { toast('🏷 Tipo de unidad: ' + tipo, 'ok'); if (window.lgData && window.lgData.propiedad) window.lgData.propiedad.tipoPropiedad = tipo; }
    else toast('No se pudo guardar el tipo de unidad', 'err');
  };
  // S62A.4: tasar desde el Legajo — pre-llena el modal y vincula la tasación a la propiedad
  window.tasarDesdeLegajo = function () {
    var p = (window.lgData || {}).propiedad; if (!p) return;
    window.tasarDesdePropId = window.lgId;
    var set = function (id, val) { var e = document.getElementById(id); if (e) e.value = (val != null ? val : ''); };
    set('ts-titulo', p.propiedad || '');
    set('ts-direccion', p.direccion || '');
    set('ts-barrio', p.barrio || '');
    set('ts-m2cub', p.m2Cubiertos || p.m2Totales || '');
    var tt = document.getElementById('ts-tipo');
    if (tt && p.tipoPropiedad) { for (var i = 0; i < tt.options.length; i++) { if (tt.options[i].value === p.tipoPropiedad || tt.options[i].text === p.tipoPropiedad) { tt.selectedIndex = i; break; } } }
    hideModal('modal-legajo'); nav('tasaciones'); showModal('modal-tasacion');
    toast('Pre-llenado desde ' + (p.propiedad || 'la propiedad') + ' — completá m²/piso y creá', 'ok');
  };

  /* S44: drag & drop de documentos directo al legajo */
  function lgDropWire() {
    var dz = document.getElementById('lg-dropzone');
    if (!dz) return;
    ['dragover', 'dragenter'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); dz.style.borderColor = 'var(--gold)'; dz.style.background = 'rgba(212,175,55,0.1)'; }); });
    ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); dz.style.borderColor = 'rgba(212,175,55,0.35)'; dz.style.background = ''; }); });
    dz.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) lgFileElegido(f); });
  }

  function lgFileElegido(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return toast('Máx 20MB', 'err');
    window.lgPendingFile = file;
    var tipos = (((window.lgData || {}).checklist) || []).map(function (c) { return c.tipo; });
    if (!tipos.length) tipos = ['Escritura', 'Expensas', 'ABL', 'Plano'];
    if (tipos.indexOf('Fotos') < 0) tipos.push('Fotos');
    tipos.push('Otro');
    var box = document.getElementById('lg-droptipo');
    if (!box) return;
    box.style.display = '';
    box.innerHTML = '<div style="border:1px solid var(--gold);border-radius:10px;padding:9px 11px;background:rgba(212,175,55,0.05);">' +
      '<div style="font-size:.76rem;margin-bottom:6px;">📄 <b>' + escHtml(file.name) + '</b> — ¿qué documento es?</div>' +
      '<div style="display:flex;gap:5px;flex-wrap:wrap;">' +
      tipos.map(function (t2) { return '<button class="btn btn-ghost btn-sm" onclick="lgUploadDrop(\'' + escHtml(t2).replace(/'/g, '') + '\')">' + escHtml(t2) + '</button>'; }).join('') +
      '<button class="btn btn-ghost btn-sm" style="margin-left:auto;" onclick="window.lgPendingFile=null;document.getElementById(\'lg-droptipo\').style.display=\'none\'">✕</button>' +
      '</div></div>';
  }
  window.lgFileElegido = lgFileElegido;

  function lgUploadDrop(tipo) {
    var file = window.lgPendingFile;
    if (!file) return;
    var box = document.getElementById('lg-droptipo');
    if (box) box.innerHTML = '<div class="small muted" style="padding:8px;">☁️ Subiendo <b>' + escHtml(file.name) + '</b> como ' + escHtml(tipo) + '… (Drive + checklist' + (tipo === 'Escritura' ? ' + análisis automático de titulares/gravámenes' : '') + ')</div>';
    var reader = new FileReader();
    reader.onload = async function () {
      var d = await apiFetch('/crm/propiedad/doc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: window.lgId, tipoDoc: tipo, filename: file.name, base64: String(reader.result) }) });
      window.lgPendingFile = null;
      if (d && d.ok) { toast('☁️ ' + escHtml(tipo) + ' guardado en Drive' + (tipo === 'Escritura' ? ' — analizando escritura…' : ''), 'ok'); abrirLegajo(window.lgId); }
      else { toast('Error: ' + ((d && d.error) || 'no pude subir'), 'err'); if (box) box.style.display = 'none'; }
    };
    reader.readAsDataURL(file);
  }
  window.lgUploadDrop = lgUploadDrop;

  /* S44: nota de voz a Hermes (MediaRecorder → Whisper → chat con contexto) */
  window.lgRec = null;
  // S51 F7: helper GENÉRICO de grabación directa — toggle (1er click graba, 2º envía).
  // Reutilizable por Legajo, Hermes Console, Tasación e Import. El audio NUNCA se sube como
  // archivo (pedido Franco): siempre se graba y se procesa. btnEl muestra el estado ⏹.
  function grabarAudioYProcesar(btnEl, onBase64, onStart) {
    if (window.audioRec) { try { window.audioRec.stop(); } catch (e) {} return; } // ya grabando → frenar+enviar
    if (!navigator.mediaDevices || !window.MediaRecorder) return toast('Tu navegador no soporta grabación de audio', 'err');
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var chunks = [];
      var rec = new MediaRecorder(stream);
      var prev = btnEl ? btnEl.innerHTML : '';
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        window.__ophRecStop = performance.now(); // S103A.1 · A6: stamp inerte para medir grabación/encoding (lo ignoran los demás usuarios del helper)
        stream.getTracks().forEach(function (t2) { t2.stop(); });
        window.audioRec = null;
        if (btnEl) { btnEl.innerHTML = prev; btnEl.classList.remove('btn-danger'); }
        if (window.audioRecCancelled) { window.audioRecCancelled = false; toast('Grabación descartada', 'ok'); return; } // S102C: cancelado → NO envía
        var blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        if (blob.size < 1200) return toast('Audio muy corto — probá de nuevo', 'err');
        var fr = new FileReader();
        fr.onload = function () { onBase64(String(fr.result)); };
        fr.readAsDataURL(blob);
      };
      rec.start();
      window.audioRec = rec; window.audioRecCancelled = false;
      if (btnEl) { btnEl.innerHTML = '⏹ Grabando… (tocá para enviar)'; btnEl.classList.add('btn-danger'); }
      if (typeof onStart === 'function') { try { onStart(); } catch (e) {} }
      toast('🎤 Grabando… tocá de nuevo para enviar', 'ok');
    }).catch(function () { toast('No pude acceder al micrófono (permiso denegado)', 'err'); });
  }
  window.grabarAudioYProcesar = grabarAudioYProcesar;
  // S102C: cancelar la grabación en curso SIN enviar (descarta el audio).
  window.cancelarAudioRec = function () { if (window.audioRec) { window.audioRecCancelled = true; try { window.audioRec.stop(); } catch (e) {} } };

  function lgAudioToggle() {
    grabarAudioYProcesar(document.getElementById('lg-mic-btn'), function (b64) { lgChatSendAudio(b64); });
  }
  window.lgAudioToggle = lgAudioToggle;

  async function lgChatSendAudio(b64) {
    var log = document.getElementById('lg-chat-log');
    if (log) { log.innerHTML += '<div style="text-align:right;margin:4px 0;"><span id="lg-chat-audiobubble" style="background:rgba(212,166,64,0.15);border-radius:8px;padding:4px 8px;display:inline-block;">🎤 <i>transcribiendo…</i></span></div><div id="lg-chat-wait" class="small muted">Hermes está escuchando…</div>'; log.scrollTop = log.scrollHeight; }
    var d = await apiFetch('/crm/propiedad/' + window.lgId + '/hermes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: b64, filename: 'nota.webm' }) });
    var w = document.getElementById('lg-chat-wait'); if (w) w.remove();
    var bub = document.getElementById('lg-chat-audiobubble');
    if (bub) { bub.innerHTML = '🎤 ' + escHtml((d && d.transcripcion) || '(no entendí el audio)'); bub.removeAttribute('id'); }
    lgChatPintarRespuesta(d, log);
  }
  window.lgChatSendAudio = lgChatSendAudio;

  function lgChatPintarRespuesta(d, log) {
    if (!log) log = document.getElementById('lg-chat-log');
    if (!log) return;
    var txt = (d && d.respuesta) || (d && d.error) ||
      (d && d.__error ? '⚠ Error técnico (' + d.__error + ') — reintentá; si persiste avisale a Claudio.' : 'No pude responder.');
    log.innerHTML += '<div style="display:flex;gap:6px;align-items:flex-start;margin:5px 0;">' +
      '<img src="/images/hermes-avatar.webp" alt="" style="width:20px;height:20px;border-radius:50%;object-fit:cover;flex-shrink:0;margin-top:2px;" onerror="this.outerHTML=\'🪽\'">' +
      '<span style="background:rgba(94,200,216,0.12);border-radius:8px;padding:5px 9px;display:inline-block;white-space:pre-wrap;">' + escHtml(txt) + '</span></div>';
    log.scrollTop = log.scrollHeight;
  }

  function lgDockTab(which) {
    document.querySelectorAll('.lgdock-pane').forEach(function (x) { x.style.display = 'none'; });
    var el = document.getElementById('lgdock-' + which); if (el) el.style.display = '';
    document.querySelectorAll('.lgdock-tab').forEach(function (b) { b.style.borderColor = b.dataset.t === which ? 'var(--gold)' : ''; });
  }
  window.lgDockTab = lgDockTab;

  async function lgChatSend() {
    var inp = document.getElementById('lg-chat-input');
    var q = inp ? inp.value.trim() : '';
    if (!q) return;
    inp.value = '';
    var log = document.getElementById('lg-chat-log');
    if (log) { log.innerHTML += '<div style="text-align:right;margin:4px 0;"><span style="background:rgba(212,166,64,0.15);border-radius:8px;padding:4px 8px;display:inline-block;">' + escHtml(q) + '</span></div><div id="lg-chat-wait" class="small muted">Hermes está pensando…</div>'; log.scrollTop = log.scrollHeight; }
    var d = await apiFetch('/crm/propiedad/' + window.lgId + '/hermes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pregunta: q }) });
    var w = document.getElementById('lg-chat-wait'); if (w) w.remove();
    lgChatPintarRespuesta(d, log);
  }
  window.lgChatSend = lgChatSend;

  async function lgComentar() {
    var inp = document.getElementById('lg-coment-input');
    var txt = inp ? inp.value.trim() : '';
    if (!txt) return;
    var d = await apiFetch('/crm/propiedad/comentario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: window.lgId, texto: txt }) });
    if (d && d.ok) { toast('Nota guardada', 'ok'); abrirLegajo(window.lgId); }
  }
  window.lgComentar = lgComentar;

  async function lgDocAccion(tipo, estado) {
    var d = await apiFetch('/crm/propiedad/doc-gestion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: window.lgId, tipoDoc: tipo, estado: estado }) });
    if (d && d.ok) abrirLegajo(window.lgId);
  }
  window.lgDocAccion = lgDocAccion;
  // S62A.2: validar un ítem del checklist — CONFIRMA para legales (Escritura/Dominio/Inhibiciones/Poder)
  var DOC_LEGALES_FRONT = ['Escritura', 'Testimonio / Declaratoria / Partición', 'Certif. dominio', 'Inhibiciones', 'Poder'];
  window.lgValidarDoc = function (tipo) {
    if (DOC_LEGALES_FRONT.indexOf(tipo) >= 0 && !confirm('⚠️ ' + tipo + ' es un documento LEGAL.\n\n¿Confirmás que lo revisaste y está OK para marcarlo VALIDADO?\n(🟢 verde = validado legalmente, no solo recibido.)')) return;
    lgDocAccion(tipo, 'recibido');
  };
  // S62A.2: desvalidar — vuelve el ítem a pendiente; si hay un DOC validado de ese tipo, lo revierte también
  window.lgDesvalidarTipo = async function (tipo) {
    var vals = ((window.lgData || {}).documentos || []).filter(function (x) { return x.tipo === tipo && x.estado === 'Validado'; });
    for (var i = 0; i < vals.length; i++) {
      await apiFetch('/crm/doc-inbox/desvalidar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: vals[i].id }) });
    }
    await apiFetch('/crm/propiedad/doc-gestion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: window.lgId, tipoDoc: tipo, estado: vals.length ? 'revisar' : 'reset' }) });
    toast('↩ ' + tipo + ' vuelto a pendiente de revisión', 'ok');
    abrirLegajo(window.lgId);
  };

  async function lgMarcarPedidos() {
    var faltan = ((window.lgData || {}).checklist || []).filter(function (c) { return c.estado === 'pendiente' || c.estado === 'bloqueante'; });
    for (var i = 0; i < faltan.length; i++) {
      await apiFetch('/crm/propiedad/doc-gestion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: window.lgId, tipoDoc: faltan[i].tipo, estado: 'pedido' }) });
    }
    toast('📨 ' + faltan.length + ' documentos marcados como pedidos', 'ok');
    abrirLegajo(window.lgId);
  }
  window.lgMarcarPedidos = lgMarcarPedidos;

  async function lgCrearTarea() {
    var d = window.lgData || {};
    var r = await apiFetch('/tasks/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: (d.proximaAccion || 'Seguimiento') + ' — ' + ((d.propiedad || {}).propiedad || ''), notes: 'Desde el Legajo del Gringo CRM' }) });
    if (r && r.ok) toast('Tarea creada en el Task OS', 'ok'); else toast('Error al crear tarea', 'err');
  }
  window.lgCrearTarea = lgCrearTarea;

  /* ─── T1: Tasaciones por comparables ─── */
  async function loadTasaciones() {
    var el = document.getElementById('crm-tasaciones');
    if (!el) return;
    var d = await apiFetch('/crm/tasaciones');
    if (!d || d.__error || !d.ok) { el.innerHTML = '<span class="small muted">No pude leer tasaciones.</span>'; return; }
    el.innerHTML = (d.items || []).length ? d.items.map(function (t) {
      return '<div onclick="abrirTasacion(\'' + t.id + '\')" style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;" title="Click para abrir">' +
        '<span style="flex:1;font-weight:600;font-size:.84rem;">' + escHtml(t.tasacion) + '</span>' +
        '<span class="badge badge-muted">' + escHtml(t.barrio || '—') + '</span>' +
        '<span style="font-family:var(--mono);font-size:.74rem;color:var(--muted);">' + (t.m2Pond || '—') + 'm²</span>' +
        (t.tasacionUsd ? '<span style="font-family:var(--mono);font-size:.8rem;color:var(--gold);">USD ' + Number(t.tasacionUsd).toLocaleString('es-AR') + '</span>' : '') +
        '<span class="badge ' + (t.estado === 'Lista' ? 'badge-ok' : 'badge-muted') + '">' + escHtml(t.estado || '—') + '</span>' +
      '</div>';
    }).join('') : '<span class="small muted">Sin tasaciones — creá la primera y pegale links de Zonaprop de comparables.</span>';
  }
  window.loadTasaciones = loadTasaciones;

  async function crearTasacion() {
    var v = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };
    if (!v('ts-titulo')) return toast('El título es requerido', 'err');
    var co = document.getElementById('ts-cochera');
    var propId = window.tasarDesdePropId; window.tasarDesdePropId = null; // S62A.4: vincular a la propiedad y consumir una sola vez
    var d = await apiFetch('/crm/tasacion', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasacion: v('ts-titulo'), direccion: v('ts-direccion'), barrio: v('ts-barrio'), tipoPropiedad: v('ts-tipo'), m2Cubiertos: Number(v('ts-m2cub')) || 0, m2Balcon: Number(v('ts-m2balcon')) || 0, m2Terraza: Number(v('ts-m2terraza')) || 0, m2Semicubiertos: Number(v('ts-m2semi')) || 0, m2Patio: Number(v('ts-m2patio')) || 0, precioPretendido: Number(v('ts-pretendido')) || undefined, piso: v('ts-piso') !== '' ? Number(v('ts-piso')) : undefined, pisosEdificio: Number(v('ts-pisosedif')) || undefined, antiguedad: Number(v('ts-antiguedad')) || undefined, orientacion: v('ts-orientacion') || undefined, disposicion: v('ts-disposicion') || undefined, cochera: !!(co && co.checked), operacion: 'Venta', objetivo: 'Captación', propiedadId: propId || undefined })
    });
    if (d && d.ok) { hideModal('modal-tasacion'); toast('Tasación creada — ' + d.m2Ponderados + ' m² ponderados. Ahora pegale comparables.', 'ok'); loadTasaciones(); abrirTasacion(d.id); }
    else toast('Error: ' + ((d && d.error) || 'sin conexión'), 'err');
  }
  window.crearTasacion = crearTasacion;

  async function abrirTasacion(id) {
    var el = document.getElementById('crm-tasacion-detalle');
    if (!el) return;
    el.innerHTML = '<div class="skeleton skeleton-block" style="height:80px;"></div>';
    var d = await apiFetch('/crm/tasacion/' + id);
    if (!d || d.__error || !d.ok) { el.innerHTML = '<span class="small muted">Error al abrir.</span>'; return; }
    window.tsDetalle = d;
    // S95B.3 (regla Franco): EJECUTIVA solo si hay informe presentable (precio cerrado + estado informe/entregada/lista);
    // si no, la ficha abre en TÉCNICA/INTAKE = la vista de trabajo. El toggle manual se respeta dentro de la misma tasación.
    var t0 = d.tasacion || {};
    var presentable = !!t0.precioCierre && /informe|entreg|lista|present/i.test(t0.estado || '');
    if (window.tsVistaFor !== id) { window.tsVista = presentable ? 'ejecutiva' : 'tecnica'; window.tsVistaFor = id; }
    renderTasacionDetalle();
  }
  // S50: render separado — el toggle ejecutiva/técnica no refetchea
  function renderTasacionDetalle() {
    var el = document.getElementById('crm-tasacion-detalle');
    var d = window.tsDetalle;
    if (!el || !d) return;
    var t = d.tasacion, comps = d.comparables || [];
    var EA_COL = { Aceptado: 'var(--ok)', Descartado: 'var(--danger)', Revisado: '#5ec8d8', Importado: 'var(--warn)', Borrador: 'var(--muted)' };
    var filas = comps.map(function (c) {
      var excl = c.estadoAviso === 'Excluido' || c.outlier || c.estadoAnalisis === 'Descartado';
      var est = c.estadoAviso === 'Excluido' ? '🚫' : c.outlier ? '⚠ outlier' : c.similar ? '✓' : '✕';
      var eaCol = EA_COL[c.estadoAnalisis] || 'var(--muted)';
      var subline = (c.portal ? '<span style="opacity:.8;">' + escHtml(c.portal) + '</span>' : '') +
        (c.estadoAnalisis ? ' · <span style="color:' + eaCol + ';">' + escHtml(c.estadoAnalisis) + '</span>' : '') +
        (c.score != null ? ' · score ' + c.score : '') +
        (c.fechaCaptura ? ' · ' + escHtml(String(c.fechaCaptura).slice(0, 10)) : '');
      return '<tr style="border-top:1px solid rgba(255,255,255,0.06);' + (excl ? 'opacity:.45;' : '') + '">' +
        '<td style="padding:4px 6px;font-size:.76rem;max-width:210px;" title="' + escHtml(c.motivoExclusion || c.notas || '') + '">' +
          '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (c.link ? '<a href="' + escHtml(c.link) + '" target="_blank" rel="noopener" style="color:var(--text);">' + escHtml(c.comparable) + ' ↗</a>' : escHtml(c.comparable)) + '</div>' +
          (subline ? '<div style="font-size:.6rem;color:var(--muted);margin-top:1px;">' + subline + '</div>' : '') + '</td>' +
        '<td style="padding:4px 6px;font-family:var(--mono);font-size:.74rem;text-align:right;">' + (c.precio ? c.precio.toLocaleString('es-AR') : '—') + '</td>' +
        '<td style="padding:4px 6px;font-family:var(--mono);font-size:.74rem;text-align:right;">' + (c.precioAjustado ? c.precioAjustado.toLocaleString('es-AR') : '—') + (c.cochera ? ' 🚗' : '') + '</td>' +
        '<td style="padding:4px 6px;font-family:var(--mono);font-size:.74rem;text-align:right;">' + (c.m2Pond || '—') + '</td>' +
        '<td style="padding:4px 6px;font-family:var(--mono);font-size:.78rem;text-align:right;color:var(--gold);">' + (c.usdM2 ? c.usdM2.toLocaleString('es-AR') : '—') + '</td>' +
        '<td style="padding:4px 6px;font-family:var(--mono);font-size:.7rem;text-align:right;">' + (c.diasPublicado != null ? c.diasPublicado + 'd' : '—') + '</td>' +
        '<td style="padding:4px 6px;font-size:.74rem;text-align:center;">' + est + '</td>' +
        '<td style="padding:4px 6px;text-align:center;white-space:nowrap;">' +
          (c.estadoAnalisis !== 'Aceptado' ? '<button class="btn btn-ghost btn-sm" style="padding:0 5px;" title="Aceptar (revisado y OK para la base/cálculo)" onclick="comparableAnalisis(\'' + c.id + '\',\'Aceptado\',\'' + t.id + '\')">✓</button>' : '') +
          (c.estadoAnalisis !== 'Descartado' ? '<button class="btn btn-ghost btn-sm" style="padding:0 5px;" title="Descartar (sale del cálculo, con motivo)" onclick="comparableAnalisis(\'' + c.id + '\',\'Descartado\',\'' + t.id + '\')">🗑</button>' : '<button class="btn btn-ghost btn-sm" style="padding:0 5px;" title="Re-incluir (Importado)" onclick="comparableAnalisis(\'' + c.id + '\',\'Importado\',\'' + t.id + '\')">↺</button>') +
          (c.comparableKey ? '<button class="btn btn-ghost btn-sm" style="padding:0 5px;" title="Ver qué decía el aviso al momento de tasar (snapshots)" onclick="verSnapshotComparable(\'' + c.comparableKey + '\')">📄</button>' : '') +
          '<button class="btn btn-ghost btn-sm" style="padding:0 5px;" title="' + (c.estadoAviso === 'Excluido' ? 'Re-incluir en el cálculo' : 'Excluir del cálculo (técnico)') + '" onclick="toggleComparable(\'' + c.id + '\',\'' + (c.estadoAviso === 'Excluido' ? 'Incluido' : 'Excluido') + '\',\'' + t.id + '\')">' + (c.estadoAviso === 'Excluido' ? '↩' : '🚫') + '</button></td>' +
      '</tr>';
    }).join('');
    var preciosHtml = '';
    if (t.precioCierre) {
      var px = function (lbl, val, hl) { return '<div style="border:1px solid ' + (hl ? 'var(--gold)' : 'var(--border)') + ';border-radius:10px;padding:7px 10px;min-width:130px;flex:1;"><div style="font-size:.62rem;color:var(--muted);text-transform:uppercase;">' + lbl + '</div><div style="font-family:var(--mono);font-size:.95rem;color:' + (hl ? 'var(--gold)' : 'var(--text)') + ';font-weight:700;">USD ' + Number(val).toLocaleString('es-AR') + '</div></div>'; };
      preciosHtml = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">' +
        px('Cierre probable', t.precioCierre, true) + px('Publicación (+' + (t.margenPublicacion || 6) + '%)', t.precioPublicacion) +
        px('Venta rápida', t.precioRapida) + px('Neto bolsillo', t.netoBolsillo) + '</div>' +
        '<div style="font-size:.74rem;color:var(--muted);margin-bottom:10px;">' +
          'Rango: ' + Number(t.rangoDesde || 0).toLocaleString('es-AR') + '–' + Number(t.rangoHasta || 0).toLocaleString('es-AR') +
          ' · USD/m² ajustado: ' + (t.usdM2Zona || '—') + ' · Ajuste Magnin: ' + ((t.ajTotal > 0 ? '+' : '') + (t.ajTotal || 0)) + '%' +
          ' · Confianza: <b>' + (t.confianza || '—') + '</b>' +
          (t.semaforo ? ' · Captación: <b>' + escHtml(t.semaforo) + '</b>' : '') +
          (t.priceGap != null ? ' · Price Gap: <b style="color:' + (t.priceGap > 15 ? 'var(--danger)' : t.priceGap > 5 ? 'var(--warn)' : 'var(--ok)') + ';">' + (t.priceGap > 0 ? '+' : '') + t.priceGap + '%</b>' : '') +
        '</div>' +
        (t.estrategia ? '<div style="font-size:.76rem;border-left:2px solid var(--gold);padding:4px 10px;margin-bottom:10px;color:var(--muted);">' + escHtml(t.estrategia) + '</div>' : '');
    }
    var diagHtml = '<details style="border:1px solid var(--border);border-radius:10px;padding:8px 12px;margin-bottom:10px;"' + (t.precioCierre ? '' : ' open') + '>' +
      '<summary style="font-size:.78rem;color:var(--gold);cursor:pointer;">📋 Diagnóstico Magnin (scores 1-10 + ajustes) — completalo antes de calcular</summary>' +
      '<div class="grid-2" style="margin-top:10px;">' +
        '<input class="input" id="dg-ubicacion" type="number" min="1" max="10" placeholder="Score Ubicación 1-10" value="' + (t.scoreUbicacion || '') + '">' +
        '<input class="input" id="dg-edificio" type="number" min="1" max="10" placeholder="Score Edificio 1-10" value="' + (t.scoreEdificio || '') + '">' +
      '</div>' +
      '<div class="grid-2" style="margin-top:6px;">' +
        '<input class="input" id="dg-unidad" type="number" min="1" max="10" placeholder="Score Unidad 1-10" value="' + (t.scoreUnidad || '') + '">' +
        '<input class="input" id="dg-estado" type="number" min="1" max="10" placeholder="Score Estado/mantenim. 1-10" value="' + (t.scoreEstado || '') + '">' +
      '</div>' +
      '<div class="grid-2" style="margin-top:6px;">' +
        '<input class="input" id="dg-pretendido" type="number" placeholder="Precio pretendido USD" value="' + (t.precioPretendido || '') + '">' +
        '<input class="input" id="dg-ajmanual" type="number" step="0.5" placeholder="Ajuste manual % (override, opcional)" value="' + (t.ajManual || '') + '">' +
      '</div>' +
      '<label style="display:flex;gap:8px;align-items:center;font-size:.76rem;color:var(--muted);margin-top:6px;cursor:pointer;"><input type="checkbox" id="dg-marca"' + (t.edificioMarca ? ' checked' : '') + '> ★ Edificio de marca (+hasta 30%)</label>' +
      '<button class="btn btn-ghost btn-sm" style="margin-top:8px;" onclick="guardarDiagnostico(\'' + t.id + '\')">💾 Guardar diagnóstico</button>' +
    '</details>';
    var ejecutiva = window.tsVista === 'ejecutiva';
    // S50 (consultor): vista EJECUTIVA = lo mostrable (4 precios + semáforo + estrategia) ·
    // vista TÉCNICA = el laboratorio (diagnóstico, comparables, ajustes)
    var tecnicaHtml = '<div class="ts-subnav" style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px;">' + [['Diagnóstico', 'ts-diag'], ['Importar', 'ts-import'], ['Comparables', 'ts-comps']].map(function (n) { return '<a onclick="f360goto(\'' + n[1] + '\')" style="font-size:.72rem;color:var(--muted);border:1px solid var(--border);border-radius:7px;padding:2px 9px;cursor:pointer;text-decoration:none;white-space:nowrap;">' + n[0] + '</a>'; }).join('') + '</div><span id="ts-diag"></span>' +
      diagHtml +
      '<span id="ts-import"></span>' +
      // S95B.3: intake híbrido HERO (abierto, no colapsado) — importar VARIOS comparables (links/textos) en BORRADOR (opt-IN)
      '<div style="border:1px solid var(--gold);border-radius:10px;padding:10px 12px;margin-bottom:10px;background:rgba(212,175,55,.05);">' +
        '<div style="font-size:.82rem;color:var(--gold);font-weight:700;margin-bottom:4px;">📥 Importar comparables</div>' +
        '<div style="font-size:.7rem;color:var(--muted);margin-bottom:6px;">Pegá <b>muchos</b>: un <b>link por línea</b>, o el <b>texto</b> de un aviso (varias líneas) separando cada aviso con una línea en blanco. Máx 40.</div>' +
        '<textarea class="input" id="cmp-batch" placeholder="https://aviso-1&#10;https://aviso-2&#10;&#10;(o pegá el texto completo de un aviso acá)" style="width:100%;min-height:96px;"></textarea>' +
        '<div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap;">' +
          '<button class="btn btn-gold btn-sm" onclick="importarComparablesBatch(\'' + t.id + '\')">📥 Importar comparables</button>' +
          '<span style="font-size:.7rem;color:var(--muted);">Los comparables importados quedan en <b>Borrador</b> y <b>NO entran al cálculo</b> hasta que los aceptes (✓).</span>' +
        '</div>' +
        '<div id="cmp-batch-report" style="margin-top:8px;"></div>' +
        '<details style="margin-top:8px;border-top:1px dashed var(--border);padding-top:6px;">' +
          '<summary style="font-size:.72rem;color:var(--muted);cursor:pointer;">＋ Agregar de a uno (un link o un texto)</summary>' +
          '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">' +
            '<input class="input" id="cmp-link" placeholder="Pegá un LINK de Zonaprop…" style="flex:2;min-width:200px;">' +
            '<button class="btn btn-ghost btn-sm" onclick="agregarComparable(\'' + t.id + '\',\'link\')">+ por link</button>' +
          '</div>' +
          '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">' +
            '<textarea class="input" id="cmp-texto" placeholder="…o pegá el TEXTO del aviso" style="flex:2;min-width:200px;min-height:44px;"></textarea>' +
            '<button class="btn btn-ghost btn-sm" onclick="agregarComparable(\'' + t.id + '\',\'texto\')">+ por texto</button>' +
          '</div>' +
        '</details>' +
      '</div>' +
      '<span id="ts-comps"></span>' +
      (comps.length ? '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;"><thead><tr style="font-size:.66rem;color:var(--muted);text-transform:uppercase;"><th style="text-align:left;padding:4px 6px;">Comparable</th><th style="text-align:right;">Precio</th><th style="text-align:right;">Ajustado</th><th style="text-align:right;">m²</th><th style="text-align:right;">USD/m²</th><th style="text-align:right;">Días</th><th>Estado</th><th></th></tr></thead><tbody>' + filas + '</tbody></table></div>' : '<div class="small muted">Sin comparables todavía — pegá el primero ↑</div>');
    var nIncl = comps.filter(function (c) { return !(c.estadoAviso === 'Excluido' || c.outlier); }).length;
    // S95B.3: vista ejecutiva con ACCIONES claras (no una línea pasiva)
    var ejecutivaHtml = '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px;">' +
      '<button class="btn btn-gold btn-sm" onclick="tsIntake()">📥 Importar comparables</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="window.tsVista=\'tecnica\';renderTasacionDetalle()">🔬 Revisar comparables' + (comps.length ? ' (' + comps.length + ')' : '') + '</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="calcularTasacion(\'' + t.id + '\')">🧮 Recalcular</button>' +
      '<span class="small muted" style="margin-left:auto;">' + nIncl + ' en el cálculo · ' + (comps.length - nIncl) + ' excluidos</span>' +
    '</div>';
    el.innerHTML =
      '<div style="border:1px solid var(--border);border-radius:12px;padding:12px;">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">' +
          '<strong style="font-size:.9rem;">' + escHtml(t.tasacion) + '</strong>' +
          '<span class="badge badge-muted">' + escHtml(t.barrio || '') + '</span>' +
          '<span class="badge badge-muted">' + escHtml(t.estado || '') + '</span>' +
          '<span style="font-family:var(--mono);font-size:.74rem;color:var(--muted);">' + (t.m2Pond || '—') + ' m² pond.' + (t.cochera ? ' + 🚗' : '') + '</span>' +
          '<span style="margin-left:auto;"></span>' +
          '<button class="btn btn-gold btn-sm" onclick="tsIntake()" title="Pegar/importar y revisar comparables">📥 Comparables' + (comps.length ? ' (' + comps.length + ')' : '') + '</button>' +
          (t.precioCierre ? '<button class="btn btn-ghost btn-sm" onclick="window.tsVista=\'' + (ejecutiva ? 'tecnica' : 'ejecutiva') + '\';renderTasacionDetalle()">' + (ejecutiva ? '🔬 Vista técnica' : '👔 Vista ejecutiva') + '</button>' : '') +
          (ejecutiva ? '' : '<button class="btn btn-gold btn-sm" onclick="calcularTasacion(\'' + t.id + '\')">🧮 Calcular</button>') +
          (t.precioCierre ? '<button class="btn btn-gold btn-sm" onclick="pdfTasacion(\'' + t.id + '\')">📄 Carpeta Wow</button>' : '') +
        '</div>' +
        preciosHtml + (ejecutiva ? ejecutivaHtml : tecnicaHtml) +
      '</div>';
  }
  window.abrirTasacion = abrirTasacion;
  window.renderTasacionDetalle = renderTasacionDetalle;
  // S95B.3: saltar directo al intake de comparables (entra a técnica + scrollea al importador) desde cualquier vista
  window.tsIntake = function () { window.tsVista = 'tecnica'; renderTasacionDetalle(); setTimeout(function () { f360goto('ts-import'); }, 30); };

  async function agregarComparable(tasacionId, via) {
    var body = { tasacionId: tasacionId };
    if (via === 'link') {
      var l = (document.getElementById('cmp-link') || {}).value || '';
      if (!/^https?:\/\//.test(l.trim())) return toast('Pegá un link válido', 'err');
      body.link = l.trim();
    } else {
      var tx = (document.getElementById('cmp-texto') || {}).value || '';
      if (tx.trim().length < 60) return toast('Pegá el texto completo del aviso', 'err');
      body.texto = tx.trim();
    }
    toast('Analizando comparable con IA… (~20s)', 'ok');
    var d = await apiFetch('/crm/tasacion/comparable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (d && d.ok) {
      if (d.deduped) { toast('♻️ ' + (d.mensaje || 'Ya estaba cargado en esta tasación — no se duplicó'), 'ok'); abrirTasacion(tasacionId); return; }
      var c = d.comparable;
      toast('✅ ' + c.titulo + ' — USD/m² ' + (c.usdM2 || '?') + (d.reusado ? ' (reusé datos de la biblioteca, sin re-leer)' : '') + (c.esSimilar ? '' : ' (lo marqué NO similar: ' + (c.razon || '') + ')'), 'ok');
      abrirTasacion(tasacionId);
    } else toast('Error: ' + ((d && d.error) || 'sin conexión'), 'err');
  }
  window.agregarComparable = agregarComparable;
  // ── S95B.3: intake híbrido de comparables (batch links/textos → Borrador, opt-IN al cálculo) ──
  // Parser reusable: un link por línea = 1 item; líneas de texto consecutivas = 1 item (separadas por línea en blanco).
  function parseComparablesInput(raw) {
    var lines = String(raw || '').split('\n');
    var items = [], buf = [];
    function flush() { var t = buf.join('\n').trim(); if (t) items.push({ texto: t }); buf = []; }
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (/^https?:\/\/\S+$/i.test(t)) { flush(); items.push({ link: t }); }
      else if (t === '') { flush(); }
      else buf.push(lines[i]);
    }
    flush();
    return items;
  }
  function renderBatchReport(d) {
    function chip(lbl, n, col) { return '<span style="display:inline-block;border:1px solid ' + col + ';color:' + col + ';border-radius:8px;padding:1px 7px;margin:2px 4px 0 0;font-size:.7rem;">' + lbl + ': <b>' + n + '</b></span>'; }
    var h = '<div style="border:1px solid var(--border);border-radius:8px;padding:8px;">' +
      '<div style="margin-bottom:4px;">' +
        chip('Recibidos', d.totalRecibidos, 'var(--muted)') + chip('Importados', d.importados, 'var(--ok)') +
        chip('Duplicados', d.duplicados, '#5ec8d8') + chip('Incompletos', d.incompletos, 'var(--warn)') +
        chip('Fallidos', d.fallidos, 'var(--danger)') +
      '</div>';
    var rows = (d.items || []).map(function (it) {
      var ic = it.status === 'imported' ? '✅' : it.status === 'deduped' ? '♻️' : it.status === 'incomplete' ? '🟡' : '❌';
      var dud = (it.dudosos && it.dudosos.length) ? ' · <span style="color:var(--warn);">⚠ campos dudosos: ' + escHtml(it.dudosos.join(', ')) + '</span>' : '';
      var err = it.error ? ' · <span style="color:var(--danger);">' + escHtml(it.error) + '</span>' : '';
      return '<div style="font-size:.72rem;border-top:1px solid rgba(255,255,255,0.06);padding:3px 0;">' + ic + ' ' + escHtml(it.titulo || ('item ' + ((it.idx != null ? it.idx : 0) + 1))) + (it.usdM2 ? ' · <span style="color:var(--gold);font-family:var(--mono);">USD/m² ' + it.usdM2 + '</span>' : '') + dud + err + '</div>';
    }).join('');
    return h + rows + '<div style="font-size:.7rem;color:var(--muted);margin-top:6px;border-top:1px dashed var(--border);padding-top:5px;">Los comparables importados quedan en <b>Borrador</b> y <b>no entran al cálculo</b> hasta que los aceptes (✓ en cada fila).</div></div>';
  }
  async function importarComparablesBatch(tasacionId) {
    var raw = (document.getElementById('cmp-batch') || {}).value || '';
    var items = parseComparablesInput(raw);
    var rep = document.getElementById('cmp-batch-report');
    if (!items.length) { if (rep) rep.innerHTML = '<span style="font-size:.72rem;color:var(--danger);">Pegá al menos un link o un texto.</span>'; return; }
    if (items.length > 40) { if (rep) rep.innerHTML = '<span style="font-size:.72rem;color:var(--danger);">Máximo 40 por tanda (pegaste ' + items.length + ').</span>'; return; }
    if (rep) rep.innerHTML = '<span style="font-size:.72rem;" class="muted">Importando ' + items.length + ' comparable(s) con IA… (~' + (items.length * 15) + 's, no cierres)</span>';
    var d = await apiFetch('/crm/tasacion/comparables/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tasacionId: tasacionId, items: items }) });
    if (!d || d.ok === false) { if (rep) rep.innerHTML = '<span style="font-size:.72rem;color:var(--danger);">Error: ' + escHtml((d && d.error) || 'sin conexión') + '</span>'; return; }
    if (rep) rep.innerHTML = renderBatchReport(d);
    toast('📥 Importados ' + d.importados + ' · dup ' + d.duplicados + ' · incompletos ' + d.incompletos + ' · fallidos ' + d.fallidos + ' (en Borrador)', 'ok');
    // refresca la lista (los Borrador aparecen en la tabla con su color) — NO auto-calcula
    abrirTasacion(tasacionId);
  }
  window.importarComparablesBatch = importarComparablesBatch;
  // S70B: workflow humano del comparable (Aceptado/Descartado/Importado) — separado del Estado aviso técnico
  async function comparableAnalisis(cid, estado, tasId) {
    var motivo = '';
    if (estado === 'Descartado') { motivo = prompt('Motivo del descarte (queda registrado):', 'No comparable / fuera de zona'); if (motivo === null) return; }
    var d = await apiFetch('/crm/comparable/estado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: cid, estadoAnalisis: estado, motivo: motivo }) });
    if (d && d.ok) { toast(estado === 'Aceptado' ? '✓ Aceptado para la base' : estado === 'Descartado' ? '🗑 Descartado (fuera del cálculo)' : '↺ ' + estado, 'ok'); abrirTasacion(tasId); }
    else toast('Error: ' + ((d && d.error) || ''), 'err');
  }
  window.comparableAnalisis = comparableAnalisis;
  // S70C: ver qué decía el aviso al momento de tasar (snapshots fechados)
  async function verSnapshotComparable(key) {
    var d = await apiFetch('/crm/comparable/snapshots?key=' + encodeURIComponent(key));
    if (!d || !d.ok) return toast('No pude leer snapshots', 'err');
    if (!d.count) return toast('Sin snapshots para este comparable todavía', 'err');
    var txt = d.snapshots.map(function (s) {
      return '📅 ' + String(s.fechaCaptura || '').slice(0, 16).replace('T', ' ') + ' · ' + (s.portal || '?') + ' · ' + (s.metodo || '') +
        (s.titulo ? '\nTítulo: ' + s.titulo : '') +
        (s.precioUsd != null ? '\nPrecio: USD ' + Number(s.precioUsd).toLocaleString('es-AR') + (s.m2 ? ' · ' + s.m2 + ' m²' : '') + (s.diasPublicado != null ? ' · ' + s.diasPublicado + 'd' : '') : '') +
        (s.textoExtraido ? '\n\n' + s.textoExtraido.slice(0, 700) : '');
    }).join('\n\n──────────\n\n');
    alert('🗂 Qué decía el aviso (snapshots fechados — ' + d.count + ')\n\n' + txt);
  }
  window.verSnapshotComparable = verSnapshotComparable;

  async function calcularTasacion(id) {
    toast('Calculando…', 'ok');
    var d = await apiFetch('/crm/tasacion/calcular', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) });
    if (d && d.ok) {
      toast('🧮 TASACIÓN: USD ' + d.tasacionUsd.toLocaleString('es-AR') + ' (' + d.usdM2Zona + ' USD/m² × ' + d.m2Ponderados + 'm²)' + (d.outliers.length ? ' · ' + d.outliers.length + ' outlier(s) excluidos' : ''), 'ok');
      abrirTasacion(id); loadTasaciones();
    } else toast('Error: ' + ((d && d.error) || 'sin conexión'), 'err');
  }
  window.calcularTasacion = calcularTasacion;

  async function guardarDiagnostico(id) {
    var v = function (eid) { var e = document.getElementById(eid); return e ? e.value.trim() : ''; };
    var marca = document.getElementById('dg-marca');
    var d = await apiFetch('/crm/tasacion/actualizar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, scoreUbicacion: Number(v('dg-ubicacion')) || undefined, scoreEdificio: Number(v('dg-edificio')) || undefined, scoreUnidad: Number(v('dg-unidad')) || undefined, scoreEstado: Number(v('dg-estado')) || undefined, precioPretendido: Number(v('dg-pretendido')) || undefined, ajManual: v('dg-ajmanual') !== '' ? Number(v('dg-ajmanual')) : undefined, edificioMarca: !!(marca && marca.checked) })
    });
    if (d && d.ok) { toast('Diagnóstico guardado — recalculá para aplicar', 'ok'); }
    else toast('Error: ' + ((d && d.error) || ''), 'err');
  }
  window.guardarDiagnostico = guardarDiagnostico;

  async function toggleComparable(cid, estado, tasacionId) {
    var d = await apiFetch('/crm/comparable/estado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: cid, estado: estado, motivo: estado === 'Excluido' ? 'Excluido manualmente por el bróker' : '' }) });
    if (d && d.ok) { toast(estado === 'Excluido' ? '🚫 Excluido del cálculo' : '↩ Re-incluido', 'ok'); abrirTasacion(tasacionId); }
    else toast('Error', 'err');
  }
  window.toggleComparable = toggleComparable;

  async function pdfTasacion(id) {
    toast('Generando PDF brandeado… (~15s)', 'ok');
    var d = await apiFetch('/crm/tasacion/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) });
    if (d && d.ok) {
      toast('📄 PDF listo' + (d.whatsappEnviado ? ' — te lo mandé por WhatsApp' : '') + (d.drive && d.drive.link ? ' · guardado en Drive/TASACIONES' : ''), 'ok');
      if (d.drive && d.drive.link) window.open(d.drive.link, '_blank');
      abrirTasacion(id); loadTasaciones();
    } else toast('Error: ' + ((d && d.error) || 'sin conexión'), 'err');
  }
  window.pdfTasacion = pdfTasacion;

  /* ─── C4: Matching demanda↔propiedad ─── */
  async function loadCrmMatching() {
    var el = document.getElementById('crm-matching');
    if (!el) return;
    var d = await apiFetch('/crm/matching');
    if (!d || d.__error || !d.ok) { el.innerHTML = '<span class="small muted">No pude calcular matches.</span>'; return; }
    var cnt = document.getElementById('crm-match-count');
    if (cnt) cnt.textContent = d.count + ' matches';
    // S43 (consultor #14): matches accionables — descartar persiste, contactado escribe al CRM
    var desc = {}; try { desc = JSON.parse(localStorage.getItem('crmMatchDescartados') || '{}'); } catch (e2) {}
    var matches = (d.matches || []).filter(function (m) { return !desc[(m.contactoId || m.contacto) + '|' + m.propiedad]; });
    var nDesc = (d.matches || []).length - matches.length;
    el.innerHTML = (matches.length ? matches.slice(0, 10).map(function (m, mi) {
      var key = (m.contactoId || m.contacto) + '|' + m.propiedad;
      return '<div style="border:1px solid var(--border);border-radius:10px;padding:9px 12px;margin-bottom:7px;">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<strong style="font-size:.84rem;">' + escHtml(m.contacto) + '</strong>' +
          '<span style="color:var(--muted);">↔</span>' +
          '<span style="font-size:.82rem;">' + escHtml(m.propiedad) + '</span>' +
          '<span style="margin-left:auto;font-family:var(--mono);font-size:.7rem;color:var(--gold);">' + m.score + '%</span>' +
        '</div>' +
        '<div style="font-size:.74rem;color:var(--muted);margin:3px 0 7px;">' + m.razones.map(escHtml).join(' · ') + ' · etapa: ' + escHtml(m.etapa || '—') + '</div>' +
        '<textarea id="match-msg-' + mi + '" style="display:none;width:100%;min-height:64px;font-size:.76rem;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:6px 8px;margin-bottom:6px;">' + escHtml(m.borrador) + '</textarea>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
          '<button class="btn btn-gold btn-sm" onclick="copiarMatchMsg(' + mi + ')">📋 Copiar mensaje</button>' +
          '<button class="btn btn-ghost btn-sm" title="Editar el borrador antes de copiarlo" onclick="var t=document.getElementById(\'match-msg-' + mi + '\');t.style.display=t.style.display===\'none\'?\'\':\'none\';">✏️ Editar</button>' +
          (m.telefono ? '<a class="btn btn-ghost btn-sm" style="text-decoration:none;" href="' + waHref(m.telefono) + '" target="_blank" rel="noopener">💬 Abrir chat</a>' : '') +
          (m.contactoId ? '<button class="btn btn-ghost btn-sm" title="Lo contactaste: actualiza última interacción + nota en el CRM" onclick="marcarMatchContactado(\'' + m.contactoId + '\',\'' + escHtml(m.propiedad).replace(/'/g, '') + '\')">✓ Contactado</button>' : '') +
          '<button class="btn btn-ghost btn-sm" title="No va — ocultar este match" onclick="descartarMatch(\'' + key.replace(/'/g, '') + '\')">🚫</button>' +
        '</div>' +
      '</div>';
    }).join('') : '<span class="small muted">Sin matches todavía — aparecen cuando una propiedad activa encaja con lo que busca un lead (operación + zona + presupuesto).</span>') +
    (nDesc ? '<button class="btn btn-ghost btn-sm" style="margin-top:4px;" onclick="localStorage.removeItem(\'crmMatchDescartados\');loadCrmMatching()">↩ Mostrar ' + nDesc + ' descartado(s)</button>' : '');
  }
  window.loadCrmMatching = loadCrmMatching;

  function copiarMatchMsg(mi) {
    var t = document.getElementById('match-msg-' + mi);
    if (!t) return;
    navigator.clipboard.writeText(t.value).then(function () { toast('📋 Mensaje copiado — pegalo en WhatsApp', 'ok'); });
  }
  window.copiarMatchMsg = copiarMatchMsg;

  function descartarMatch(key) {
    var desc = {}; try { desc = JSON.parse(localStorage.getItem('crmMatchDescartados') || '{}'); } catch (e2) {}
    desc[key] = true;
    localStorage.setItem('crmMatchDescartados', JSON.stringify(desc));
    loadCrmMatching();
  }
  window.descartarMatch = descartarMatch;

  async function marcarMatchContactado(contactoId, propiedad) {
    var d = await apiFetch('/crm/contacto/actualizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: contactoId, tocado: true, nota: 'Contactado por match con ' + propiedad }) });
    if (d && d.ok) toast('✓ Registrado en el CRM (última interacción + nota)', 'ok');
    else toast('Error: ' + ((d && d.error) || 'sin conexión'), 'err');
  }
  window.marcarMatchContactado = marcarMatchContactado;

  /* ─── C3.2: Vista 360 — los 3 procesos en un pantallazo ─── */
  function renderVista360() {
    var el = document.getElementById('crm-vista360');
    if (!el) return;
    var pipe = window.crmPipelineCache, ops = window.crmOpsCache;
    if (!pipe && !ops) return;
    // S48/S51: Vista 360 de MANDO — barras con color + cuello de botella + acción crítica por embudo
    var col = function (titulo, emoji, tab, etapas, total, accionesMapa) {
      var maxC = Math.max.apply(null, (etapas || []).map(function (e) { return e.count; }).concat([1]));
      // cuello de botella: etapa activa NO terminal con más acumulación
      var TERM = /descart|perdid|ca[íi]da|rechaz|cerrad|publicada/i;
      var cuello = (etapas || []).filter(function (e) { return e.count > 0 && !TERM.test(e.etapa); }).sort(function (a, b) { return b.count - a.count; })[0];
      var footer = '';
      if (cuello) {
        var accion = (accionesMapa && accionesMapa[cuello.etapa]) || 'mover al siguiente paso';
        footer = '<div style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.07);padding-top:7px;font-size:.7rem;">' +
          '<div style="color:var(--warn);">🔧 Cuello: <b>' + cuello.count + ' en ' + escHtml(cuello.etapa) + '</b></div>' +
          '<div style="color:var(--muted);margin-top:2px;">▶ ' + escHtml(accion) + '</div></div>';
      } else if (total === 0) {
        footer = '<div style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.07);padding-top:7px;font-size:.7rem;color:var(--muted);">Vacío — cargá el primero acá.</div>';
      }
      return '<div onclick="crmTab(\'' + tab + '\')" class="kpi" style="cursor:pointer;border:1px solid var(--border);border-radius:10px;padding:10px 12px;display:block;text-align:left;" title="Ir a ' + titulo + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><strong style="font-size:.8rem;">' + emoji + ' ' + titulo + '</strong><span class="badge badge-muted">' + total + '</span></div>' +
        (etapas || []).map(function (e, ei) {
          var on = e.count > 0;
          var c = funnelColor(e.etapa, ei);
          var w = on ? Math.max(8, Math.round(e.count / maxC * 100)) : 0;
          return '<div style="position:relative;display:flex;justify-content:space-between;align-items:center;font-size:.72rem;padding:3px 7px;margin:2px 0;border-radius:6px;overflow:hidden;color:' + (on ? 'var(--text)' : 'var(--muted)') + ';">' +
            '<i style="position:absolute;left:0;top:0;bottom:0;width:' + w + '%;background:linear-gradient(90deg,' + c + '33,' + c + '14);border-left:2px solid ' + (on ? c : 'transparent') + ';border-radius:6px;"></i>' +
            '<span style="position:relative;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(e.etapa) + '</span>' +
            '<span style="position:relative;font-family:var(--mono);font-weight:700;color:' + (on ? c : 'var(--muted)') + ';">' + e.count + '</span></div>';
        }).join('') + footer + '</div>';
    };
    var html = '';
    if (pipe) {
      var capT = (pipe.captacion || []).reduce(function (s, e) { return s + e.count; }, 0);
      var demT = (pipe.demanda || []).reduce(function (s, e) { return s + e.count; }, 0);
      html += col('Captación', '🏠', 'captacion', pipe.captacion, capT, ACCIONES_CAP);
      html += col('Demanda', '🛒', 'demanda', pipe.demanda, demT, ACCIONES_DEM);
    }
    if (ops) {
      var activas = (ops.etapas || []).filter(function (e) { return ['Cerrada', 'Caída'].indexOf(e.etapa) < 0; });
      html += col('Operaciones', '💼', 'operaciones', activas, ops.activas || 0, null);
      // S47: honorarios SIEMPRE visibles en el resumen (pedido Franco)
      var hEsp = 0, hCob = 0;
      (ops.items || []).forEach(function (o) { if (o.etapa !== 'Caída') { hEsp += o.honorariosEsperados || 0; hCob += o.honorariosCobrados || 0; } });
      html += '<div style="grid-column:1/-1;display:flex;gap:14px;flex-wrap:wrap;border:1px solid rgba(212,175,55,0.35);border-radius:10px;padding:8px 12px;background:rgba(212,175,55,0.04);align-items:center;">' +
        '<span style="font-size:.72rem;color:var(--gold);text-transform:uppercase;letter-spacing:.07em;font-weight:700;">💰 Honorarios</span>' +
        '<span style="font-size:.78rem;">Esperados: <b style="font-family:var(--mono);color:var(--gold);">$' + hEsp.toLocaleString('es-AR') + '</b></span>' +
        '<span style="font-size:.78rem;">Cobrados: <b style="font-family:var(--mono);color:var(--ok);">$' + hCob.toLocaleString('es-AR') + '</b></span>' +
        '<span style="font-size:.78rem;">Pendientes: <b style="font-family:var(--mono);color:' + ((hEsp - hCob) > 0 ? 'var(--warn)' : 'var(--muted)') + ';">$' + Math.max(0, hEsp - hCob).toLocaleString('es-AR') + '</b></span></div>';
    }
    if (html) el.innerHTML = html;
  }
  window.renderVista360 = renderVista360;

  /* ─── C3.2: Plan semanal 40-5-5-1 MANUAL (vos lo aplicás, nada automático) ─── */
  async function loadPlanSemanal() {
    var d = await apiFetch('/crm/plan-semanal');
    var box = document.getElementById('cm-plansemanal');
    if (!box || !d || !d.ok) return;
    var t = d.targets, p = d.plan;
    // S49: tarjetas con barra de progreso (pedido Franco "el +1/− no se ve muy bien")
    var item = function (campo, label, val, target) {
      var ok = val >= target;
      var pct = Math.min(100, Math.round(val / target * 100));
      var c = ok ? 'var(--ok)' : pct >= 50 ? 'var(--gold)' : '#8a8f98';
      return '<div class="kpi" style="min-width:160px;padding:8px 11px;text-align:left;display:block;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">' +
          '<span style="font-size:.7rem;color:var(--muted);">' + label + '</span>' +
          '<span style="display:inline-flex;gap:3px;flex-shrink:0;">' +
            '<button class="btn btn-gold btn-sm" style="padding:0 8px;" title="Sumar 1 (lo hiciste vos)" onclick="sumarPlan(\'' + campo + '\',1)">+1</button>' +
            '<button class="btn btn-ghost btn-sm" style="padding:0 7px;" title="Restar 1 (corrección)" onclick="sumarPlan(\'' + campo + '\',-1)">−</button></span></div>' +
        '<div style="font-family:var(--mono);font-size:1.05rem;font-weight:700;color:' + c + ';margin:2px 0;">' + val + '<span style="font-size:.7rem;color:var(--muted);"> / ' + target + (ok ? ' ✓' : '') + '</span></div>' +
        '<div style="height:4px;border-radius:3px;background:rgba(255,255,255,0.08);overflow:hidden;"><i style="display:block;height:100%;width:' + pct + '%;background:' + c + ';border-radius:3px;transition:width .3s;"></i></div>' +
      '</div>';
    };
    box.innerHTML = '<div style="font-size:.68rem;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em;">Plan semanal 40-5-5-1 (' + d.semana + ') — lo marcás VOS a medida que lo hacés</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        item('contactos', '📞 Contactos', p.contactos, t.contactos) +
        item('itemsValor', '🎁 Ítems de valor', p.itemsValor, t.itemsValor) +
        item('cafes', '☕ Cafés/reuniones', p.cafes, t.cafes) +
        item('masivo', '📣 Envío masivo', p.masivo, t.masivo) +
      '</div>';
  }
  window.loadPlanSemanal = loadPlanSemanal;

  async function sumarPlan(campo, delta) {
    var d = await apiFetch('/crm/plan-semanal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campo: campo, delta: delta }) });
    if (d && d.ok) loadPlanSemanal();
  }
  window.sumarPlan = sumarPlan;

  /* ─── C3.2: subir documentación de propiedad (panel → Drive gringoestate + tick CRM) ─── */
  function abrirDocUpload(propId) {
    var p = crmFichaCache[propId] || {};
    var t = document.getElementById('du-titulo');
    if (t) t.textContent = '📎 Documentación — ' + (p.propiedad || 'propiedad');
    var hid = document.getElementById('du-prop-id'); if (hid) hid.value = propId;
    var f = document.getElementById('du-file'); if (f) f.value = '';
    showModal('modal-docupload');
  }
  window.abrirDocUpload = abrirDocUpload;

  async function subirDocPropiedad() {
    var id = (document.getElementById('du-prop-id') || {}).value;
    var tipo = (document.getElementById('du-tipo') || {}).value;
    var input = document.getElementById('du-file');
    var file = input && input.files && input.files[0];
    if (!id || !file) return toast('Elegí un archivo', 'err');
    if (file.size > 20 * 1024 * 1024) return toast('Máx 20MB', 'err');
    var btn = document.getElementById('du-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Subiendo…'; }
    var reader = new FileReader();
    reader.onload = async function () {
      var d = await apiFetch('/crm/propiedad/doc', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, tipoDoc: tipo, filename: file.name, base64: String(reader.result) })
      });
      if (btn) { btn.disabled = false; btn.textContent = '☁️ Subir'; }
      if (d && d.ok) {
        hideModal('modal-docupload');
        toast('☁️ Guardado en Drive (' + (d.drive && d.drive.carpeta || '') + ')' + (d.docsPct != null ? ' · docs ' + d.docsPct + '%' : ''), 'ok');
        loadCrm();
      } else toast('Error: ' + ((d && d.error) || 'no pude subir'), 'err');
    };
    reader.readAsDataURL(file);
  }
  window.subirDocPropiedad = subirDocPropiedad;

  /* ─── C3.1: modales con ✕, Esc y click-afuera ─── */
  function initModalUX() {
    document.querySelectorAll('.modal-overlay').forEach(function (ov) {
      var m = ov.querySelector('.modal');
      if (m && !m.querySelector('.modal-x')) {
        m.style.position = 'relative';
        var x = document.createElement('button');
        x.className = 'modal-x';
        x.innerHTML = '✕';
        x.setAttribute('aria-label', 'Cerrar');
        x.style.cssText = 'position:absolute;top:10px;right:12px;background:none;border:none;color:var(--muted);font-size:1.05rem;cursor:pointer;padding:4px;line-height:1;z-index:2;';
        x.onmouseenter = function () { x.style.color = 'var(--text)'; };
        x.onmouseleave = function () { x.style.color = 'var(--muted)'; };
        x.onclick = function () { hideModal(ov.id); };
        m.appendChild(x);
      }
      if (!ov.dataset.uxWired) {
        ov.dataset.uxWired = '1';
        ov.addEventListener('click', function (e) { if (e.target === ov) hideModal(ov.id); });
      }
    });
    if (!window.__modalEscWired) {
      window.__modalEscWired = true;
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(function (ov) { hideModal(ov.id); });
      });
    }
  }
  initModalUX();

  async function marcarContactado(id) {
    var d = await apiFetch('/crm/contacto/actualizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, tocado: true }) });
    if (d && d.ok) { toast('Marcado como contactado hoy', 'ok'); loadCrmResumen(); }
    else toast('Error al marcar', 'err');
  }
  window.marcarContactado = marcarContactado;

  /* Higiene semanal */
  async function loadCrmHigiene() {
    var el = document.getElementById('crm-higiene');
    if (!el) return;
    var d = await apiFetch('/crm/higiene');
    if (!d || d.__error || !d.ok) { el.innerHTML = '<span class="small muted">No pude leer el refinamiento.</span>'; return; }
    window.crmHigieneData = d;
    renderHigiene();
  }
  window.loadCrmHigiene = loadCrmHigiene;

  // S49: render PURO desde estado local — filtros/teclado/selección/clasificar = instantáneos, cero refetch
  function renderHigiene() {
    var el = document.getElementById('crm-higiene');
    var d = window.crmHigieneData;
    if (!el || !d) return;
    var cnt = document.getElementById('crm-hig-count');
    if (cnt) cnt.textContent = d.sinClasificar.count + ' sin clasificar';
    var html = '';
    if (d.sinClasificar.top.length) {
      window.crmHigieneLista = d.sinClasificar.top;
      window.crmHigieneVisible = window.crmHigieneVisible || 20;
      window.crmHigSel = window.crmHigSel || {};
      window.crmHigFiltro = window.crmHigFiltro || 'todos';
      // P5 consultor (S43): filtros + lote + modo teclado — 371 uno-por-uno era inviable
      var lista = d.sinClasificar.top.filter(function (l) {
        if (window.crmHigBusca && (l.nombre || '').toLowerCase().indexOf(window.crmHigBusca) < 0) return false;
        if (window.crmHigFiltro === 'telefono') return !!l.telefono;
        if (window.crmHigFiltro === 'activos') return (l.mensajes || 0) >= 20;
        if (window.crmHigFiltro === 'basura') return !l.telefono || /^\d+$/.test((l.nombre || '').trim()) || (l.mensajes || 0) <= 1;
        return true;
      });
      window.crmHigListaFiltrada = lista;
      var nSel = Object.keys(window.crmHigSel).length;
      var chip = function (key, label) {
        var on = window.crmHigFiltro === key;
        return '<button class="btn btn-sm ' + (on ? 'btn-gold' : 'btn-ghost') + '" onclick="window.crmHigFiltro=\'' + key + '\';window.crmHigFocus=0;renderHigiene()">' + label + '</button>';
      };
      html += '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">' +
        chip('todos', 'Todos') + chip('activos', '🔥 ≥20 msgs') + chip('telefono', '📞 Con tel.') + chip('basura', '🧹 Probable basura') +
        '<input class="input" placeholder="🔎 Buscar nombre…" value="' + escHtml(window.crmHigBusca || '') + '" style="width:160px;font-size:.74rem;padding:3px 8px;" oninput="window.crmHigBusca=this.value.toLowerCase();window.crmHigFocus=0;clearTimeout(window.crmHigBuscaT);window.crmHigBuscaT=setTimeout(function(){renderHigiene();var i=document.querySelector(\'#crm-higiene input.input\');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}},220)">' +
        '<button class="btn btn-sm ' + (window.crmHigKb ? 'btn-gold' : 'btn-ghost') + '" style="margin-left:auto;" title="Clasificá con el teclado: ↑↓ moverse · P promover · E equipo · A ambbi · X personal · V proveedor · N no contactar · D descartar · S saltar" onclick="window.crmHigKb=!window.crmHigKb;window.crmHigFocus=0;renderHigiene()">⌨️ Modo rápido</button>' +
      '</div>';
      if (window.crmHigKb) {
        html += '<div style="font-size:.68rem;color:var(--gold);margin-bottom:6px;font-family:var(--mono);">↑↓ moverse · P promover · E equipo · A ambbi · X personal · V proveedor · N no contactar · D descartar · S saltar</div>';
      }
      if (nSel) {
        html += '<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;border:1px solid var(--gold);border-radius:10px;padding:6px 10px;margin-bottom:8px;background:rgba(212,175,55,0.06);">' +
          '<strong style="font-size:.76rem;">' + nSel + ' seleccionados →</strong>' +
          ['Equipo|👔', 'AMBBI|🏨', 'Personal|👤', 'Proveedor|🏪', 'No contactar|⛔', 'Descartado|🗑'].map(function (par) {
            var p2 = par.split('|');
            return '<button class="btn btn-ghost btn-sm" onclick="clasificarLote(\'' + p2[0] + '\')">' + p2[1] + ' ' + p2[0] + '</button>';
          }).join('') +
          '<button class="btn btn-ghost btn-sm" onclick="window.crmHigSel={};renderHigiene()">✕ limpiar</button>' +
        '</div>';
      }
      html += '<div style="font-size:.72rem;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em;">Sin clasificar (' + lista.length + (window.crmHigFiltro !== 'todos' ? ' con este filtro' : '') + ') — tildá varios para clasificar en lote</div>';
      html += '<div style="max-width:980px;max-height:56vh;overflow-y:auto;border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:0 6px;">';
      html += lista.slice(0, window.crmHigieneVisible).map(function (l, idx) {
        var foco = window.crmHigKb && (window.crmHigFocus || 0) === idx;
        var sel = !!window.crmHigSel[l.id];
        return '<div data-hig-idx="' + idx + '" style="display:grid;grid-template-columns:22px minmax(120px,250px) 52px auto;align-items:center;gap:7px;padding:2px 4px;border-bottom:1px solid rgba(255,255,255,0.05);' + (foco ? 'background:rgba(212,175,55,0.12);border-radius:8px;' : '') + '">' +
          '<input type="checkbox"' + (sel ? ' checked' : '') + ' onchange="toggleHigSel(\'' + l.id + '\',this.checked)" aria-label="Seleccionar">' +
          '<span style="font-size:.82rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(l.nombre) + (l.telefono ? '' : ' <span style="color:var(--muted);font-weight:400;font-size:.66rem;">(sin tel.)</span>') + '</span>' +
          '<span style="font-size:.68rem;color:var(--muted);font-family:var(--mono);text-align:right;">' + (l.mensajes || 0) + ' msgs</span>' +
          '<span class="hig-acciones" style="display:inline-flex;gap:3px;">' +
            '<button class="btn btn-gold btn-sm" title="Promover al CRM: lo crea como contacto TRABAJABLE en tu base de brokerage" onclick="clasificarLinea(\'' + l.id + '\',\'Promover\')">⭐ Promover</button>' +
            '<button class="btn btn-ghost btn-sm" title="Tu gente: staff, socios, colaboradores" onclick="clasificarLinea(\'' + l.id + '\',\'Equipo\')">👔 Equipo</button>' +
            '<button class="btn btn-ghost btn-sm" title="Encargado de edificio — entra al CRM como contacto clave (conocen todo su edificio)" onclick="clasificarLinea(\'' + l.id + '\',\'Promover\',\'Encargado\')">🛎 Encargado</button>' +
            '<button class="btn btn-ghost btn-sm" title="Huésped AMBBI (temporario) — no pertenece a este CRM" onclick="clasificarLinea(\'' + l.id + '\',\'AMBBI\')">🏨 Huésped</button>' +
            '<button class="btn btn-ghost btn-sm" title="Personal (familia/amigos)" onclick="clasificarLinea(\'' + l.id + '\',\'Personal\')">👤 Personal</button>' +
            '<button class="btn btn-ghost btn-sm" title="Proveedor (negocios/servicios)" onclick="clasificarLinea(\'' + l.id + '\',\'Proveedor\')">🏪 Proveedor</button>' +
            '<button class="btn btn-ghost btn-sm" title="No contactar nunca (bloqueado)" onclick="clasificarLinea(\'' + l.id + '\',\'No contactar\')">⛔ No contactar</button>' +
            '<button class="btn btn-ghost btn-sm" title="Descartar: basura/spam, no sirve" onclick="clasificarLinea(\'' + l.id + '\',\'Descartado\')">🗑 Descartar</button>' +
          '</span>' +
        '</div>';
      }).join('');
      html += '</div>';
      if (lista.length > window.crmHigieneVisible) {
        html += '<div style="display:flex;gap:6px;margin-top:8px;">' +
          '<button class="btn btn-ghost btn-sm" onclick="window.crmHigieneVisible+=20;renderHigiene()">▾ Mostrar 20 más (' + (lista.length - window.crmHigieneVisible) + ' restantes)</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="window.crmHigieneVisible=99999;renderHigiene()">⤓ Mostrar TODOS (' + lista.length + ')</button></div>';
      }
    } else html += '<div class="small muted">✅ Todo clasificado.</div>';
    if ((d.duplicados || []).length) {
      html += '<div style="font-size:.72rem;color:var(--warn);margin:10px 0 6px;text-transform:uppercase;letter-spacing:.06em;">Posibles duplicados en el CRM</div>';
      html += d.duplicados.map(function (g) {
        return '<div style="font-size:.78rem;padding:4px 0;">🔁 por ' + g.criterio + ': ' + g.items.map(function (i) { return escHtml(i.nombre); }).join(' ↔ ') + '</div>';
      }).join('');
    }
    if ((d.ultimosEnCrm || []).length) {
      html += '<div style="font-size:.72rem;color:var(--muted);margin:10px 0 6px;text-transform:uppercase;letter-spacing:.06em;">Últimos en el CRM</div>';
      html += d.ultimosEnCrm.map(function (u) {
        return '<div style="display:flex;gap:8px;font-size:.78rem;padding:3px 0;"><span style="flex:1;">' + escHtml(u.nombre) + '</span><span class="badge badge-muted">' + escHtml(u.origenDato || u.tipo || '—') + '</span></div>';
      }).join('');
    }
    el.innerHTML = html;
  }
  window.renderHigiene = renderHigiene;

  async function clasificarLinea(id, clasificacion, tipo) {
    delete (window.crmHigSel || {})[id];
    // S49: UI OPTIMISTA — la fila desaparece YA (el guardado sigue en background).
    // Antes: POST a Notion + refetch completo = 2-3s de click muerto.
    var d0 = window.crmHigieneData, item = null, pos = -1;
    if (d0 && d0.sinClasificar) {
      pos = d0.sinClasificar.top.findIndex(function (l) { return l.id === id; });
      if (pos >= 0) { item = d0.sinClasificar.top.splice(pos, 1)[0]; d0.sinClasificar.count--; }
      renderHigiene();
    }
    toast(clasificacion === 'Promover' ? (tipo === 'Encargado' ? '🛎 Encargado → CRM' : '⭐ Promovido al CRM') : 'Clasificado: ' + clasificacion, 'ok');
    var body = { id: id, clasificacion: clasificacion };
    if (tipo) body.tipo = tipo;
    var d = await apiFetch('/crm/clasificar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!d || !d.ok) {
      // rollback: vuelve la fila a su lugar + aviso
      if (item && d0) { d0.sinClasificar.top.splice(Math.max(0, pos), 0, item); d0.sinClasificar.count++; renderHigiene(); }
      toast('⚠ No se guardó "' + (item ? item.nombre : id) + '" — reintentá', 'err');
    }
  }
  window.clasificarLinea = clasificarLinea;

  /* P5 consultor (S43): selección + lote + teclado */
  function toggleHigSel(id, on) {
    window.crmHigSel = window.crmHigSel || {};
    if (on) window.crmHigSel[id] = true; else delete window.crmHigSel[id];
    renderHigiene();
  }
  window.toggleHigSel = toggleHigSel;

  async function clasificarLote(clasificacion) {
    var ids = Object.keys(window.crmHigSel || {});
    if (!ids.length) return;
    // S49: optimista también en lote — las filas se van YA
    var d0 = window.crmHigieneData;
    if (d0 && d0.sinClasificar) {
      d0.sinClasificar.top = d0.sinClasificar.top.filter(function (l) { return !window.crmHigSel[l.id]; });
      d0.sinClasificar.count -= ids.length;
      window.crmHigSel = {};
      renderHigiene();
    }
    toast('✅ ' + ids.length + ' → ' + clasificacion + ' (guardando…)', 'ok');
    var d = await apiFetch('/crm/clasificar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ids, clasificacion: clasificacion }) });
    if (!d || !d.ok) { toast('⚠ El lote no se guardó — recargando lista real', 'err'); loadCrmHigiene(); }
    else if ((d.aplicados || 0) < ids.length) { toast('⚠ ' + (ids.length - d.aplicados) + ' no se guardaron — recargando', 'err'); loadCrmHigiene(); }
  }
  window.clasificarLote = clasificarLote;

  // Modo teclado: actúa sobre la fila resaltada cuando ⌨️ está activo (y no estás tipeando)
  document.addEventListener('keydown', function (e) {
    if (!window.crmHigKb) return;
    var tag = (e.target && e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].indexOf(tag) >= 0) return;
    var lista = window.crmHigListaFiltrada || [];
    if (!lista.length) return;
    var max = Math.min(lista.length, window.crmHigieneVisible || 20) - 1;
    var idx = Math.min(window.crmHigFocus || 0, max);
    var KEYS = { p: 'Promover', e: 'Equipo', a: 'AMBBI', x: 'Personal', v: 'Proveedor', n: 'No contactar', d: 'Descartado' };
    var k = e.key.toLowerCase();
    if (e.key === 'ArrowDown') { e.preventDefault(); window.crmHigFocus = Math.min(idx + 1, max); renderHigiene(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); window.crmHigFocus = Math.max(idx - 1, 0); renderHigiene(); }
    else if (k === 's') { e.preventDefault(); window.crmHigFocus = Math.min(idx + 1, max); renderHigiene(); }
    else if (KEYS[k]) { e.preventDefault(); var item = lista[idx]; if (item) { window.crmHigFocus = idx; clasificarLinea(item.id, KEYS[k]); } }
  });

  /* Editor de contacto (NURC/PUFA/etapas) */
  var crmContactosCache = null;
  async function abrirContactoEdit(id) {
    if (!crmContactosCache) {
      var d = await apiFetch('/crm/contactos');
      crmContactosCache = {};
      ((d && d.contactos) || []).forEach(function (c) { crmContactosCache[c.id] = c; });
    }
    var c = crmContactosCache[id] || {};
    var t = document.getElementById('ce-titulo'); if (t) t.textContent = '✏️ ' + (c.nombre || 'Contacto');
    var set = function (eid, v) { var e = document.getElementById(eid); if (e) e.value = (v == null ? '' : String(v)); };
    set('ce-id', id); set('ce-tipo', c.tipo); set('ce-etiqueta', c.etiqueta);
    set('ce-etapacap', c.etapaCaptacion); set('ce-etapadem', c.etapaDemanda);
    set('ce-busca', c.busca); set('ce-seguimiento', c.proximoSeguimiento);
    set('ce-estado', c.estadoContacto); set('ce-motivo', c.motivoCongelado); set('ce-prioridad', c.prioridadActual);
    ['nurcN', 'nurcU', 'nurcR', 'nurcC', 'pufaP', 'pufaU', 'pufaF', 'pufaA'].forEach(function (k) { set('ce-' + k, ''); });
    var chk = document.getElementById('ce-250'); if (chk) chk.checked = !!c.en250;
    var fo = document.getElementById('ce-foco'); if (fo) fo.checked = !!c.enFoco;
    showModal('modal-contacto-edit');
  }
  window.abrirContactoEdit = abrirContactoEdit;

  async function saveContactoEdit() {
    var v = function (eid) { var e = document.getElementById(eid); return e ? e.value.trim() : ''; };
    var id = v('ce-id');
    if (!id) return;
    var body = { id: id, tipo: v('ce-tipo') || undefined, etiqueta: v('ce-etiqueta') || undefined, etapaCaptacion: v('ce-etapacap') || undefined, etapaDemanda: v('ce-etapadem') || undefined, busca: v('ce-busca') || undefined, proximoSeguimiento: v('ce-seguimiento') || undefined, nurcN: v('ce-nurcN') || undefined, nurcU: v('ce-nurcU') || undefined, nurcR: v('ce-nurcR') || undefined, nurcC: v('ce-nurcC') || undefined, pufaP: v('ce-pufaP') || undefined, pufaU: v('ce-pufaU') || undefined, pufaF: v('ce-pufaF') || undefined, pufaA: v('ce-pufaA') || undefined, estadoContacto: v('ce-estado') || undefined, motivoCongelado: v('ce-motivo') || undefined, prioridadActual: v('ce-prioridad') || undefined };
    var chk = document.getElementById('ce-250'); body.en250 = !!(chk && chk.checked);
    var fo = document.getElementById('ce-foco'); body.enFoco = !!(fo && fo.checked);
    var d = await apiFetch('/crm/contacto/actualizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (d && d.ok) { hideModal('modal-contacto-edit'); toast('Contacto actualizado', 'ok'); crmContactosCache = null; loadCrm(); }
    else toast('Error: ' + ((d && d.error) || 'sin conexión'), 'err');
  }
  window.saveContactoEdit = saveContactoEdit;

  /* Import por texto (Zonaprop compartir→copiar) */
  async function importarTexto() {
    var ta = document.getElementById('imp-texto');
    var texto = ta ? ta.value.trim() : '';
    if (texto.length < 40) return toast('Pegá el texto completo de la publicación', 'err');
    hideModal('modal-import');
    toast('Procesando con IA… (~20s)', 'ok');
    var d = await apiFetch('/crm/ficha-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: texto }) });
    if (ta) ta.value = '';
    procesarImportRespuesta(d);
  }
  window.importarTexto = importarTexto;

  // S51 F7: grabar audio directo en el Import Center (sin subir archivo)
  window.importarGrabarAudio = function (btn) {
    grabarAudioYProcesar(btn, async function (b64) {
      toast('🧠 Transcribiendo y armando la ficha… (~20-40s)', 'ok');
      var d = await apiFetch('/crm/ficha-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: 'nota.webm', base64: b64 }) });
      hideModal('modal-import');
      procesarImportRespuesta(d);
    });
  };

  function procesarImportRespuesta(d) {
    if (!d || d.__error || !d.ok) return toast('Error: ' + ((d && d.error) || 'no pude procesar'), 'err');
    abrirFicha('');
    var f = d.ficha || {};
    FICHA_FIELDS.forEach(function (m) {
      var el = document.getElementById(m[0]);
      if (!el) return;
      el.style.background = '';
      var val = f[m[1]];
      if (val !== null && val !== undefined && val !== '') el.value = String(val);
    });
    var co = document.getElementById('f-cochera'); if (co) co.checked = !!f.cochera;
    renderExtras(f.extras || []);
    // campos dudosos → amarillo
    var dudosos = f.camposDudosos || [];
    var mapa = {}; FICHA_FIELDS.forEach(function (m) { mapa[m[1]] = m[0]; });
    dudosos.forEach(function (k) {
      var el = document.getElementById(mapa[k]);
      if (el) el.style.background = 'rgba(255,200,60,0.14)';
    });
    // texto fuente
    var fw = document.getElementById('f-fuente-wrap'), fp = document.getElementById('f-fuente');
    if (fw && fp && d.textoFuente) { fp.textContent = d.textoFuente; fw.style.display = ''; }
    var t = document.getElementById('f-titulo-modal');
    if (t) t.textContent = 'Ficha importada — revisá' + (dudosos.length ? ' (⚠ ' + dudosos.length + ' campos dudosos en amarillo)' : '') + ' y guardá';
    toast(dudosos.length ? '⚠ Revisá los ' + dudosos.length + ' campos en amarillo' : 'Ficha extraída — revisala y guardá', 'ok');
  }

  async function createCrmContacto() {
    var v = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };
    if (!v('c-nombre')) return toast('El nombre es requerido', 'err');
    var tipo = v('c-tipo');
    var body = {
      nombre: v('c-nombre'), tipo: tipo,
      etiqueta: v('c-etiqueta') || undefined, telefono: v('c-telefono') || undefined,
      origen: v('c-origen') || undefined, busca: v('c-busca') || undefined, notas: v('c-notas') || undefined,
      en250: !!(document.getElementById('c-250') || {}).checked
    };
    if (tipo === 'Propietario') body.etapaCaptacion = 'Lead propietario';
    else if (tipo === 'Comprador' || tipo === 'Inquilino') body.etapaDemanda = 'Consulta';
    var d = await apiFetch('/crm/contacto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (d && d.ok) { hideModal('modal-contacto'); toast('Contacto creado en el CRM (Notion)', 'ok'); loadCrm(); }
    else toast('Error: ' + ((d && d.error) || 'sin conexión'), 'err');
  }
  window.createCrmContacto = createCrmContacto;

  /* ─── HERMES INBOX (copiloto: aprobar/rechazar/posponer) ─── */
  async function loadCrmInbox() {
    var el = document.getElementById('crm-inbox');
    if (!el) return;
    var d = await apiFetch('/crm/inbox');
    var cnt = document.getElementById('crm-inbox-count');
    if (!d || d.__error || !d.ok) { el.innerHTML = '<span class="small muted">No pude leer el Inbox.</span>'; return; }
    if (cnt) cnt.textContent = d.count + ' pendientes';
    var list = d.sugerencias || [];
    if (!list.length) { el.innerHTML = '<span class="small muted">✅ Sin sugerencias pendientes — Hermes no detectó nada que requiera tu decisión.</span>'; return; }
    var confCol = { Alta: 'var(--ok)', Media: 'var(--gold)', Baja: 'var(--warn)' };
    el.innerHTML = list.slice(0, 8).map(function (s) {
      return '<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:rgba(255,255,255,0.02);">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap;">' +
          '<span class="badge badge-muted">' + escHtml(s.tipo || '—') + '</span>' +
          '<strong style="font-size:.85rem;flex:1;">' + escHtml(s.sugerencia) + '</strong>' +
          '<span style="font-size:.68rem;color:' + (confCol[s.confianza] || 'var(--muted)') + ';">conf. ' + escHtml(s.confianza || '—') + '</span>' +
        '</div>' +
        (s.detalle ? '<div style="font-size:.78rem;color:var(--muted);line-height:1.45;margin-bottom:7px;">' + escHtml(s.detalle.slice(0, 220)) + '</div>' : '') +
        (s.mensajeBorrador ? '<div style="font-size:.76rem;border-left:2px solid #5ec8d8;padding:4px 8px;margin-bottom:7px;color:var(--text);background:rgba(94,200,216,0.05);">💬 ' + escHtml(s.mensajeBorrador.slice(0, 200)) + '</div>' : '') +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
          '<button class="btn btn-gold btn-sm" onclick="resolverSugerencia(\'' + s.id + '\',\'aprobar\')">✓ Aprobar</button>' +
          (s.mensajeBorrador ? '<button class="btn btn-ghost btn-sm" onclick="copiarBorrador(this)" data-msg="' + escHtml(s.mensajeBorrador) + '">📋 Copiar mensaje</button>' : '') +
          '<button class="btn btn-ghost btn-sm" onclick="resolverSugerencia(\'' + s.id + '\',\'posponer\')">⏸ Posponer</button>' +
          '<button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="resolverSugerencia(\'' + s.id + '\',\'rechazar\')">✕ Descartar</button>' +
        '</div>' +
      '</div>';
    }).join('') + (list.length > 8 ? '<div class="small muted">+' + (list.length - 8) + ' más en Notion → Hermes Inbox</div>' : '');
  }
  window.loadCrmInbox = loadCrmInbox;

  async function resolverSugerencia(id, accion) {
    if (accion === 'aprobar' && !confirm('¿Aprobar esta sugerencia? Si tiene datos estructurados, se aplica al CRM.')) return;
    var d = await apiFetch('/crm/inbox/resolver', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, accion: accion }) });
    if (d && d.ok) {
      toast(accion === 'aprobar' ? (d.aplicado ? 'Aprobada y aplicada (' + d.aplicado.entidad + ')' : 'Aprobada') : accion === 'rechazar' ? 'Descartada' : 'Pospuesta', 'ok');
      loadCrmInbox(); loadCrm();
    } else toast('Error: ' + ((d && d.error) || 'sin conexión'), 'err');
  }
  window.resolverSugerencia = resolverSugerencia;

  function copiarBorrador(btn) {
    var msg = btn.getAttribute('data-msg') || '';
    navigator.clipboard.writeText(msg).then(function () { toast('Mensaje copiado — pegalo en WhatsApp', 'ok'); });
  }
  window.copiarBorrador = copiarBorrador;

  /* ─── OPERACIONES (funnel cierre) ─── */
  async function loadCrmOperaciones() {
    var el = document.getElementById('crm-operaciones');
    if (!el) return;
    var d = await apiFetch('/crm/operaciones');
    if (!d || d.__error || !d.ok) { el.innerHTML = '<span class="small muted">No pude leer operaciones.</span>'; return; }
    var tot = document.getElementById('crm-ops-total');
    if (tot) tot.textContent = d.activas + ' activas';
    // cache propiedad→operación activa (para el semáforo operativo) + vista 360
    window.crmOpsByProp = {};
    (d.items || []).forEach(function (o) {
      if (o.propiedadId && !['Cerrada', 'Caída'].includes(o.etapa)) window.crmOpsByProp[o.propiedadId] = true;
    });
    window.crmOpsCache = d;
    renderVista360();
    // OP-004 (S96): banner de operación activa arriba de todo
    var bn = document.getElementById('crm-ops-banner');
    if (bn) {
      var act = (d.items || []).filter(function (o) { return ['Cerrada', 'Caída'].indexOf(o.etapa) < 0; });
      if (act.length) {
        var oa = act[0], falt = [];
        if (!oa.refuerzo) falt.push('refuerzo');
        if (opFlujoIndex(oa.etapa) < 4) falt.push('cesión/escribanía', 'sellado');
        if (!oa.honorariosCobrados) falt.push('honorarios');
        bn.innerHTML = '<div onclick="abrirFicha360(\'' + oa.id + '\')" style="cursor:pointer;border:1px solid var(--gold);border-radius:12px;padding:11px 16px;margin-bottom:14px;background:rgba(212,175,55,.06);">' +
          '<div style="font-size:.85rem;">Operación activa: <b>' + escHtml(oa.operacion) + '</b> · Etapa <b>' + escHtml(oa.etapa || '—') + '</b>.' + (falt.length ? ' Faltan definir: ' + escHtml(falt.join(', ')) + '.' : '') + '</div>' +
          '<div style="font-size:.7rem;color:var(--gold);margin-top:3px;">Abrir Ficha 360 →</div></div>';
      } else bn.innerHTML = '';
    }
    var opsEmpty = !(d.items || []).length;
    el.innerHTML = (opsEmpty
      ? '<div style="border:1px dashed var(--border);border-radius:12px;padding:18px;text-align:center;margin-bottom:12px;"><div style="font-size:.82rem;color:var(--muted);margin-bottom:10px;">Sin operaciones activas. Cuando haya una oferta o reserva en la mesa, cargala acá (o aprobá la sugerencia de Hermes desde el Inbox).</div><button class="btn btn-gold btn-sm" onclick="showModal(\'modal-operacion\')">+ Primera operación</button></div>'
      : '') + crmFunnelHtml((d.etapas || []).map(function (e) {
      return { etapa: e.etapa, count: e.count, cards: (e.items || []).map(function (i) { return { nombre: i.operacion + (i.montoTotal ? ' · $' + Number(i.montoTotal).toLocaleString('es-AR') : ''), onclick: 'abrirFicha360(\'' + i.id + '\')', title: 'Abrir Ficha 360 de la operación' }; }) };
    })) + (function () {
      // S50 (consultor): próximo paso de cada operación viva, debajo del embudo
      var lineas = (d.items || []).filter(function (o) { return ['Cerrada', 'Caída'].indexOf(o.etapa) < 0 && o.proximoPaso; }).slice(0, 5).map(function (o) {
        return '<div style="font-size:.74rem;padding:2px 0;color:var(--muted);cursor:pointer;" onclick="abrirFicha360(\'' + o.id + '\')" title="Abrir Ficha 360">▶ <b style="color:var(--text);">' + escHtml(o.operacion) + '</b> → ' + escHtml(o.proximoPaso) + '</div>';
      });
      return lineas.length ? '<div style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.06);padding-top:6px;">' + lineas.join('') + '</div>' : '';
    })();
    var al = document.getElementById('crm-ops-alertas');
    if (al) {
      var items = [];
      var a = d.alertas || {};
      (a.sinRefuerzo || []).forEach(function (o) { items.push('🟠 <b>' + escHtml(o) + '</b> — reserva sin refuerzo'); });
      (a.firmasProximas || []).forEach(function (f) { items.push('✍️ <b>' + escHtml(f.operacion) + '</b> — firma el ' + f.fecha); });
      if ((a.honorariosPendientes || 0) > 0) items.push('💰 Honorarios pendientes de cobro: <b>$' + Number(a.honorariosPendientes).toLocaleString('es-AR') + '</b>');
      (a.trabadas || []).forEach(function (t) { items.push('🔴 <b>' + escHtml(t.operacion) + '</b> trabada: ' + escHtml(t.bloqueo.slice(0, 80))); });
      al.innerHTML = items.length
        ? items.map(function (i) { return '<div style="font-size:.8rem;padding:4px 0;border-top:1px solid rgba(255,255,255,0.05);">' + i + '</div>'; }).join('')
        : '<div class="small muted">✅ Sin alertas de cierre.</div>';
    }
  }
  window.loadCrmOperaciones = loadCrmOperaciones;

  async function createCrmOperacion() {
    var v = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };
    if (!v('op-titulo')) return toast('El título es requerido', 'err');
    var d = await apiFetch('/crm/operacion', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operacion: v('op-titulo'), tipo: v('op-tipo'), etapa: v('op-etapa'),
        montoTotal: v('op-monto') || undefined, reserva: v('op-reserva') || undefined,
        honorariosEsperados: v('op-honorarios') || undefined, fechaFirma: v('op-firma') || undefined,
        proximoPaso: v('op-paso') || undefined
      })
    });
    if (d && d.ok) { hideModal('modal-operacion'); toast('Operación creada en el CRM', 'ok'); loadCrmOperaciones(); }
    else toast('Error: ' + ((d && d.error) || 'sin conexión'), 'err');
  }
  window.createCrmOperacion = createCrmOperacion;

  /* ─── P4 consultor (S43): OPERACIÓN GUIADA — checklist por tipo, no formulario genérico ─── */
  function ensureOpModal() {
    if (!document.getElementById('opd-modal-style')) {  // S100C: modal usable (z-index encima del Ficha 360, ancho, backdrop suave, footer sticky, bloques)
      var stl = document.createElement('style'); stl.id = 'opd-modal-style';
      stl.textContent = '#modal-op-detalle{z-index:70;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);}' +
        '#modal-op-detalle .modal{max-width:720px;width:calc(100vw - 32px);max-height:90vh;display:flex;flex-direction:column;padding:22px 22px 0;}' +
        '#opd-body{flex:1;overflow-y:auto;margin-top:6px;padding-right:4px;}' +
        '#opd-footer{position:sticky;bottom:0;background:rgba(20,20,20,0.98);border-top:1px solid var(--border);padding:10px 0;margin-top:6px;display:flex;gap:8px;align-items:center;}' +
        '.opd-sec{border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:10px;}' +
        '.opd-sec-t{font-size:.66rem;color:var(--gold);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;}' +
        '.opd-fld{font-size:.66rem;color:var(--muted);display:block;margin-bottom:2px;}' +
        '.opd-help{font-size:.66rem;color:var(--muted);opacity:.9;margin-top:6px;}';
      document.head.appendChild(stl);
    }
    if (document.getElementById('modal-op-detalle')) return;
    var div = document.createElement('div');
    div.innerHTML = '<div class="modal-overlay hidden" id="modal-op-detalle"><div class="modal">' +
      '<h3 id="opd-titulo" style="margin:0 18px 0 0;font-size:.95rem;">Operación</h3>' +
      '<div id="opd-body"></div>' +
      '</div></div>';
    document.body.appendChild(div.firstChild);
    initModalUX(); // suma la ✕ + click-afuera + Esc (mismo wiring que los demás modales)
  }

  window.crmOpDetalle = null; // operación abierta + estado de checklist en edición

  async function abrirOperacion(id) {
    if (!window.crmOpsCache) { var d0 = await apiFetch('/crm/operaciones'); if (d0 && d0.ok) window.crmOpsCache = d0; }
    if (!window.crmPipelineCache) { var dp = await apiFetch('/crm/pipeline'); if (dp && dp.ok) window.crmPipelineCache = dp; } // S100: poblar el selector de propiedad
    var d = window.crmOpsCache || {};
    var op = ((d.items) || []).filter(function (o) { return o.id === id; })[0];
    if (!op) return toast('No encontré la operación', 'err');
    ensureOpModal();
    window.crmOpDetalle = { op: op, checklist: Object.assign({}, op.checklist || {}) };
    renderOpDetalle();
    showModal('modal-op-detalle');
  }
  window.abrirOperacion = abrirOperacion;

  function renderOpDetalle() {
    var st = window.crmOpDetalle; if (!st) return;
    var op = st.op;
    var d = window.crmOpsCache || {};
    var t = document.getElementById('opd-titulo');
    if (t) t.textContent = '💼 ' + op.operacion;
    var tipo = op.tipo === 'Venta' || op.tipo === 'Alquiler' ? op.tipo : null;
    var tpl = tipo ? ((d.checklists || {})[tipo] || []) : [];
    var hechos = tpl.filter(function (i) { return st.checklist[i.k]; }).length;
    var proximo = tpl.filter(function (i) { return !st.checklist[i.k]; })[0];
    var fUsd = function (n) { return 'USD ' + Number(n || 0).toLocaleString('es-AR'); };
    var inp = 'font-size:.78rem;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:8px;';
    var numFld = function (id2, label, val) { return '<label style="display:inline-block;margin:0 10px 8px 0;"><span class="opd-fld">' + label + '</span><input id="' + id2 + '" type="number" value="' + (val == null ? '' : val) + '" style="width:150px;padding:5px 8px;' + inp + '"></label>'; };
    var dateFld = function (id2, label, val) { return '<label style="display:inline-block;margin:0 10px 8px 0;"><span class="opd-fld">' + label + '</span><input id="' + id2 + '" type="date" value="' + (val ? String(val).slice(0, 10) : '') + '" style="padding:4px 7px;' + inp + '"></label>'; };
    var txtFld = function (id2, label, val, ph) { return '<label class="opd-fld" style="margin-top:8px;">' + label + '<input id="' + id2 + '" value="' + escHtml(val || '') + '" placeholder="' + ph + '" style="width:100%;padding:6px 8px;margin-top:2px;' + inp + '"></label>'; };
    var html = '<div style="font-size:.68rem;color:var(--muted);background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:8px;padding:7px 9px;margin-bottom:10px;">Estás editando la <b style="color:var(--text);">operación</b>. Los datos internos de la <b>propiedad</b> se editan desde su ficha (botón <b>Abrir propiedad</b>).</div>';

    // ── Operación ──
    html += '<div class="opd-sec"><div class="opd-sec-t">Operación</div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
        '<span class="opd-fld" style="margin:0;">Tipo:</span>' +
        ['Venta', 'Alquiler'].map(function (tp) { var on = op.tipo === tp; return '<button class="btn btn-sm ' + (on ? 'btn-gold' : 'btn-ghost') + '" onclick="setOpTipo(\'' + tp + '\')">' + tp + '</button>'; }).join('') +
        '<span class="opd-fld" style="margin:0 0 0 8px;">Etapa:</span>' +
        '<select id="opd-etapa" style="padding:4px 7px;' + inp + '">' + ((d.etapas || []).map(function (e) { return e.etapa; })).map(function (e) { return '<option' + (op.etapa === e ? ' selected' : '') + '>' + e + '</option>'; }).join('') + '</select>' +
        '<span class="opd-fld" style="margin:0 0 0 8px;">Instrumento:</span>' +
        '<select id="opd-instrumento" style="padding:4px 7px;' + inp + '">' + ['', 'Boleto', 'Cesión', 'Contrato', 'Escritura directa', 'Otro'].map(function (x) { return '<option' + ((op.instrumento || '') === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>' +
      '</div></div>';

    // ── Propiedad vinculada (selector funcional + abrir ficha; no se vincula solo) ──
    var propItems = ((window.crmPipelineCache || {}).propiedades || {}).items || [];
    var propObj = op.propiedadId ? propItems.filter(function (p) { return p.id === op.propiedadId; })[0] : null;
    html += '<div class="opd-sec"><div class="opd-sec-t">Propiedad vinculada</div>' +
      '<select id="opd-propiedad" style="width:100%;padding:6px 8px;' + inp + '"><option value="">— sin vincular —</option>' +
        propItems.map(function (pp) { return '<option value="' + pp.id + '"' + (op.propiedadId === pp.id ? ' selected' : '') + '>' + escHtml(pp.propiedad || pp.id) + '</option>'; }).join('') + '</select>' +
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:6px;">' +
        (op.propiedadId ? '<button class="btn btn-ghost btn-sm" onclick="abrirLegajo(\'' + op.propiedadId + '\')">🏠 Abrir ficha de propiedad</button>' : '') +
        '<span class="opd-help" style="margin:0;">' + (op.propiedadId ? ('Vinculada' + (propObj && propObj.docsPct != null ? ' · docs ' + propObj.docsPct + '%' : '') + '. Propietario/documentos se completan en su ficha.') : 'Elegí una y tocá 💾 Guardar para vincular (no se vincula solo).') + '</span>' +
      '</div>' + (propItems.length ? '' : '<div style="font-size:.62rem;color:var(--warn);margin-top:4px;">No hay propiedades en cache — entrá a 🏢 Propiedades y reabrí.</div>') +
      '</div>';

    // ── Valores (labels claros + honorarios sugeridos) ──
    var comPct = (op.honorariosEsperados && op.montoTotal) ? Math.round(op.honorariosEsperados / op.montoTotal * 1000) / 10 : null;
    var honSug = (comPct && op.montoTotal) ? Math.round(op.montoTotal * comPct / 100) : null;
    html += '<div class="opd-sec"><div class="opd-sec-t">Valores</div>' +
      '<div>' + numFld('opd-monto', 'Precio de cierre USD', op.montoTotal) + numFld('opd-reserva', 'Reserva USD', op.reserva) + numFld('opd-refuerzo', 'Refuerzo USD', op.refuerzo) + '</div>' +
      '<div>' + numFld('opd-honesp', 'Honorarios esperados USD', op.honorariosEsperados) + numFld('opd-honcob', 'Honorarios cobrados USD', op.honorariosCobrados) + '</div>' +
      (honSug != null ? '<div class="opd-help">' + fUsd(op.montoTotal) + ' × ' + comPct + '% = <b style="color:var(--gold);">' + fUsd(honSug) + '</b> <button class="btn btn-ghost btn-sm" style="padding:1px 8px;" onclick="opdSugerirHonorarios(' + comPct + ')">Sugerir ' + fUsd(honSug) + '</button> <span style="opacity:.7;">(no escribe hasta Guardar)</span></div>' : '<div class="opd-help">Cargá precio + honorarios para que sugiera el % automático.</div>') +
      '</div>';

    // ── Datos de cierre ──
    html += '<div class="opd-sec"><div class="opd-sec-t">Datos de cierre</div>' +
      '<div>' + dateFld('opd-fecha-reserva', 'Fecha reserva', op.fechaReserva) + dateFld('opd-firma', 'Fecha firma', op.fechaFirma) + dateFld('opd-fecha-posesion', 'Fecha posesión', op.fechaPosesion) + '</div>' +
      txtFld('opd-pagador', 'Pagador de la reserva', op.pagadorReserva, 'ej. Alejandro') +
      txtFld('opd-escribania', 'Escribanía', op.escribania, 'nombre de la escribanía') +
      txtFld('opd-proveedor-sellado', 'Proveedor de sellado / informes', op.proveedorSellado, 'ej. Bolsa de Comercio') +
      '</div>';

    // ── Bloqueo (checkbox + motivo) ──
    var trabada = !!(op.bloqueo && String(op.bloqueo).trim());
    html += '<div class="opd-sec"><div class="opd-sec-t">Bloqueo</div>' +
      '<label style="display:flex;align-items:center;gap:8px;font-size:.82rem;cursor:pointer;"><input type="checkbox" id="opd-trabada"' + (trabada ? ' checked' : '') + ' onchange="opdToggleTrabada(this.checked)"> ¿Operación trabada?</label>' +
      '<input id="opd-bloqueo" value="' + escHtml(op.bloqueo || '') + '"' + (trabada ? '' : ' disabled') + ' placeholder="Motivo del bloqueo — ej: falta informe de dominio, falta escribanía, comprador no confirmó refuerzo" style="width:100%;margin-top:6px;padding:6px 8px;' + inp + (trabada ? '' : 'opacity:.5;') + '">' +
      '</div>';

    // ── Checklist ──
    html += '<div class="opd-sec"><div class="opd-sec-t">Checklist ' + (tipo || '') + '</div>';
    if (!tipo) {
      html += '<div style="font-size:.78rem;color:var(--muted);">Elegí <b>Venta</b> o <b>Alquiler</b> (bloque Operación) y aparece el flujo guiado con su checklist.</div>';
    } else {
      if (proximo) {
        html += '<div style="border:1px solid var(--gold);border-radius:10px;padding:9px 11px;margin-bottom:9px;background:rgba(212,175,55,0.06);"><div style="font-size:.64rem;color:var(--gold);text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px;">▶ Próximo paso (' + hechos + '/' + tpl.length + ')</div><div style="font-size:.84rem;font-weight:700;">' + escHtml(proximo.label) + '</div></div>';
      } else if (tpl.length) {
        html += '<div style="border:1px solid var(--ok);border-radius:10px;padding:9px 11px;margin-bottom:9px;font-size:.82rem;">✅ Checklist completo — si cobraste, pasala a <b>Cerrada</b>.</div>';
      }
      html += tpl.map(function (i) { var on = !!st.checklist[i.k]; return '<label style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer;font-size:.8rem;' + (on ? 'color:var(--muted);' : '') + '"><input type="checkbox"' + (on ? ' checked' : '') + ' onchange="toggleOpItem(\'' + i.k + '\',this.checked)"><span style="' + (on ? 'text-decoration:line-through;' : '') + '">' + escHtml(i.label) + '</span></label>'; }).join('');
    }
    html += '</div>';

    // ── Footer sticky ──
    html += '<div id="opd-footer">' +
      '<button class="btn btn-gold btn-sm" onclick="saveOpDetalle()">💾 Guardar</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="hideModal(\'modal-op-detalle\')">Cancelar</button>' +
      '<a class="btn btn-ghost btn-sm" style="text-decoration:none;margin-left:auto;" href="' + (op.url || '#') + '" target="_blank" rel="noopener">↗ Notion</a>' +
      '</div>';

    var body = document.getElementById('opd-body');
    if (body) body.innerHTML = html;
  }

  function setOpTipo(tp) { if (window.crmOpDetalle) { window.crmOpDetalle.op.tipo = tp; renderOpDetalle(); } }
  window.setOpTipo = setOpTipo;
  function toggleOpItem(k, on) {
    var st = window.crmOpDetalle; if (!st) return;
    if (on) st.checklist[k] = true; else delete st.checklist[k];
    renderOpDetalle();
  }
  window.toggleOpItem = toggleOpItem;
  // S100C: sugerir honorarios (precio × %) — rellena visualmente, NO escribe hasta Guardar
  window.opdSugerirHonorarios = function (pct) { var m = parseFloat((document.getElementById('opd-monto') || {}).value || '0'); var h = document.getElementById('opd-honesp'); if (m > 0 && h) { h.value = Math.round(m * pct / 100); toast('Honorarios sugeridos — revisá y tocá 💾 Guardar', 'ok'); } };
  // S100C: checkbox ¿trabada? habilita/limpia el motivo del bloqueo
  window.opdToggleTrabada = function (on) { var b = document.getElementById('opd-bloqueo'); if (b) { b.disabled = !on; b.style.opacity = on ? '1' : '.5'; if (!on) b.value = ''; else b.focus(); } };

  async function saveOpDetalle() {
    var st = window.crmOpDetalle; if (!st) return;
    var v = function (id2) { var e = document.getElementById(id2); return e ? e.value.trim() : ''; };
    var d = window.crmOpsCache || {};
    var tipo = st.op.tipo;
    var tpl = ((d.checklists || {})[tipo] || []);
    var proximo = tpl.filter(function (i) { return !st.checklist[i.k]; })[0];
    var body = {
      id: st.op.id, etapa: v('opd-etapa') || undefined, tipo: tipo || undefined,
      checklist: st.checklist,
      bloqueo: v('opd-bloqueo'),
      proximoPaso: proximo ? proximo.label : (tpl.length ? 'Checklist completo — cerrar' : ''),
      montoTotal: v('opd-monto') || undefined, reserva: v('opd-reserva') || undefined, refuerzo: v('opd-refuerzo') || undefined,
      honorariosEsperados: v('opd-honesp') || undefined, honorariosCobrados: v('opd-honcob') || undefined,
      fechaFirma: v('opd-firma') || undefined,
      // S98B campos nuevos (texto e instrumento se mandan crudos → permiten limpiar; fechas solo si hay valor)
      fechaReserva: v('opd-fecha-reserva') || undefined,
      fechaPosesion: v('opd-fecha-posesion') || undefined,
      instrumento: v('opd-instrumento'),
      pagadorReserva: v('opd-pagador'),
      escribania: v('opd-escribania'),
      proveedorSellado: v('opd-proveedor-sellado'),
      propiedadId: v('opd-propiedad') || undefined
    };
    var r = await apiFetch('/crm/operacion/actualizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r && r.ok) { hideModal('modal-op-detalle'); toast('Operación actualizada — próximo paso: ' + (body.proximoPaso || '—'), 'ok'); window.crmOpsCache = null; loadCrmOperaciones(); }
    else toast('Error: ' + ((r && r.error) || 'sin conexión'), 'err');
  }
  window.saveOpDetalle = saveOpDetalle;

  // ════════ S96: OPERACIONES — Ficha 360 front-first (vista READ workspace; edición real = modal quick-edit) ════════
  var OP_FLUJO = [
    { k: 'oferta', label: 'Oferta' }, { k: 'reserva', label: 'Reserva' }, { k: 'refuerzo', label: 'Refuerzo' },
    { k: 'documentacion', label: 'Documentación' }, { k: 'escribania', label: 'Escribanía / contrato / cesión' },
    { k: 'firma', label: 'Firma' }, { k: 'posesion', label: 'Entrega / posesión' },
    { k: 'honorarios', label: 'Honorarios' }, { k: 'cierre', label: 'Cierre documentado' }
  ];
  var OP_DOCS = ['Reserva firmada', 'DNI / CUIT de las partes', 'Informes (dominio / inhibición)', 'Escritura / título', 'Reglamento de copropiedad', 'Plano', 'Comprobante de sellado', 'Boleto / cesión', 'Recibos de pago', 'Factura de honorarios'];
  // S100 A1: documentos ESPERADOS por tipo de operación (para "qué falta"; tipos alineados con la DB Documentos donde aplica)
  var OP_DOCS_ESPERADOS = {
    Venta: ['Reserva firmada', 'Comprobante de reserva', 'DNI / CUIT partes', 'Boleto / cesión / instrumento', 'Escritura / título', 'Informe de dominio', 'Informe de inhibición', 'Reglamento de copropiedad', 'Plano', 'ABL', 'AySA', 'Expensas', 'Libre deuda', 'Comprobante de sellado', 'Factura honorarios', 'Recibos', 'Documentación de escribanía'],
    Alquiler: ['Reserva', 'DNI/CUIT', 'Garantía', 'Contrato', 'Inventario', 'Recibos de pago']
  };
  function opFlujoIndex(etapa) {
    var e = (etapa || '').toLowerCase();
    if (/cerrad|cierre/.test(e)) return 8;
    if (/honorari/.test(e)) return 7;
    if (/entrega|posesi/.test(e)) return 6;
    if (/firma/.test(e)) return 5;
    if (/escriban|contrato|cesi|boleto/.test(e)) return 4;
    if (/document/.test(e)) return 3;
    if (/refuerzo/.test(e)) return 2;
    if (/reserva/.test(e)) return 1;
    if (/oferta/.test(e)) return 0;
    return 1;
  }
  function f360Usd(n) { return (n != null && n !== '') ? 'USD ' + Number(n).toLocaleString('es-AR') : null; }
  function f360Ph(txt) { return '<span style="color:var(--muted);font-style:italic;opacity:.7;">' + escHtml(txt || 'pendiente de mapear') + '</span>'; }
  // S97 Paso 1.5: "dato faltante" REAL (el campo existe, falta vincular) — distinto del placeholder sin backend
  function f360Falta(txt) { return '<span style="color:var(--muted);opacity:.9;">— ' + escHtml(txt || 'no disponible') + '</span>'; }
  function f360Parte(p, faltaTxt) { return (p && p.nombre) ? (escHtml(p.nombre) + (p.telefono ? ' <span style="color:var(--muted);font-size:.68rem;font-family:var(--mono);">' + escHtml(p.telefono) + '</span>' : '')) : f360Falta(faltaTxt); }
  function f360DocColor(estado) { var e = (estado || '').toLowerCase(); if (/bloquea/.test(e)) return 'var(--danger)'; if (/validad|recib/.test(e)) return 'var(--ok)'; if (/observ|revis|pendiente|asociad|ocr|extra|analiz/.test(e)) return 'var(--warn)'; return 'var(--muted)'; }
  function f360TrackIcon(a) { a = a || ''; if (a === 'crear') return '📌'; if (a === 'actualizar') return '🔄'; if (/doc/.test(a)) return '📎'; if (a === 'comentario') return '💬'; if (a === 'calcular' || a === 'pdf' || /comparable/.test(a)) return '🧮'; return '•'; }
  function f360TrackLabel(e) { var a = (e && e.accion) || '', det = (e && e.detalle) || {}; var m = { crear: 'Operación creada', actualizar: 'Actualización' + (det && det.etapa ? ' → ' + det.etapa : ''), comentario: 'Nota', doc_inbound: 'Documento recibido', doc_validar: 'Documento validado', doc_asignar: 'Documento asignado', doc_gestion: 'Gestión documental', calcular: 'Tasación calculada', pdf: 'PDF generado', sugerencia_aprobar: 'Sugerencia aprobada' }; return m[a] || (a ? a.charAt(0).toUpperCase() + a.slice(1).replace(/_/g, ' ') : 'Evento'); }
  function ensureFicha360() {
    if (!document.getElementById('op-f360-style')) {
      var st = document.createElement('style'); st.id = 'op-f360-style';
      st.textContent = '#op-f360{align-items:flex-start;justify-content:center;overflow-y:auto;padding:0;z-index:60;}' +
        '#op-f360 .f360-inner{width:100%;max-width:1700px;min-height:100vh;background:var(--bg);}' +
        '#op-f360 .f360-cols{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.5fr) minmax(340px,1.05fr);gap:14px;align-items:start;}' +
        '#op-f360 .f360-hermes-rail{position:sticky;top:84px;height:calc(100vh - 98px);}' +
        '#op-f360 #f360-hermes{display:flex;flex-direction:column;height:100%;margin-bottom:0;}' +
        '#op-f360 .oph-head{flex:0 0 auto;text-align:center;padding-bottom:12px;border-bottom:1px solid rgba(94,200,216,.18);margin-bottom:11px;}' +
        '#op-f360 .oph-avatar{width:92px;height:92px;border-radius:50%;object-fit:cover;border:3px solid rgba(94,200,216,.7);box-shadow:0 0 22px rgba(94,200,216,.32);}' +
        '#op-f360 .oph-name{color:#5ec8d8;font-weight:700;font-size:1.18rem;letter-spacing:.02em;margin-top:8px;}' +
        '#op-f360 .oph-compose{flex:0 0 auto;margin-top:8px;border-top:1px solid rgba(94,200,216,.15);padding-top:9px;}' +
        '#op-f360 #f360-hermes.oph-dragover{outline:2px dashed rgba(94,200,216,.75);outline-offset:-5px;border-radius:14px;}' +
        '#op-f360 .oph-drop{margin-bottom:8px;border:1px solid var(--gold);border-radius:10px;padding:8px 10px;background:rgba(212,175,55,.06);}' +
        '#op-f360 .oph-input{padding:9px 12px;font-size:.82rem;line-height:1.4;font-family:inherit;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:9px;resize:none;overflow-y:auto;min-height:72px;max-height:180px;}' +
        '#op-f360 .oph-input.oph-input-big{max-height:340px;min-height:120px;}' +
        '#op-f360 .oph-input:focus{outline:none;border-color:rgba(94,200,216,.6);}' +
        // S103A.3: scrollbar dark/fina (no blanca) en textarea + thread; recién aparece pasado el auto-grow máximo
        '#op-f360 .oph-input,#op-f360 .oph-log{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.16) transparent;}' +
        '#op-f360 .oph-input::-webkit-scrollbar,#op-f360 .oph-log::-webkit-scrollbar{width:8px;height:8px;}' +
        '#op-f360 .oph-input::-webkit-scrollbar-track,#op-f360 .oph-log::-webkit-scrollbar-track{background:transparent;}' +
        '#op-f360 .oph-input::-webkit-scrollbar-thumb,#op-f360 .oph-log::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:5px;}' +
        '#op-f360 .oph-input::-webkit-scrollbar-thumb:hover,#op-f360 .oph-log::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.24);}' +
        // S103A.3: mini-panel "Anotaciones de Hermes" (memoria visible derivada de /ficha)
        '#op-f360 .oph-anot{flex:0 0 auto;border:1px solid rgba(94,200,216,.22);background:rgba(94,200,216,.05);border-radius:9px;padding:8px 10px;margin-bottom:9px;}' +
        '#op-f360 .oph-anot-t{font-size:.6rem;color:#5ec8d8;text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:5px;}' +
        '#op-f360 .oph-anot-row{display:flex;gap:8px;font-size:.7rem;line-height:1.55;}' +
        '#op-f360 .oph-anot-k{flex:0 0 80px;color:var(--muted);}' +
        '#op-f360 .oph-anot-v{flex:1;min-width:0;color:var(--text);}' +
        '#op-f360 .oph-safe{flex:0 0 auto;font-size:.6rem;color:#aee4ee;opacity:.8;margin-bottom:9px;}' +
        '#op-f360 details > summary::-webkit-details-marker{display:none;}' +
        '#op-f360 .oph-log{flex:1 1 auto;overflow-y:auto;min-height:0;padding-right:5px;display:flex;flex-direction:column;gap:8px;}' +
        '#op-f360 .oph-b{font-size:.78rem;border-radius:10px;padding:8px 11px;max-width:92%;}' +
        '#op-f360 .oph-b-franco{align-self:flex-end;background:rgba(212,175,55,.14);border:1px solid rgba(212,175,55,.3);}' +
        '#op-f360 .oph-b-hermes{align-self:stretch;max-width:100%;background:rgba(94,200,216,.06);border:1px solid rgba(94,200,216,.25);}' +
        '#op-f360 .oph-b-system{align-self:center;background:rgba(255,255,255,.03);border:1px dashed var(--border);font-size:.7rem;}' +
        '#op-f360 .oph-b-thinking{align-self:flex-start;font-size:.74rem;color:#5ec8d8;}' +
        '@media(prefers-reduced-motion:no-preference){#op-f360 .oph-b{animation:ophIn .18s ease-out;}@keyframes ophIn{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:none;}}}' +
        '#op-f360 .oph-body{flex:1 1 auto;overflow-y:auto;min-height:0;padding-right:5px;}' +
        '@media(max-width:1400px){#op-f360 .oph-avatar{width:80px;height:80px;}#op-f360 .oph-name{font-size:1.08rem;}}' +
        '@media(max-width:1100px){#op-f360 .f360-cols{grid-template-columns:1fr;}#op-f360 .f360-hermes-rail{position:static;height:auto;}#op-f360 #f360-hermes{height:auto;}#op-f360 .oph-body,#op-f360 .oph-log{overflow:visible;}#op-f360 .oph-avatar{width:64px;height:64px;}}' +
        '#op-f360 .f360-card{border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px;background:rgba(255,255,255,.015);}' +
        '#op-f360 .f360-t{font-size:.66rem;color:var(--gold);text-transform:uppercase;letter-spacing:.08em;margin-bottom:9px;}' +
        '#op-f360 .f360-nav a{font-size:.72rem;color:var(--muted);border:1px solid var(--border);border-radius:7px;padding:2px 9px;cursor:pointer;text-decoration:none;white-space:nowrap;}' +
        '#op-f360 .f360-nav a:hover{color:var(--gold);border-color:var(--gold);}';
      document.head.appendChild(st);
    }
    if (document.getElementById('op-f360')) return;
    var dv = document.createElement('div');
    dv.className = 'modal-overlay hidden'; dv.id = 'op-f360';
    dv.innerHTML = '<div class="f360-inner" id="op-f360-inner"></div>';
    document.body.appendChild(dv);
  }
  function cerrarFicha360() { var o = document.getElementById('op-f360'); if (o) o.classList.add('hidden'); }
  window.cerrarFicha360 = cerrarFicha360;
  function f360goto(a) { var el = document.getElementById(a); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  window.f360goto = f360goto;
  async function abrirFicha360(id) {
    if (!window.crmOpsCache) { var d0 = await apiFetch('/crm/operaciones'); if (d0 && d0.ok) window.crmOpsCache = d0; }
    var op = ((window.crmOpsCache || {}).items || []).filter(function (o) { return o.id === id; })[0];
    if (!op) return toast('No encontré la operación', 'err');
    ensureFicha360(); window.opF360 = op; window.opF360Ficha = null; renderFicha360();
    var o = document.getElementById('op-f360'); o.classList.remove('hidden'); o.scrollTop = 0;
    // S97 Paso 1.5: enriquecer con el read-model real (partes + documentos + track); si falla, queda el render base
    try {
      var fx = await apiFetch('/crm/operacion/' + id + '/ficha');
      if (fx && fx.ok && window.opF360 && window.opF360.id === id) { window.opF360Ficha = fx; renderFicha360(); }
    } catch (e) { /* fallback silencioso: la Ficha ya está renderizada con los datos base */ }
  }
  window.abrirFicha360 = abrirFicha360;
  // S101/A2: picker para vincular un documento EXISTENTE a la operación (POST /crm/documento/asignar-operacion)
  window.opVincularDoc = async function (opId) {
    var dd = await apiFetch('/crm/docs-auditoria');
    window.vincdocData = { opId: opId, docs: (dd && dd.ok && dd.items) || [] };
    var ov = document.getElementById('op-vincdoc');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'op-vincdoc'; ov.className = 'modal-overlay hidden'; ov.style.cssText = 'z-index:78;background:rgba(0,0,0,.55);';
      ov.innerHTML = '<div class="modal" style="max-width:640px;width:calc(100vw - 40px);max-height:84vh;display:flex;flex-direction:column;">' +
        '<h3 style="margin:0 0 8px;font-size:1rem;color:var(--gold);">🔗 Vincular documento a la operación</h3>' +
        '<input id="vincdoc-q" placeholder="🔎 filtrar por nombre/tipo/propiedad…" style="width:100%;margin-bottom:8px;padding:6px 8px;font-size:.78rem;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:8px;" oninput="window.vincdocRender()">' +
        '<div id="vincdoc-list" style="flex:1;overflow-y:auto;"></div>' +
        '<div style="margin-top:8px;"><button class="btn btn-ghost btn-sm" onclick="hideModal(\'op-vincdoc\')">Cerrar</button></div></div>';
      document.body.appendChild(ov); initModalUX();
    }
    window.vincdocRender = function () {
      var q = ((document.getElementById('vincdoc-q') || {}).value || '').toLowerCase();
      var list = window.vincdocData.docs.filter(function (x) { return !q || (((x.nombreSugerido || x.filename || '') + ' ' + (x.tipo || '') + ' ' + (x.propiedad || '')).toLowerCase().indexOf(q) >= 0); });
      var el = document.getElementById('vincdoc-list'); if (!el) return;
      el.innerHTML = list.length ? list.map(function (x) { var nm = x.nombreSugerido || x.filename || x.tipo || 'Documento'; return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:.78rem;"><span style="color:' + f360DocColor(x.estado) + ';">●</span><div style="flex:1;min-width:0;"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(nm) + '</div><div style="font-size:.64rem;color:var(--muted);">' + escHtml((x.tipo || 'sin tipo') + ' · ' + (x.estado || '') + (x.propiedad ? ' · 🏠 ' + x.propiedad : '')) + '</div></div><button class="btn btn-gold btn-xs" onclick="window.vincdocAsignar(\'' + x.id + '\')">Vincular</button></div>'; }).join('') : '<div style="font-size:.8rem;color:var(--muted);padding:10px 0;">Sin documentos para mostrar.</div>';
    };
    window.vincdocAsignar = async function (docId) {
      var r = await apiFetch('/crm/documento/asignar-operacion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentoId: docId, operacionId: window.vincdocData.opId }) });
      if (r && r.ok) { toast('Documento vinculado a la operación', 'ok'); hideModal('op-vincdoc'); window.opF360Ficha = null; abrirFicha360(window.vincdocData.opId); }
      else toast('Error: ' + ((r && r.error) || 'sin conexión'), 'err');
    };
    window.vincdocRender(); showModal('op-vincdoc');
  };
  // S101B: subir un documento NUEVO directo a la operación (POST /crm/operacion/:id/doc) — Estado Recibido, dedup por hash, opcional también propiedad
  window.opSubirDocModal = function (opId) {
    var op = window.opF360 || {};
    var fx = window.opF360Ficha || {};
    var opPropId = (fx.partes && fx.partes.propiedadId) || op.propiedadId || null;
    var opPropNom = op.propiedad || '';
    if (!opPropNom && opPropId) { try { var pc = (window.crmPipelineCache && crmPipelineCache.propiedades && crmPipelineCache.propiedades.items) || []; var pp = pc.filter(function (x) { return x.id === opPropId; })[0]; if (pp) opPropNom = pp.propiedad; } catch (e) { } }
    var TIPOS = ['Reserva', 'Boleto', 'Contrato', 'Escritura', 'COTI', 'DNI/CUIT', 'Poder', 'Otro']; // opciones EXISTENTES del select Tipo (no se crean nuevas)
    var ov = document.getElementById('op-subirdoc'); if (ov) ov.remove(); // re-crear con el contexto fresco de ESTA operación
    ov = document.createElement('div'); ov.id = 'op-subirdoc'; ov.className = 'modal-overlay hidden'; ov.style.cssText = 'z-index:79;background:rgba(0,0,0,.55);';
    ov.innerHTML = '<div class="modal" style="max-width:520px;width:calc(100vw - 40px);">' +
      '<h3 style="margin:0 0 10px;font-size:1rem;color:var(--gold);">📎 Subir documento a la operación</h3>' +
      '<label style="font-size:.72rem;color:var(--muted);display:block;margin-bottom:4px;">Archivo (PDF/imagen, máx 25MB)</label>' +
      '<input id="osd-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" style="width:100%;margin-bottom:10px;font-size:.78rem;color:var(--text);">' +
      '<label style="font-size:.72rem;color:var(--muted);display:block;margin-bottom:4px;">Tipo de documento</label>' +
      '<select id="osd-tipo" style="width:100%;margin-bottom:10px;padding:6px 8px;font-size:.78rem;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:8px;">' +
      TIPOS.map(function (t) { return '<option value="' + escHtml(t) + '"' + (t === 'Reserva' ? ' selected' : '') + '>' + escHtml(t) + '</option>'; }).join('') + '</select>' +
      (opPropId ? '<label style="display:flex;align-items:center;gap:8px;font-size:.78rem;margin-bottom:10px;cursor:pointer;"><input type="checkbox" id="osd-prop"> También vincular a la propiedad <b>' + escHtml(opPropNom || 'vinculada') + '</b> (🔗 ambos)</label>' : '<div style="font-size:.68rem;color:var(--muted);margin-bottom:10px;">La operación no tiene propiedad vinculada — el documento queda solo en la operación 💼.</div>') +
      '<div style="font-size:.68rem;color:var(--muted);margin-bottom:12px;border-top:1px dashed var(--border);padding-top:8px;">Se guarda con estado <b style="color:var(--ok);">Recibido</b> (la validación es siempre manual). Si el mismo archivo ya existe, se vincula sin duplicar.</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
      '<button class="btn btn-ghost btn-sm" onclick="hideModal(\'op-subirdoc\')">Cancelar</button>' +
      '<button id="osd-btn" class="btn btn-gold btn-sm" onclick="window.opSubirDocGo(\'' + opId + '\')">☁️ Subir</button>' +
      '</div></div>';
    document.body.appendChild(ov); if (typeof initModalUX === 'function') initModalUX(); showModal('op-subirdoc');
  };
  window.opSubirDocGo = function (opId) {
    var input = document.getElementById('osd-file');
    var file = input && input.files && input.files[0];
    if (!file) return toast('Elegí un archivo', 'err');
    if (file.size > 25 * 1024 * 1024) return toast('Máx 25MB', 'err');
    var tipo = (document.getElementById('osd-tipo') || {}).value || null;
    var tambienProp = !!(document.getElementById('osd-prop') && document.getElementById('osd-prop').checked);
    var btn = document.getElementById('osd-btn'); if (btn) { btn.disabled = true; btn.textContent = 'Subiendo…'; }
    var reader = new FileReader();
    reader.onload = async function () {
      var r = await apiFetch('/crm/operacion/' + opId + '/doc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, base64: String(reader.result), tipoDoc: tipo, tambienPropiedad: tambienProp }) });
      if (btn) { btn.disabled = false; btn.textContent = '☁️ Subir'; }
      if (r && r.ok) {
        var alc = r.alcance === 'ambos' ? '🔗 ambos' : r.alcance === 'operacion' ? '💼 operación' : '🏠 propiedad';
        var msg = r.yaExistia ? ('Ya existía — vinculado (' + alc + ')') : ('Documento subido (' + alc + ') · Recibido');
        if (r.warnings && r.warnings.length) msg += ' ⚠️ ' + r.warnings[0];
        toast(msg, 'ok');
        hideModal('op-subirdoc');
        if (window.ophPush) ophPush(opId, { role: 'system', icon: '📎', text: (r.yaExistia ? 'Documento ya existía — vinculado a la operación' : 'Documento subido y vinculado a la operación') + ' (' + alc + ')', color: 'ok' }); // S103A: burbuja en el thread
        window.opF360Ficha = null; abrirFicha360(opId); // refresca /ficha (partes/docs/track reales) — el thread se re-pinta desde opHermesChat
      } else toast('Error: ' + ((r && r.error) || 'no pude subir'), 'err');
    };
    reader.onerror = function () { if (btn) { btn.disabled = false; btn.textContent = '☁️ Subir'; } toast('No pude leer el archivo', 'err'); };
    reader.readAsDataURL(file);
  };
  // S103A.1 · Parte B: drag & drop SEGURO al rail de Hermes. Arrastrar NO sube: stagea el archivo + chip; subir exige click explícito.
  window.ophDropFile = null;
  window.ophDragOver = function (e) { e.preventDefault(); e.stopPropagation(); var el = document.getElementById('f360-hermes'); if (el) el.classList.add('oph-dragover'); };
  window.ophDragLeave = function (e) { if (e && e.stopPropagation) e.stopPropagation(); var el = document.getElementById('f360-hermes'); if (el) el.classList.remove('oph-dragover'); };
  window.ophDrop = function (e, opId) {
    e.preventDefault(); e.stopPropagation();
    var el = document.getElementById('f360-hermes'); if (el) el.classList.remove('oph-dragover');
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) return toast('Máx 25MB', 'err');
    window.ophDropFile = f;
    var n = (f.name || '').toLowerCase(), tipo = 'Otro';
    [['reserva', 'Reserva'], ['boleto', 'Boleto'], ['contrato', 'Contrato'], ['escritura', 'Escritura'], ['coti', 'COTI'], ['dni', 'DNI/CUIT'], ['cuit', 'DNI/CUIT'], ['poder', 'Poder']].forEach(function (p) { if (n.indexOf(p[0]) >= 0) tipo = p[1]; });
    var TIPOS = ['Reserva', 'Boleto', 'Contrato', 'Escritura', 'COTI', 'DNI/CUIT', 'Poder', 'Otro'];
    var kb = f.size < 1024 ? f.size + ' B' : (f.size / 1024 < 1024 ? Math.round(f.size / 1024) + ' KB' : (f.size / 1048576).toFixed(1) + ' MB');
    var box = document.getElementById('oph-drop'); if (!box) return;
    box.innerHTML = '<div class="oph-drop"><div style="font-size:.74rem;margin-bottom:5px;">📄 <b>' + escHtml(f.name) + '</b> <span style="color:var(--muted);">· ' + kb + '</span></div>' +
      '<div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;">' +
      '<select id="oph-drop-tipo" style="padding:5px 7px;font-size:.74rem;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:7px;">' + TIPOS.map(function (t) { return '<option' + (t === tipo ? ' selected' : '') + '>' + escHtml(t) + '</option>'; }).join('') + '</select>' +
      '<button class="btn btn-gold btn-sm" onclick="ophDropUpload(\'' + opId + '\')">☁️ Subir documento</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="ophDropCancel()" title="Descartar">✕</button>' +
      '</div><div style="font-size:.62rem;color:var(--muted);margin-top:5px;">Se guarda como <b style="color:var(--ok);">Recibido</b>. <b>No se sube</b> hasta que toques “Subir documento”.</div></div>';
  };
  window.ophDropCancel = function () { window.ophDropFile = null; var b = document.getElementById('oph-drop'); if (b) b.innerHTML = ''; };
  window.ophDropUpload = function (opId) {
    var f = window.ophDropFile; if (!f) return toast('No hay archivo', 'err');
    var tipo = (document.getElementById('oph-drop-tipo') || {}).value || 'Otro';
    var box = document.getElementById('oph-drop'); var btn = box ? box.querySelector('.btn-gold') : null;
    if (btn) { btn.disabled = true; btn.textContent = 'Subiendo…'; }
    var reader = new FileReader();
    reader.onload = async function () {
      var r = await apiFetch('/crm/operacion/' + opId + '/doc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: f.name, base64: String(reader.result), tipoDoc: tipo, tambienPropiedad: false }) });
      window.ophDropFile = null;
      if (r && r.ok) {
        var alc = r.alcance === 'ambos' ? '🔗 ambos' : r.alcance === 'operacion' ? '💼 operación' : '🏠 propiedad';
        toast(r.yaExistia ? 'Ya existía — vinculado' : 'Documento subido · Recibido', 'ok');
        if (window.ophPush) ophPush(opId, { role: 'system', icon: '📎', text: (r.yaExistia ? 'Documento ya existía — vinculado a la operación' : 'Documento subido y vinculado a la operación') + ' (' + alc + ')', color: 'ok' });
        window.opF360Ficha = null; abrirFicha360(opId);
      } else { if (btn) { btn.disabled = false; btn.textContent = '☁️ Subir documento'; } toast('Error: ' + ((r && r.error) || 'no pude subir'), 'err'); }
    };
    reader.onerror = function () { if (btn) { btn.disabled = false; btn.textContent = '☁️ Subir documento'; } toast('No pude leer el archivo', 'err'); };
    reader.readAsDataURL(f);
  };
  // S102B: copiloto Hermes Operativo PREVIEW-ONLY (texto/audio → POST /crm/operacion/:id/hermes → propone, NUNCA escribe).
  window.opHermesChip = function (t) { var i = document.getElementById('op-hermes-input'); if (i) { i.value = t; i.focus(); if (window.ophGrow) ophGrow(i); } };
  // S103A.2 · A1/A2/A3: textarea auto-grow + teclado (Enter envía · Shift+Enter línea · Ctrl/Cmd+Enter envía) + ampliar.
  window.ophGrow = function (el) { if (!el) return; var big = el.classList.contains('oph-input-big'), minH = big ? 120 : 72, maxH = big ? 340 : 180; el.style.height = 'auto'; el.style.height = Math.max(minH, Math.min(el.scrollHeight, maxH)) + 'px'; }; // S103A.3: arranca grande (3-4 líneas), scroll recién pasado el máximo
  window.ophKey = function (e, opId) { if (e.key !== 'Enter' || e.isComposing) return; if (e.shiftKey && !(e.ctrlKey || e.metaKey)) return; e.preventDefault(); opHermesAsk(opId); };
  window.ophToggleBig = function () { var t = document.getElementById('op-hermes-input'); if (!t) return; t.classList.toggle('oph-input-big'); ophGrow(t); t.focus(); };
  window.opHermesLoading = function (on) { var s = document.getElementById('oph-status'); if (s) s.innerHTML = on ? '<span style="font-size:.7rem;color:#5ec8d8;">🪽 Hermes pensando…</span>' : ''; var b = document.getElementById('op-hermes-send'); if (b) b.disabled = !!on; };
  // S102B.2: copiar un mensaje sugerido al portapapeles (no escribe ni envía nada).
  window.opHermesCopy = function (i) { var t = (window.opHermesMsgs || [])[i]; if (t == null) return; if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(function () { toast('Mensaje copiado', 'ok'); }, function () { toast('No pude copiar', 'err'); }); } else toast('Clipboard no disponible', 'err'); };
  // S103A: render de las "message parts" de UNA respuesta de Hermes (entendido + 4 categorías + faltantes/pasos/mensajes/warnings).
  // interactive=true (última burbuja) → propuestas con ✓ Aplicar (idx en window.opHermesCampos) + Copiar; false (histórico) → estático.
  window.ophRenderParts = function (r, interactive) {
    var lbl = function (t) { return '<div style="font-size:.58rem;color:var(--gold);text-transform:uppercase;letter-spacing:.06em;margin:8px 0 3px;">' + t + '</div>'; };
    var out = '<div style="font-size:.78rem;">' + (r.entendido ? escHtml(r.entendido) : '<span style="opacity:.7;font-style:italic;">Sin interpretación.</span>') + '</div>';
    var cd = r.camposDetectados || [];
    var coincide = cd.filter(function (c) { return c.accion === 'sin_cambio'; });
    var confirmar = cd.filter(function (c) { return c.accion !== 'sin_cambio'; });
    var W = r.warnings || [], rePers = /relaci|contacto|vincul|propietari|comprador|vendedor|persona/i, reFisc = /sello|\bvir\b|fiscal|valuaci|escrituraci|exenci|exento/i;
    var persW = [], fiscW = [], genW = [];
    W.forEach(function (w, i) { if (i === 0) { genW.push(w); return; } if (rePers.test(w)) persW.push(w); else if (reFisc.test(w)) fiscW.push(w); else genW.push(w); });
    var grupo = function (titulo, inner) { return '<div style="margin-bottom:6px;"><div style="font-size:.58rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px;">' + titulo + '</div>' + inner + '</div>'; };
    // S103A.1 · A3: detectar "ya aplicado" → valor propuesto == valor actual de la operación (normalizado; fechas a 10)
    var opCur = window.opF360 || {};
    var norm = function (v) { if (v == null) return ''; v = String(v).trim(); var m = v.match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : v.toLowerCase(); };
    var yaAplic = function (c) { var cur = norm(opCur[c.campo]); return cur !== '' && cur === norm(c.valorPropuesto); };
    // S103A.1 · A1 1-click + S103A.2 · D7 (sin Nota/Tarea muertos) · C6 (🗑 Vaciar en clearables)
    var btnsConfirmar = function (idx, clearable) { return '<div id="oph-apply-' + idx + '" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px;">' +
      '<button class="btn btn-gold btn-xs" onclick="opHermesAplicarCampoGo(' + idx + ')" title="Aplica directo a la operación (el botón es la confirmación)">✓ Aplicar campo</button>' +
      (clearable ? '<button class="btn btn-ghost btn-xs" onclick="ophVaciarCampo(' + idx + ')" title="Dejar este campo vacío en la operación">🗑 Vaciar</button>' : '') + '</div>'; };
    var clearableOp = window.CLEARABLE_OP || [];
    var cardCampo = function (c, idx, applied) {
      var conf = Math.round((c.confianza || 0) * 100), lowConf = (c.confianza || 0) < 0.5;
      var av = (c.valorActual != null && c.valorActual !== '') ? escHtml(String(c.valorActual)) : '—';
      var aplicable = (typeof idx === 'number'), label = opLabelOf(c.campo, c.label); // D8: bloqueo→"Pendiente / condición"
      var h = '<div style="border:1px solid ' + (applied ? 'rgba(74,222,128,.45)' : 'var(--border)') + ';border-radius:8px;padding:6px 8px;margin-bottom:5px;font-size:.74rem;">' +
        '<div style="display:flex;justify-content:space-between;gap:6px;align-items:center;"><b>' + escHtml(label) + '</b><span style="font-size:.58rem;color:' + (applied ? 'var(--ok)' : (lowConf && aplicable ? 'var(--warn)' : 'var(--muted)')) + ';">' + (applied ? '✅ aplicado' : ('conf ' + conf + '%' + (lowConf && aplicable ? ' ⚠' : ''))) + '</span></div>';
      if (applied) {
        h += '<div style="font-size:.7rem;margin:2px 0;color:var(--muted);">ahora: <span style="color:var(--ok);font-weight:600;">' + escHtml(String(c.valorPropuesto)) + '</span></div>' +
          '<button class="btn btn-ghost btn-xs" disabled style="opacity:.5;cursor:not-allowed;">✓ Ya aplicado</button>';
      } else if (aplicable) {
        // A2: valor EDITABLE antes de aplicar (resuelve nombres mal transcriptos · y permite vaciar)
        h += '<div style="font-size:.66rem;color:var(--muted);margin:2px 0;">actual: ' + av + '</div>' +
          '<div style="display:flex;gap:5px;align-items:center;margin:3px 0;"><span style="font-size:.66rem;color:var(--muted);">→</span><input id="oph-val-' + idx + '" value="' + escHtml(String(c.valorPropuesto)) + '" title="Corregí o vaciá el valor antes de aplicar" style="flex:1;min-width:0;padding:4px 7px;font-size:.74rem;background:var(--panel);color:var(--gold);font-weight:600;border:1px solid var(--border);border-radius:7px;"></div>';
        // D8: si es "bloqueo" pero parece un pendiente/condición → nudge para aplicarlo como Próximo paso
        if (c.campo === 'bloqueo' && /falta|pendiente|c[oó]nyuge|conyug|consentimiento|\bdni\b|datos|informaci|requisito|firma/i.test(String(c.valorPropuesto))) {
          h += '<div style="font-size:.62rem;color:var(--warn);margin:1px 0 3px;">⚠ Parece un pendiente/condición, no una traba dura. <button class="btn btn-ghost btn-xs" onclick="ophBloqueoAProx(' + idx + ')" title="Aplicar como Próximo paso">→ Mejor como próximo paso</button></div>';
        }
        h += btnsConfirmar(idx, clearableOp.indexOf(c.campo) >= 0);
      } else {
        h += '<div style="color:var(--muted);font-size:.7rem;margin:2px 0;">' + av + ' → <span style="font-weight:600;">' + escHtml(String(c.valorPropuesto)) + '</span></div>';
      }
      return h + '</div>';
    };
    var noteCard = function (w, btn) { return '<div style="border:1px solid var(--border);border-radius:8px;padding:6px 8px;margin-bottom:5px;font-size:.73rem;color:var(--muted);">' + escHtml(w) + (btn ? '<div style="margin-top:5px;"><button class="btn btn-ghost btn-xs" disabled style="opacity:.45;cursor:not-allowed;" title="Próximamente">' + escHtml(btn) + '</button></div>' : '') + '</div>'; };
    // ── A4 · ARRIBA (siempre): cambios aplicables + próximo paso + warning crítico ──
    if (confirmar.length) out += lbl('Cambios propuestos') + confirmar.map(function (c, idx) { return cardCampo(c, interactive ? idx : undefined, interactive && yaAplic(c)); }).join('');
    var prox = r.proximosPasos || [];
    if (prox.length) {
      var opId = opCur.id || '';
      out += lbl('Próximo paso') + prox.map(function (p, i) {
        return '<div style="font-size:.74rem;border:1px solid rgba(94,200,216,.25);border-radius:8px;padding:5px 8px;margin-bottom:4px;">' + escHtml(p) +
          (interactive ? '<div style="margin-top:4px;"><button id="oph-prox-' + i + '" class="btn btn-ghost btn-xs" onclick="opHermesAplicarProx(\'' + opId + '\',' + i + ')" title="Aplica este texto al campo Próximo paso (1 click)">✓ Aplicar como próximo paso</button></div>' : '') +
          '</div>';
      }).join('');
    }
    if (genW.length) out += '<div style="font-size:.66rem;color:var(--warn);margin-top:5px;">⚠ ' + escHtml(genW[0]) + '</div>';
    // ── A6 · latencia (audio/texto) ──
    if (r.__lat) {
      var L = r.__lat, lp = [];
      if (L.record != null) lp.push('🎤 ' + (L.record / 1000).toFixed(1) + 's');
      if (L.encode != null) lp.push('📦 ' + (L.encode / 1000).toFixed(1) + 's');
      if (L.server != null) lp.push('☁️ ' + (L.server / 1000).toFixed(1) + 's');
      if (lp.length) out += '<div style="font-size:.56rem;color:var(--muted);opacity:.7;margin-top:5px;text-align:right;">⏱ ' + lp.join(' · ') + '</div>';
    }
    // ── A4 · ABAJO (colapsado): coincide + no-aplicables + fiscal + docs faltantes + mensajes + warnings 2° ──
    var down = '', ndown = 0;
    if (coincide.length) { down += grupo('🟢 Ya coincide con la operación', coincide.map(function (c) { return cardCampo(c); }).join('')); ndown += coincide.length; }
    if (persW.length) { down += grupo('👤 No aplicable directo — vincular a mano', persW.map(function (w) { return noteCard(w, 'Vincular contacto'); }).join('')); ndown += persW.length; }
    if (fiscW.length) { down += grupo('🧾 Fiscal / legal pendiente <span style="text-transform:none;letter-spacing:0;opacity:.8;">(info para escribanía/gestor)</span>', fiscW.map(function (w) { return noteCard(w, null); }).join('')); ndown += fiscW.length; }
    if ((r.documentosFaltantes || []).length) { down += lbl('Documentos faltantes') + '<ul style="margin:0;padding-left:16px;font-size:.74rem;color:var(--muted);">' + r.documentosFaltantes.map(function (f) { return '<li>' + escHtml(f) + '</li>'; }).join('') + '</ul>'; ndown += r.documentosFaltantes.length; }
    if ((r.mensajesSugeridos || []).length) { down += lbl('Mensajes sugeridos') + r.mensajesSugeridos.map(function (m, i) { return '<div style="font-size:.73rem;border:1px solid var(--border);border-radius:8px;padding:5px 8px;margin-bottom:5px;color:var(--muted);">' + escHtml(m) + (interactive ? '<div style="margin-top:4px;"><button class="btn btn-ghost btn-xs" onclick="opHermesCopy(' + i + ')" title="Copiar (no envía nada)">📋 Copiar</button></div>' : '') + '</div>'; }).join(''); ndown += r.mensajesSugeridos.length; }
    if (genW.length > 1) { down += genW.slice(1).map(function (w) { return '<div style="font-size:.66rem;color:var(--warn);margin-top:3px;">⚠ ' + escHtml(w) + '</div>'; }).join(''); ndown += genW.length - 1; }
    if (down) out += '<details style="margin-top:8px;"><summary style="cursor:pointer;font-size:.66rem;color:var(--muted);user-select:none;list-style:none;">▸ Ver detalle' + (ndown ? ' (' + ndown + ')' : '') + ' — docs faltantes, mensajes, fiscal…</summary><div style="margin-top:6px;">' + down + '</div></details>';
    return out;
  };
  window.ophBubble = function (role, html) {
    if (role === 'hermes') return '<div class="oph-b oph-b-hermes"><div style="display:flex;gap:7px;"><img src="/images/hermes-avatar.webp" alt="" style="width:22px;height:22px;border-radius:50%;flex-shrink:0;object-fit:cover;border:1px solid rgba(94,200,216,.5);" onerror="this.outerHTML=\'<span style=&quot;font-size:1rem;&quot;>🪽</span>\'"><div style="flex:1;min-width:0;">' + html + '</div></div></div>';
    if (role === 'franco') return '<div class="oph-b oph-b-franco">' + html + '</div>';
    if (role === 'system') return '<div class="oph-b oph-b-system">' + html + '</div>';
    if (role === 'thinking') return '<div class="oph-b oph-b-thinking">' + html + '</div>';
    return '';
  };
  window.opHermesChat = window.opHermesChat || {};
  window.ophPush = function (opId, turn) { if (!window.opHermesChat[opId]) window.opHermesChat[opId] = []; window.opHermesChat[opId].push(turn); };
  window.ophPopThinking = function (opId) { var a = window.opHermesChat[opId] || []; if (a.length && a[a.length - 1].role === 'thinking') a.pop(); };
  window.renderHermesThread = function (opId) {
    var turns = (window.opHermesChat || {})[opId] || [];
    var lastH = -1; turns.forEach(function (t, i) { if (t.role === 'hermes') lastH = i; });
    var lr = (lastH >= 0 && turns[lastH].r) ? turns[lastH].r : null;
    window.opHermesCampos = lr ? (lr.camposDetectados || []).filter(function (c) { return c.accion !== 'sin_cambio'; }) : [];
    window.opHermesMsgs = lr ? (lr.mensajesSugeridos || []) : [];
    window.opHermesProx = lr ? (lr.proximosPasos || []) : []; // S103A.1 · A5: próximos pasos aplicables por índice
    if (!turns.length) return '<div style="font-size:.74rem;color:var(--muted);font-style:italic;opacity:.85;padding:8px 4px;">🪽 Contale o dictá a Hermes qué cambió en la operación. Él propone; vos aprobás campo por campo. Nada se aplica solo.</div>';
    return turns.map(function (t, i) {
      if (t.role === 'franco') return ophBubble('franco', escHtml(t.text));
      if (t.role === 'thinking') return ophBubble('thinking', escHtml(t.text || '🪽 Hermes pensando…'));
      if (t.role === 'system') {
        var ex = '';
        if (t.undo && !t.undo.done) ex = ' <button class="btn btn-ghost btn-xs" onclick="ophUndoTurn(\'' + opId + '\',' + i + ')" title="Volver al valor anterior">↩ Deshacer</button>';
        else if (t.undo && t.undo.done) ex = ' <span style="opacity:.5;font-size:.62rem;">↩ revertido</span>';
        return ophBubble('system', '<span style="color:var(--' + (t.color || 'muted') + ');">' + (t.icon || '') + ' ' + escHtml(t.text) + '</span>' + ex);
      }
      if (t.role === 'hermes') return ophBubble('hermes', ophRenderParts(t.r, i === lastH));
      return '';
    }).join('');
  };
  window.ophRenderLog = function (opId) { var el = document.getElementById('oph-log'); if (el) { el.innerHTML = renderHermesThread(opId); el.scrollTop = el.scrollHeight; } };
  // S102C: Aplicar campo por campo (SOLO whitelist + requiere_confirmar + confirmación explícita). Reusa /operacion/actualizar. Nunca auto-write, nunca lote.
  window.CAMPOS_APLICABLES_OP = ['reserva', 'refuerzo', 'montoTotal', 'instrumento', 'fechaReserva', 'fechaPosesion', 'fechaFirma', 'pagadorReserva', 'escribania', 'proveedorSellado', 'bloqueo', 'proximoPaso'];
  // S103A.2 · C6: campos de TEXTO/select que el endpoint YA limpia con "" (las FECHAS no → bridge, preview). Numéricos NUNCA se vacían acá.
  window.CLEARABLE_OP = ['escribania', 'proveedorSellado', 'proximoPaso', 'bloqueo', 'pagadorReserva', 'instrumento'];
  // S103A.2 · D8: el campo `bloqueo` se muestra como "Pendiente / condición" (no todo es traba dura).
  window.opLabelOf = function (campo, fallback) { return campo === 'bloqueo' ? 'Pendiente / condición' : (fallback || campo); };
  // S103A.2 · B5: helper único de aplicación → POST /actualizar + burbuja con valor anterior (undo) + refresca. val==='' limpia.
  window.ophApplyField = async function (opId, campo, val, label, prev, note) {
    try {
      var body = { id: opId }; body[campo] = val;
      var r = await apiFetch('/crm/operacion/actualizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r && r.ok) {
        var vacio = (val == null || val === '');
        var txt = (vacio ? 'Vacié ' + label : 'Apliqué ' + label + ' = ' + val) + (note ? ' ' + note : '');
        ophPush(opId, { role: 'system', icon: '✅', text: txt, color: 'ok', undo: { campo: campo, prev: (prev != null ? String(prev) : ''), label: label } });
        toast('✅ ' + label + (vacio ? ' vaciado' : ' aplicado'), 'ok');
        window.crmOpsCache = null; window.opF360Ficha = null;
        setTimeout(function () { abrirFicha360(opId); }, 900);
        return true;
      } else { toast('No se aplicó: ' + ((r && r.error) || 'sin respuesta'), 'err'); return false; }
    } catch (e) { toast('No se aplicó: sin conexión', 'err'); return false; }
  };
  // S103A.2 · B5: revertir un cambio desde su burbuja (vuelve al valor anterior guardado en el turno).
  window.ophUndoTurn = async function (opId, i) {
    var turns = (window.opHermesChat || {})[opId] || [], t = turns[i];
    if (!t || !t.undo || t.undo.done) return;
    var u = t.undo;
    try {
      var body = { id: opId }; body[u.campo] = (u.prev != null ? u.prev : '');
      var r = await apiFetch('/crm/operacion/actualizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r && r.ok) {
        u.done = true;
        ophPush(opId, { role: 'system', icon: '↩', text: 'Revertí ' + u.label + ' a ' + (u.prev != null && u.prev !== '' ? u.prev : 'vacío'), color: 'muted' });
        window.crmOpsCache = null; window.opF360Ficha = null;
        toast('↩ Revertido', 'ok');
        setTimeout(function () { abrirFicha360(opId); }, 900);
      } else toast('No pude revertir: ' + ((r && r.error) || 'sin respuesta'), 'err');
    } catch (e) { toast('No pude revertir: sin conexión', 'err'); }
  };
  window.opHermesAplicarCampoReset = function (idx) { var box = document.getElementById('oph-apply-' + idx); if (!box) return; box.innerHTML = '<button class="btn btn-gold btn-xs" onclick="opHermesAplicarCampoGo(' + idx + ')" title="Aplica directo (el botón es la confirmación)">✓ Aplicar campo</button>'; };
  // S103A.1 · A1: el confirm intermedio se elimina del camino — opHermesAplicarCampo queda como alias directo a Go (compat).
  window.opHermesAplicarCampo = function (idx) { return opHermesAplicarCampoGo(idx); };
  window.opHermesAplicarCampoGo = async function (idx) {
    var c = (window.opHermesCampos || [])[idx], op = window.opF360;
    if (!c || !op) return;
    if (window.CAMPOS_APLICABLES_OP.indexOf(c.campo) < 0) return toast('Campo no aplicable directo', 'err');
    var input = document.getElementById('oph-val-' + idx);
    var val = input ? String(input.value).trim() : (c.valorPropuesto != null ? String(c.valorPropuesto) : ''); // A2: aplica el valor EDITADO
    if (val === '' && window.CLEARABLE_OP.indexOf(c.campo) < 0) return toast('Ese campo no se puede dejar vacío acá', 'err'); // C6: solo texto/select se vacían
    var label = opLabelOf(c.campo, c.label);
    var prev = (op[c.campo] != null) ? op[c.campo] : '';
    var box = document.getElementById('oph-apply-' + idx); if (box) box.innerHTML = '<span style="font-size:.7rem;color:#5ec8d8;">Aplicando…</span>';
    var okk = await ophApplyField(op.id, c.campo, val, label, prev, null);
    if (okk) { c.valorPropuesto = val; if (box) box.innerHTML = '<span style="font-size:.72rem;color:var(--ok);font-weight:600;">✅ ' + escHtml(label) + (val === '' ? ' vaciado' : ' aplicado') + '</span>'; }
    else opHermesAplicarCampoReset(idx);
  };
  // S103A.2 · C6: vaciar un campo de texto (limpia el input y aplica vacío).
  window.ophVaciarCampo = function (idx) { var inp = document.getElementById('oph-val-' + idx); if (inp) inp.value = ''; opHermesAplicarCampoGo(idx); };
  // S103A.2 · D8: aplicar el texto propuesto como Próximo paso en vez de Bloqueo (cuando parece un pendiente).
  window.ophBloqueoAProx = async function (idx) {
    var c = (window.opHermesCampos || [])[idx], op = window.opF360; if (!c || !op) return;
    var inp = document.getElementById('oph-val-' + idx), val = inp ? String(inp.value).trim() : String(c.valorPropuesto || '');
    if (!val) return toast('Vacío', 'err');
    var box = document.getElementById('oph-apply-' + idx); if (box) box.innerHTML = '<span style="font-size:.7rem;color:#5ec8d8;">Aplicando…</span>';
    var okk = await ophApplyField(op.id, 'proximoPaso', val, 'Próximo paso', (op.proximoPaso != null ? op.proximoPaso : ''), '(en vez de bloqueo)');
    if (!okk) opHermesAplicarCampoReset(idx);
  };
  // S103A.1 · A5: aplicar un próximo paso sugerido al campo "Próximo paso" (1 click, whitelist proximoPaso).
  window.opHermesAplicarProx = async function (opId, i) {
    var txt = (window.opHermesProx || [])[i], op = window.opF360;
    if (txt == null || String(txt).trim() === '' || !op) return;
    if (!opId) opId = op.id;
    var btn = document.getElementById('oph-prox-' + i); if (btn) { btn.disabled = true; btn.textContent = 'Aplicando…'; }
    var okk = await ophApplyField(opId, 'proximoPaso', String(txt), 'Próximo paso', (op.proximoPaso != null ? op.proximoPaso : ''), null);
    if (!okk && btn) { btn.disabled = false; btn.textContent = '✓ Aplicar como próximo paso'; }
  };
  window.opHermesAsk = async function (opId, msgOverride) {
    var inp = document.getElementById('op-hermes-input');
    var msg = (typeof msgOverride === 'string') ? msgOverride : (inp ? inp.value.trim() : '');
    if (!msg) return toast('Escribile algo a Hermes', 'err');
    if (inp) { inp.value = ''; inp.classList.remove('oph-input-big'); if (window.ophGrow) ophGrow(inp); }
    var sb = document.getElementById('op-hermes-send'); if (sb) sb.disabled = true;
    ophPush(opId, { role: 'franco', text: msg });
    ophPush(opId, { role: 'thinking', text: '🪽 Hermes pensando…' });
    ophRenderLog(opId);
    var t0 = performance.now(); // A6
    try {
      var r = await apiFetch('/crm/operacion/' + opId + '/hermes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mensaje: msg }) });
      ophPopThinking(opId);
      if (r && r.ok) { r.__lat = { server: Math.round(performance.now() - t0) }; console.log('[Hermes texto] servidor', r.__lat.server + 'ms'); ophPush(opId, { role: 'hermes', r: r }); }
      else ophPush(opId, { role: 'system', icon: '✗', text: 'Hermes: ' + ((r && r.error) || 'sin respuesta'), color: 'danger' });
    } catch (e) { ophPopThinking(opId); ophPush(opId, { role: 'system', icon: '✗', text: 'Hermes: sin conexión', color: 'danger' }); }
    if (sb) sb.disabled = false;
    ophRenderLog(opId);
  };
  window.opHermesCancelAudio = function () { if (window.cancelarAudioRec) window.cancelarAudioRec(); var st = document.getElementById('oph-status'); if (st) st.innerHTML = ''; };
  window.opHermesAudio = function (opId) {
    grabarAudioYProcesar(document.getElementById('op-hermes-mic'), async function (b64) {
      var tB64 = performance.now(); // A6: audio codificado y listo
      var rec0 = window.__ophRecStart || 0, rec1 = window.__ophRecStop || 0;
      var lat = { record: (rec0 && rec1) ? Math.round(rec1 - rec0) : null, encode: rec1 ? Math.round(tB64 - rec1) : null, server: null };
      var st = document.getElementById('oph-status'); if (st) st.innerHTML = '';
      ophPush(opId, { role: 'thinking', text: '🧠 Transcribiendo…' });
      ophRenderLog(opId);
      var t0 = performance.now();
      try {
        var r = await apiFetch('/crm/operacion/' + opId + '/hermes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: b64 }) });
        ophPopThinking(opId);
        if (r && r.ok) {
          lat.server = Math.round(performance.now() - t0); r.__lat = lat; // subida + Whisper + Hermes (fusionados server-side)
          console.log('[Hermes audio]', { grabacion_ms: lat.record, encoding_ms: lat.encode, servidor_ms: lat.server, total_ms: (lat.record || 0) + (lat.encode || 0) + lat.server });
          if (r.transcripcion) ophPush(opId, { role: 'franco', text: r.transcripcion });
          ophPush(opId, { role: 'hermes', r: r });
        } else ophPush(opId, { role: 'system', icon: '✗', text: 'Hermes audio: ' + ((r && r.error) || 'error'), color: 'danger' });
      } catch (e) { ophPopThinking(opId); ophPush(opId, { role: 'system', icon: '✗', text: 'Hermes audio: sin conexión', color: 'danger' }); }
      ophRenderLog(opId);
    }, function () { window.__ophRecStart = performance.now(); var st = document.getElementById('oph-status'); if (st) st.innerHTML = '<span style="color:var(--danger);font-size:.72rem;font-weight:600;">🎤 Grabando…</span> <span style="font-size:.64rem;color:var(--muted);">tocá ⏹ para enviar</span> <button class="btn btn-ghost btn-xs" onclick="opHermesCancelAudio()" style="margin-left:6px;">✕ Cancelar</button>'; });
  };
  function renderFicha360() {
    var op = window.opF360; if (!op) return;
    var d = window.crmOpsCache || {};
    var fx = window.opF360Ficha || {};                       // S97 Paso 1.5: read-model real (partes/documentos/track)
    var partesOk = !!(fx && fx.ok), partes = fx.partes || {};
    var fdocs = partesOk ? (fx.documentos || []) : null;     // null = endpoint no disponible → fallback visual
    var ftrack = partesOk ? (fx.track || []) : null;         // null = endpoint no disponible → fallback derivado
    var precio = op.montoTotal, comPct = (op.honorariosEsperados && op.montoTotal) ? Math.round(op.honorariosEsperados / op.montoTotal * 1000) / 10 : null;
    var honCalc = op.honorariosEsperados != null ? op.honorariosEsperados : (precio && comPct ? Math.round(precio * comPct / 100) : null);
    var honCob = op.honorariosCobrados || 0, honPend = (op.honorariosEsperados || 0) - honCob;
    var idx = opFlujoIndex(op.etapa), bloq = !!op.bloqueo;
    var propNom = op.propiedadId ? ((((window.crmPipelineCache || {}).propiedades || {}).items || []).filter(function (pp) { return pp.id === op.propiedadId; })[0] || {}).propiedad : null; // S100C: nombre real de la propiedad
    function row(l, v) { return '<div style="display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:.8rem;"><span style="color:var(--muted);">' + l + '</span><span style="text-align:right;font-weight:600;">' + (v != null && v !== '' ? v : f360Ph()) + '</span></div>'; }
    var left =
      '<div class="f360-card" id="f360-resumen"><div class="f360-t">📋 Resumen</div>' +
        row('Propiedad', op.propiedadId ? (escHtml(propNom || 'vinculada') + ' <button class="btn btn-ghost btn-xs" style="padding:1px 7px;font-size:.6rem;" onclick="abrirLegajo(\'' + op.propiedadId + '\')">Abrir propiedad</button>' + (partes.vendedor ? ' · ' + escHtml(partes.vendedor.nombre) : '')) : f360Falta('Propiedad no vinculada')) +
        row('Tipo', op.tipo) + row('Etapa', op.etapa) + row('Instrumento', op.instrumento || f360Ph('pendiente')) +
        row('Precio de cierre', f360Usd(precio)) + row('Reserva', f360Usd(op.reserva)) + row('Refuerzo', f360Usd(op.refuerzo)) +
        row('Comisión', comPct != null ? comPct + '% <span style="color:var(--muted);font-weight:400;">(derivada)</span>' : null) +
      '</div>' +
      '<div class="f360-card" id="f360-partes"><div class="f360-t">👥 Partes</div>' +
        row('Vendedor / propietario', partesOk ? f360Parte(partes.vendedor, op.propiedadId ? 'Propiedad sin propietario vinculado' : 'Se deriva de la propiedad — no vinculada') : f360Ph()) +
        row('Comprador', partesOk ? f360Parte(partes.comprador, 'Comprador no vinculado') : f360Ph()) +
        row('Pagador de la reserva', op.pagadorReserva ? escHtml(op.pagadorReserva) : f360Ph('pendiente')) +
        row('Escribanía', op.escribania ? escHtml(op.escribania) : (f360Ph('pendiente') + ' <button class="btn btn-ghost btn-xs" style="padding:1px 6px;font-size:.6rem;" onclick="abrirOperacion(\'' + op.id + '\')">Cargar</button>')) + row('Proveedor sellado / informes', op.proveedorSellado ? escHtml(op.proveedorSellado) : f360Ph('ej. Bolsa de Comercio')) +
      '</div>' +
      '<div class="f360-card" id="f360-fechas"><div class="f360-t">📅 Fechas</div>' +
        row('Fecha de reserva', op.fechaReserva ? String(op.fechaReserva).slice(0, 10) : f360Ph('pendiente')) + row('Fecha firma (cargada)', op.fechaFirma) +
        row('Fecha estimada de firma', f360Ph()) + row('Fecha de posesión', op.fechaPosesion ? String(op.fechaPosesion).slice(0, 10) : (f360Ph('pendiente') + ' <button class="btn btn-ghost btn-xs" style="padding:1px 6px;font-size:.6rem;" onclick="abrirOperacion(\'' + op.id + '\')">Cargar</button>')) +
      '</div>' +
      '<div class="f360-card" id="f360-honorarios"><div class="f360-t">💰 Honorarios</div>' +
        (precio && comPct ? '<div style="font-size:.74rem;color:var(--muted);margin-bottom:6px;">' + f360Usd(precio) + ' × ' + comPct + '% = <b style="color:var(--gold);">' + f360Usd(honCalc) + '</b> <span style="opacity:.7;">(cálculo visual)</span></div>' : '') +
        row('Esperados', f360Usd(honCalc)) + row('Cobrados', f360Usd(honCob)) +
        row('Pendientes', honPend > 0 ? '<span style="color:var(--warn);">' + f360Usd(honPend) + '</span>' : f360Usd(0)) +
      '</div>';
    var pasos = OP_FLUJO.map(function (p, i) {
      var estado = i < idx ? 'completado' : (i === idx ? (bloq ? 'bloqueado' : 'en curso') : 'pendiente');
      var ic = estado === 'completado' ? '✅' : estado === 'en curso' ? '🔵' : estado === 'bloqueado' ? '🔴' : '⚪';
      var col = estado === 'completado' ? 'var(--ok)' : estado === 'en curso' ? 'var(--gold)' : estado === 'bloqueado' ? 'var(--danger)' : 'var(--muted)';
      return '<div style="display:flex;gap:10px;align-items:flex-start;padding:7px 0 7px 14px;margin-left:8px;border-left:2px solid rgba(255,255,255,.08);">' +
        '<span style="margin-left:-25px;">' + ic + '</span>' +
        '<div><div style="font-size:.82rem;font-weight:' + (i === idx ? '700' : '500') + ';color:' + col + ';">' + escHtml(p.label) + '</div>' +
        (i === idx ? '<div style="font-size:.68rem;color:var(--muted);">etapa actual' + (bloq ? ' · 🔴 trabada' : '') + '</div>' : '') + '</div></div>';
    }).join('');
    var center = '<div class="f360-card" id="f360-flujo"><div class="f360-t">🔄 Flujo operativo</div>' + pasos +
      '<div style="font-size:.66rem;color:var(--muted);margin-top:8px;border-top:1px dashed var(--border);padding-top:6px;">Derivado de la etapa. Para cambiarla usá ✏️ Edición rápida.</div></div>';
    var tipo = op.tipo, tpl = tipo ? ((d.checklists || {})[tipo] || []) : [];
    var faltan = tpl.filter(function (i) { return !(op.checklist || {})[i.k]; }).slice(0, 4).map(function (i) { return i.label; });
    var prox = op.proximoPaso || 'enviar documentación a escribanía y definir si se avanza con refuerzo o directo a cesión con entrega de posesión, + coordinar el cálculo de sellado con el proveedor';
    var msgs = ['💬 Comprador — "Avanzamos con la cesión, ¿coordinamos la firma?"', '💬 Escribana — "Te paso la documentación para el estudio de títulos y el cálculo de sellado."'];
    // S102B: rail Hermes Operativo FUNCIONAL preview-only. Derivados reales como estado inicial; al preguntar, el endpoint llena las secciones por id (sin escribir nada).
    var hSec = function (id, titulo, contenido, vacio) { return '<div style="margin-bottom:11px;"><div style="font-size:.6rem;color:var(--gold);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">' + titulo + '</div><div id="' + id + '">' + (contenido ? contenido : '<div style="font-size:.72rem;color:var(--muted);font-style:italic;opacity:.7;">' + escHtml(vacio || 'pendiente') + '</div>') + '</div></div>'; };
    var hChips = ['El comprador final será …', 'La escribanía es …', 'Está exento de sellos', 'Hay que averiguar VIR', 'Subí la reserva firmada', 'Falta informe de dominio'];
    var hFaltan = faltan.length ? '<ul style="margin:0;padding-left:16px;font-size:.74rem;color:var(--muted);">' + faltan.map(function (f) { return '<li>' + escHtml(f) + '</li>'; }).join('') + '</ul>' : '<div style="font-size:.72rem;color:var(--ok);">Sin faltantes del checklist.</div>';
    var hProx = '<div style="font-size:.76rem;border:1px solid rgba(94,200,216,.3);border-radius:8px;padding:7px 9px;background:rgba(94,200,216,.05);">' + escHtml(prox) + '</div>' + (bloq ? '<div style="font-size:.74rem;color:var(--danger);margin-top:6px;">🔴 Bloqueo: ' + escHtml(op.bloqueo) + '</div>' : '');
    window.opHermesMsgs = msgs;
    var hMsgs = msgs.map(function (m, i) { return '<div style="font-size:.73rem;border:1px solid var(--border);border-radius:8px;padding:5px 8px;margin-bottom:5px;color:var(--muted);">' + escHtml(m) + '<div style="margin-top:4px;"><button class="btn btn-ghost btn-xs" onclick="opHermesCopy(' + i + ')" title="Copiar (no envía nada)">📋 Copiar</button></div></div>'; }).join('');
    // S103A.3: "Anotaciones de Hermes" — memoria visible, TODO derivado de /ficha (cero backend/LLM). Sin dato → pendiente.
    var anotaciones = (function () {
      var tipoOpA = /alquiler/i.test(op.tipo || '') ? 'Alquiler' : 'Venta';
      var presA = (Array.isArray(fdocs) ? fdocs : []).map(function (x) { return (x.tipo || '').toLowerCase(); }).filter(Boolean);
      var tiene = []; if (op.reserva) tiene.push('reserva');
      presA.forEach(function (t) { if (tiene.indexOf(t) < 0) tiene.push(t); });
      var faltaDocs = (OP_DOCS_ESPERADOS[tipoOpA] || []).filter(function (t) { var k = t.toLowerCase().slice(0, 5); return !presA.some(function (p) { return p && (p.indexOf(k) >= 0 || t.toLowerCase().indexOf(p.slice(0, 5)) >= 0); }); });
      var falta = [];
      if (!(partes && partes.comprador)) falta.push('comprador vinculado');
      if (!op.propiedadId) falta.push('propiedad vinculada');
      faltaDocs.slice(0, 2).forEach(function (t) { falta.push(t.toLowerCase()); });
      faltan.slice(0, 1).forEach(function (f) { falta.push(String(f).toLowerCase()); });
      var proxTxt = op.proximoPaso ? (op.proximoPaso.length > 72 ? op.proximoPaso.slice(0, 72) + '…' : op.proximoPaso) : 'pendiente';
      var rows = [
        ['📍 Estado', escHtml(op.etapa || 'pendiente') + ' <span style="opacity:.6;">· paso ' + (idx + 1) + '/' + OP_FLUJO.length + (bloq ? ' · 🔴 trabada' : '') + '</span>'],
        ['📂 Tiene', tiene.length ? escHtml(tiene.slice(0, 4).join(' + ')) : '<span style="opacity:.6;">pendiente</span>'],
        ['⚠️ Falta', falta.length ? escHtml(falta.slice(0, 2).join(' · ')) : '<span style="color:var(--ok);">nada crítico</span>'],
        ['➡️ Siguiente', escHtml(proxTxt)],
        ['🛡️ Riesgo', bloq ? escHtml(op.bloqueo) : '<span style="opacity:.85;">revisar sellos/VIR con escribanía</span>']
      ];
      return '<div class="oph-anot"><div class="oph-anot-t">📝 Anotaciones de Hermes <span style="opacity:.55;font-weight:400;text-transform:none;letter-spacing:0;">· memoria viva de la ficha</span></div>' +
        rows.map(function (r2) { return '<div class="oph-anot-row"><span class="oph-anot-k">' + r2[0] + '</span><span class="oph-anot-v">' + r2[1] + '</span></div>'; }).join('') + '</div>';
    })();
    // S103A: rail Hermes = CHAT operativo. head + anotaciones + banner slim (fijos) → #oph-log (thread scrollable) → composer sticky abajo.
    var right = '<div class="f360-card" id="f360-hermes" ondragover="ophDragOver(event)" ondragleave="ophDragLeave(event)" ondrop="ophDrop(event,\'' + op.id + '\')" style="border-color:rgba(94,200,216,.4);background:linear-gradient(180deg,rgba(94,200,216,.07),rgba(94,200,216,.02));">' +
      '<div class="oph-head">' +
        '<img class="oph-avatar" src="/images/hermes-avatar.webp" alt="Hermes" onerror="this.outerHTML=\'<div style=&quot;font-size:3rem;line-height:1;&quot;>🪽</div>\'">' +
        '<div class="oph-name">Hermes Operativo</div>' +
        '<div style="margin-top:4px;"><span class="badge badge-muted" style="font-size:.58rem;">Shadow · Preview only</span></div>' +
      '</div>' +
      anotaciones +
      '<div class="oph-safe">🛡 Hermes <b>propone</b>, vos aprobás campo por campo. Nada se aplica solo.</div>' +
      '<div id="oph-log" class="oph-log">' + renderHermesThread(op.id) + '</div>' +
      '<div class="oph-compose">' +
        '<div id="oph-drop"></div>' + // S103A.1 · B: zona donde se stagea el archivo arrastrado (chip + botón explícito)
        '<div style="display:flex;gap:6px;align-items:flex-end;">' +
          '<button id="op-hermes-plus" class="btn btn-ghost btn-sm" onclick="opSubirDocModal(\'' + op.id + '\')" title="Adjuntar documento a la operación (o arrastrá un archivo al chat)">+</button>' +
          '<textarea id="op-hermes-input" rows="3" placeholder="Contale a Hermes qué cambió… (Enter envía · Shift+Enter línea)" oninput="ophGrow(this)" onkeydown="ophKey(event,\'' + op.id + '\')" class="oph-input" style="flex:1;min-width:0;"></textarea>' +
          '<button id="op-hermes-expand" class="btn btn-ghost btn-sm" onclick="ophToggleBig()" title="Ampliar el área de redacción">↕</button>' +
          '<button id="op-hermes-mic" class="btn btn-ghost btn-sm" onclick="opHermesAudio(\'' + op.id + '\')" title="Nota de voz a Hermes (Whisper)">🎤</button>' +
          '<button id="op-hermes-send" class="btn btn-gold btn-sm" onclick="opHermesAsk(\'' + op.id + '\')" title="Preguntar a Hermes (Enter)">➤</button>' +
        '</div>' +
        '<div id="oph-status" style="min-height:14px;margin:5px 0 0;"></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;">' +
          hChips.map(function (c) { return '<span onclick="opHermesChip(\'' + c + '\')" style="font-size:.66rem;background:rgba(94,200,216,.1);border:1px solid rgba(94,200,216,.3);color:#aee4ee;border-radius:12px;padding:3px 9px;cursor:pointer;">' + escHtml(c) + '</span>'; }).join('') +
        '</div>' +
      '</div>' +
      '</div>';
    // S100 A1 (front-only): card Documentos enriquecida — color por estado + leyenda + alcance + "qué falta" por tipo + CTAs + estado honesto sin propiedad
    var hayProp = !!op.propiedadId;
    var tipoOp = /alquiler/i.test(op.tipo || '') ? 'Alquiler' : 'Venta';
    var docPresentes = (Array.isArray(fdocs) ? fdocs : []).map(function (x) { return (x.tipo || '').toLowerCase(); });
    var docFaltaHtml = (function () {
      var esp = OP_DOCS_ESPERADOS[tipoOp] || []; if (!esp.length) return '';
      return '<div style="margin-top:8px;font-size:.7rem;color:var(--muted);"><b>Checklist esperado (' + tipoOp + '):</b> <span style="opacity:.7;">✓ presente · ○ falta</span>' +
        '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:5px;">' +
        esp.map(function (t) { var key = t.toLowerCase().slice(0, 5); var ok = docPresentes.some(function (p) { return p && (p.indexOf(key) >= 0 || t.toLowerCase().indexOf(p.slice(0, 5)) >= 0); }); return '<span style="border:1px solid var(--border);border-radius:7px;padding:2px 7px;font-size:.72rem;' + (ok ? 'color:var(--ok);' : 'opacity:.75;') + '">' + (ok ? '✓' : '○') + ' ' + escHtml(t) + '</span>'; }).join('') +
        '</div></div>';
    })();
    var docLegend = '<div style="font-size:.62rem;color:var(--muted);margin-top:8px;display:flex;gap:10px;flex-wrap:wrap;"><span style="color:var(--ok);">● validado/recibido</span><span style="color:var(--warn);">● observado/revisar</span><span style="color:var(--danger);">● bloqueante</span><span style="color:var(--muted);">● sin clasificar</span></div>';
    var docCTAs = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">' +
      '<button class="btn btn-gold btn-sm" onclick="opSubirDocModal(\'' + op.id + '\')">📎 Subir documento</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="opVincularDoc(\'' + op.id + '\')">🔗 Vincular existente</button>' +
      (hayProp ? '<button class="btn btn-ghost btn-sm" onclick="abrirDocUpload(\'' + op.propiedadId + '\')" title="Sube a la propiedad con tick de checklist + análisis legal">🏠 Subir a propiedad (con análisis)</button>' : '') +
      '<button class="btn btn-ghost btn-sm" onclick="nav(\'documentos\')">📥 Doc Inbox</button>' +
      (hayProp ? '<button class="btn btn-ghost btn-sm" onclick="abrirLegajo(\'' + op.propiedadId + '\')">🏠 Ver docs de propiedad</button>' : '') +
      '<button class="btn btn-ghost btn-sm" onclick="abrirOperacion(\'' + op.id + '\')">' + (hayProp ? 'Cambiar' : 'Vincular') + ' propiedad</button>' +
      '</div>';
    var docNotaA2 = '<div style="font-size:.64rem;color:var(--muted);margin-top:8px;border-top:1px dashed var(--border);padding-top:6px;">Se muestran los documentos de la <b>propiedad</b> 🏠 y los vinculados directo a la <b>operación</b> 💼 (sin duplicar). <b>📎 Subir documento</b> carga uno nuevo (estado Recibido, sin duplicar por hash, opcional también a la propiedad); <b>🔗 Vincular existente</b> suma uno del Doc Inbox.</div>';
    var docsBody;
    if (fdocs === null) {  // endpoint no disponible → fallback visual + CTAs
      docsBody = '<div style="font-size:.7rem;color:var(--muted);margin-bottom:8px;">Checklist operativo (visual — el detalle real carga al abrir la ficha).</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px;">' +
        OP_DOCS.map(function (dn, i) { var done = i === 0 && op.reserva; return '<div style="display:flex;align-items:center;gap:7px;font-size:.76rem;border:1px solid var(--border);border-radius:8px;padding:5px 9px;' + (done ? '' : 'opacity:.8;') + '">' + (done ? '🟢' : '⚪') + ' ' + escHtml(dn) + '</div>'; }).join('') +
        '</div>' + docCTAs;
    } else if (fdocs.length) {  // S101/A2: documentos reales (UNIÓN propiedad ∪ operación, badge de alcance)
      docsBody = '<div style="font-size:.7rem;color:var(--muted);margin-bottom:8px;">Documentos de la operación + su propiedad (' + fdocs.length + ').</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px;">' +
        fdocs.map(function (dc) { var nm = dc.tipo || dc.documento || 'Documento'; var alc = dc.alcance === 'ambos' ? '🔗 ambos' : dc.alcance === 'operacion' ? '💼 operación' : '🏠 propiedad'; return '<div style="display:flex;align-items:center;gap:7px;font-size:.76rem;border:1px solid var(--border);border-radius:8px;padding:5px 9px;"><span style="color:' + f360DocColor(dc.estado) + ';font-size:.7rem;">●</span> <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(nm) + '</span><span class="badge badge-muted" style="font-size:.56rem;">' + alc + '</span>' + (dc.estado ? ' <span style="color:var(--muted);font-size:.62rem;">' + escHtml(dc.estado) + '</span>' : '') + '</div>'; }).join('') +
        '</div>' + docLegend + docFaltaHtml + docCTAs + docNotaA2;
    } else {  // 0 documentos → estado honesto (sin inventar)
      docsBody = '<div style="font-size:.8rem;padding:4px 0;">' + (hayProp ? '<span style="color:var(--muted);">Sin documentos asociados todavía (propiedad sin docs · operación sin docs directos).</span>' : f360Falta('Sin documentos. Vinculá una propiedad o un documento (🔗 Vincular documento).')) + '</div>' +
        docFaltaHtml + docCTAs + docNotaA2;
    }
    var docs = '<div class="f360-card" id="f360-documentos"><div class="f360-t">📎 Documentos vinculados</div>' + docsBody + '</div>';
    // S102A: card Fiscal / Sellos ORIENTATIVA — datos reales donde existen, el resto "pendiente". Sin cálculo, sin %, sin reglas legales hardcodeadas.
    var fiscalRows = [
      ['Precio de cierre', f360Usd(precio)],
      ['Instrumento', op.instrumento ? escHtml(op.instrumento) : null],
      ['Escribanía', op.escribania ? escHtml(op.escribania) : null],
      ['Proveedor sellado', op.proveedorSellado ? escHtml(op.proveedorSellado) : null],
      ['Valor de escrituración', null], ['Base de sellos', null], ['% sellos', null], ['Impuesto estimado', null],
      ['Quién paga sellos', null], ['Quién gestiona sellos', null], ['Exento de sellos', null], ['VIR / valuación fiscal', null]
    ];
    var fiscal = '<div class="f360-card" id="f360-fiscal" style="border-color:rgba(212,175,55,.28);">' +
      '<div class="f360-t" style="color:var(--gold);">🧾 Fiscal / Sellos · orientativo</div>' +
      fiscalRows.map(function (fr) { return row(fr[0], fr[1] != null ? fr[1] : f360Ph('pendiente')); }).join('') +
      '<div style="font-size:.64rem;color:var(--muted);margin-top:9px;border-top:1px dashed var(--border);padding-top:7px;font-style:italic;">⚠ Orientativo — confirmar con escribanía/gestor. Sellos / exención / VIR se cargan con su tabla por jurisdicción (futuro), sin reglas hardcodeadas.</div>' +
      '</div>';
    var hist;
    if (ftrack !== null) {  // Track record REAL desde el audit del CRM
      hist = '<div class="f360-card" id="f360-historial"><div class="f360-t">🕑 Track record</div>' +
        (ftrack.length ? ftrack.map(function (e) { return '<div style="font-size:.78rem;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05);">' + f360TrackIcon(e.accion) + ' ' + escHtml(f360TrackLabel(e)) + (e.propio ? '' : ' <span style="opacity:.55;font-size:.66rem;">· propiedad</span>') + (e.ts ? ' <span style="color:var(--muted);font-size:.7rem;">· ' + String(e.ts).slice(0, 10) + '</span>' : '') + '</div>'; }).join('')
          : '<div style="font-size:.78rem;color:var(--muted);">Sin eventos registrados todavía.</div>') +
        '<div style="font-size:.66rem;color:var(--muted);margin-top:6px;">Historial real desde el registro de auditoría del CRM.</div></div>';
    } else {  // endpoint no disponible → fallback derivado de los datos actuales
      var eventos = [];
      if (op.creada) eventos.push(['📌', 'Operación creada', String(op.creada).slice(0, 10)]);
      if (op.reserva) eventos.push(['💵', 'Reserva cargada (' + f360Usd(op.reserva) + ')', op.fechaFirma ? String(op.fechaFirma).slice(0, 10) : '']);
      eventos.push(['🔄', 'Etapa actual: ' + (op.etapa || '—'), '']);
      hist = '<div class="f360-card" id="f360-historial"><div class="f360-t">🕑 Track record</div>' +
        eventos.map(function (e) { return '<div style="font-size:.78rem;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05);">' + e[0] + ' ' + escHtml(e[1]) + (e[2] ? ' <span style="color:var(--muted);font-size:.7rem;">· ' + e[2] + '</span>' : '') + '</div>'; }).join('') +
        '<div style="font-size:.7rem;color:var(--muted);margin-top:6px;">Derivado de los datos actuales (historial real al cargar).</div></div>';
    }
    // S103A: card operativa central "Centro de mando" — todo DERIVADO de /ficha + op (cero backend nuevo).
    var docsFaltanList = (OP_DOCS_ESPERADOS[tipoOp] || []).filter(function (t) { var key = t.toLowerCase().slice(0, 5); return !docPresentes.some(function (p) { return p && (p.indexOf(key) >= 0 || t.toLowerCase().indexOf(p.slice(0, 5)) >= 0); }); }).slice(0, 4);
    var riesgos = [];
    if (bloq) riesgos.push('Operación trabada: ' + op.bloqueo);
    if (!op.propiedadId) riesgos.push('Sin propiedad vinculada');
    if (!op.compradorId) riesgos.push('Comprador sin vincular');
    var opCmd = '<div class="f360-card" id="f360-comando" style="border-color:rgba(212,175,55,.3);">' +
      '<div class="f360-t" style="color:var(--gold);">🎯 Centro de mando</div>' +
      '<div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;">Próxima acción</div>' +
      '<div style="font-size:.8rem;border:1px solid rgba(94,200,216,.25);border-radius:8px;padding:6px 9px;margin:3px 0 9px;">' + escHtml(prox) + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">' +
        '<div><div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;">Estado de cierre</div><div style="font-size:.8rem;font-weight:600;">' + escHtml(op.etapa || '—') + '</div><div style="font-size:.64rem;color:var(--muted);">paso ' + (idx + 1) + '/' + OP_FLUJO.length + (bloq ? ' · 🔴 trabada' : '') + '</div></div>' +
        '<div><div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;">Honorarios</div><div style="font-size:.8rem;font-weight:600;color:var(--gold);">' + (f360Usd(honCalc) || '—') + '</div><div style="font-size:.64rem;color:var(--muted);">pend. ' + (f360Usd(honPend) || f360Usd(0)) + '</div></div>' +
      '</div>' +
      (docsFaltanList.length ? '<div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;margin-top:9px;">Documentos prioritarios</div><div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px;">' + docsFaltanList.map(function (t) { return '<span style="font-size:.66rem;border:1px solid var(--border);border-radius:7px;padding:2px 7px;opacity:.85;">○ ' + escHtml(t) + '</span>'; }).join('') + '</div>' : '') +
      (faltan.length ? '<div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;margin-top:9px;">Faltantes del checklist</div><ul style="margin:3px 0 0;padding-left:16px;font-size:.72rem;color:var(--muted);">' + faltan.map(function (f) { return '<li>' + escHtml(f) + '</li>'; }).join('') + '</ul>' : '') +
      (riesgos.length ? '<div style="font-size:.6rem;color:var(--danger);text-transform:uppercase;margin-top:9px;">Riesgos / alertas</div>' + riesgos.map(function (rk) { return '<div style="font-size:.72rem;color:var(--warn);margin-top:2px;">⚠ ' + escHtml(rk) + '</div>'; }).join('') : '<div style="font-size:.66rem;color:var(--ok);margin-top:9px;">✅ Sin alertas críticas.</div>') +
      '</div>';
    var nav = '<div class="f360-nav" style="display:flex;gap:5px;flex-wrap:wrap;margin-top:10px;">' +
      [['Mando', 'f360-comando'], ['Resumen', 'f360-resumen'], ['Partes', 'f360-partes'], ['Flujo', 'f360-flujo'], ['Documentos', 'f360-documentos'], ['Fiscal', 'f360-fiscal'], ['Fechas', 'f360-fechas'], ['Honorarios', 'f360-honorarios'], ['Hermes', 'f360-hermes'], ['Historial', 'f360-historial']]
        .map(function (n) { return '<a onclick="f360goto(\'' + n[1] + '\')">' + n[0] + '</a>'; }).join('') + '</div>';
    var header = '<div style="position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--border);padding:14px 22px;">' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        '<button class="btn btn-ghost btn-sm" onclick="cerrarFicha360()">← Volver</button>' +
        '<h2 style="margin:0;font-size:1.05rem;">💼 ' + escHtml(op.operacion) + '</h2>' +
        '<span class="badge badge-gold">' + escHtml(op.tipo || '—') + '</span>' +
        '<span class="badge badge-muted">' + escHtml(op.etapa || '—') + '</span>' +
        (bloq ? '<span class="badge" style="background:var(--danger);color:#fff;">🔴 Trabada</span>' : '') +
        '<span style="margin-left:auto;"></span>' +
        '<button class="btn btn-gold btn-sm" onclick="abrirOperacion(\'' + op.id + '\')">✏️ Edición rápida</button>' +
        (op.url ? '<a class="btn btn-ghost btn-sm" style="text-decoration:none;" href="' + op.url + '" target="_blank" rel="noopener">↗ Notion</a>' : '') +
      '</div>' + nav + '</div>';
    document.getElementById('op-f360-inner').innerHTML = header +
      '<div style="padding:18px 22px;"><div class="f360-cols"><div>' + left + hist + '</div><div>' + opCmd + center + docs + fiscal + '</div><div class="f360-hermes-rail">' + right + '</div></div></div>';
  }
  window.renderFicha360 = renderFicha360;

  /* ─── HUE ────────────────────────────────────────────────────────── */
  async function loadHue() {
    var d = await apiFetch('/smart-home/hue');
    var lightsEl = document.getElementById('hue-lights');
    var setupEl  = document.getElementById('hue-setup');
    var badgeEl  = document.getElementById('hue-badge');
    var subEl    = document.getElementById('hue-sub');

    if (!d || !d.available) {
      if (lightsEl) lightsEl.style.display = 'none';
      if (setupEl)  setupEl.style.display  = '';
      if (subEl)    subEl.textContent = 'Bridge no configurado';
      if (badgeEl)  badgeEl.textContent = 'Sin configurar';
      return;
    }
    if (setupEl)  setupEl.style.display = 'none';
    if (lightsEl) lightsEl.style.display = '';
    if (badgeEl)  { badgeEl.textContent = d.total + ' luces'; badgeEl.className = 'badge badge-ok'; }
    if (subEl)    subEl.textContent = d.total + ' dispositivos encontrados';

    var lights = d.lights || [];
    if (lightsEl) {
      lightsEl.innerHTML = lights.map(function (l) {
        var dotCls = l.on && l.reachable ? 'ok' : l.reachable ? 'err' : 'warn';
        return '<div class="docker-item" style="cursor:pointer;" onclick="toggleHue(' + l.id + ',' + (!l.on) + ')">' +
          '<div class="d-name"><span class="dot ' + dotCls + '"></span>' + escHtml(l.name || '—') + '</div>' +
          '<div class="d-status" style="color:' + (l.on ? 'var(--gold)' : 'var(--muted)') + ';">' +
            (l.on ? 'ON' : 'OFF') + ' · ' + Math.round((l.brightness || 0) / 2.55) + '%' +
          '</div>' +
        '</div>';
      }).join('');
    }
  }
  window.loadHue = loadHue;

  async function toggleHue(id, on) {
    await apiFetch('/smart-home/hue/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'light', id: id, state: { on: on } })
    });
    loadHue();
  }
  window.toggleHue = toggleHue;

  /* ─── CANARIAN ────────────────────────────────────────────────────── */
  function checkCanaSession() {
    var stored = sessionStorage.getItem('cana_pin');
    var ts = parseInt(sessionStorage.getItem('cana_ts') || '0');
    if (stored && (Date.now() - ts) < 300000) {
      unlockWithPin(stored);
    } else {
      showLock();
    }
  }

  function showLock() {
    var lockEl = document.getElementById('canarian-lock');
    var contentEl = document.getElementById('canarian-content');
    if (lockEl)    lockEl.style.display = '';
    if (contentEl) contentEl.style.display = 'none';
  }

  async function unlockCanarian() {
    var pinEl = document.getElementById('pin-input');
    if (!pinEl || !pinEl.value) return;
    await unlockWithPin(pinEl.value);
  }
  window.unlockCanarian = unlockCanarian;

  async function unlockWithPin(pin) {
    // Use the ledger endpoint directly with the PIN header (same as office/index.html)
    var { API } = window.GO;
    var errEl = document.getElementById('pin-error');
    try {
      var r = await fetch(API + '/canarian/ledger', {
        headers: { Accept: 'application/json', 'X-Canarian-Pin': pin }
      });
      if (r.status === 401) {
        if (errEl) errEl.textContent = 'PIN incorrecto';
        var pinEl = document.getElementById('pin-input');
        if (pinEl) {
          pinEl.classList.add('pin-shake');
          setTimeout(function () { pinEl.classList.remove('pin-shake'); }, 500);
        }
        return;
      }
      var data = await r.json();
      canarianPin = pin;
      sessionStorage.setItem('cana_pin', pin);
      sessionStorage.setItem('cana_ts', Date.now().toString());
      var lockEl    = document.getElementById('canarian-lock');
      var contentEl = document.getElementById('canarian-content');
      if (lockEl)    lockEl.style.display = 'none';
      if (contentEl) contentEl.style.display = '';
      if (errEl)     errEl.textContent = '';
      renderLedger(data.entries || []);
      startLockTimer();
    } catch (e) {
      if (errEl) errEl.textContent = 'Error de red';
    }
  }

  function lockCanarian() {
    canarianPin = null;
    sessionStorage.removeItem('cana_pin');
    sessionStorage.removeItem('cana_ts');
    clearInterval(lockTimer);
    lockTimer = null;
    var pinEl = document.getElementById('pin-input');
    if (pinEl) pinEl.value = '';
    showLock();
  }
  window.lockCanarian = lockCanarian;

  function startLockTimer() {
    clearInterval(lockTimer);
    lockSecondsLeft = 300;
    lockTimer = setInterval(function () {
      lockSecondsLeft--;
      var m = Math.floor(lockSecondsLeft / 60);
      var s = lockSecondsLeft % 60;
      var timerEl = document.getElementById('lock-timer');
      if (timerEl) timerEl.textContent = m + ':' + String(s).padStart(2, '0');
      if (lockSecondsLeft <= 0) lockCanarian();
    }, 1000);
  }

  // Reset timer on any click while in canarian view
  document.addEventListener('click', function () {
    if (canarianPin) {
      var view = document.getElementById('view-canarian');
      if (view && view.classList.contains('active')) {
        lockSecondsLeft = 300;
        sessionStorage.setItem('cana_ts', Date.now().toString());
      }
    }
  });

  var TYPE_LABEL = {
    ingreso_usdt: 'Ingreso USDT', egreso_usdt: 'Egreso USDT',
    ingreso_usd:  'Ingreso USD',  egreso_usd:  'Egreso USD',
    ingreso_ars:  'Ingreso ARS',  egreso_ars:  'Egreso ARS',
    comision: 'Comisión', wire: 'Wire transfer'
  };

  function renderLedger(entries) {
    var body = document.getElementById('ledger-body');
    if (!body) return;
    if (!entries || !entries.length) {
      body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px;">Sin movimientos</td></tr>';
      // Zero balances
      ['c-usdt', 'c-usd', 'c-ars'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.textContent = '$0';
      });
      return;
    }
    // Calculate balances
    var usdt = 0, usd = 0, ars = 0;
    entries.forEach(function (e) {
      var sign = (e.tipo && (e.tipo.startsWith('ingreso') || e.tipo === 'comision')) ? 1 : -1;
      var amt  = parseFloat(e.monto) || 0;
      if (e.moneda === 'USDT') usdt += sign * amt;
      else if (e.moneda === 'USD') usd += sign * amt;
      else if (e.moneda === 'ARS') ars += sign * amt;
    });
    function fmtBal(v, suffix) {
      return (v >= 0 ? '+' : '') + v.toLocaleString('es-AR', { minimumFractionDigits: 2 }) + ' ' + suffix;
    }
    var cusdtEl = document.getElementById('c-usdt');
    var cusdEl  = document.getElementById('c-usd');
    var carsEl  = document.getElementById('c-ars');
    if (cusdtEl) cusdtEl.textContent = fmtBal(usdt, 'USDT');
    if (cusdEl)  cusdEl.textContent  = fmtBal(usd, 'USD');
    if (carsEl)  carsEl.textContent  = (ars >= 0 ? '+' : '') + ars.toLocaleString('es-AR', { maximumFractionDigits: 0 }) + ' ARS';

    body.innerHTML = entries.map(function (e) {
      var isIn = e.tipo && (e.tipo.startsWith('ingreso') || e.tipo === 'comision');
      var dateStr = e.date || (e.createdAt ? e.createdAt.substring(0, 10) : '—');
      return '<tr>' +
        '<td style="font-family:var(--mono);font-size:.78rem;color:var(--muted);">' + escHtml(dateStr) + '</td>' +
        '<td style="font-size:.78rem;">' + escHtml(TYPE_LABEL[e.tipo] || e.tipo || '—') + '</td>' +
        '<td style="font-weight:700;color:' + (isIn ? 'var(--ok)' : 'var(--danger)') + ';">' +
          (isIn ? '+' : '-') + parseFloat(e.monto || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 }) +
        '</td>' +
        '<td style="font-size:.78rem;">' + escHtml(e.moneda || '—') + '</td>' +
        '<td style="font-size:.78rem;color:var(--muted);">' + escHtml(e.contraparte || '—') + '</td>' +
        '<td style="font-size:.78rem;color:var(--muted);">' + escHtml(e.nota || '—') + '</td>' +
        '<td><button class="btn btn-danger btn-sm" onclick="deleteLedger(' + (e.id || 0) + ')">✕</button></td>' +
      '</tr>';
    }).join('');
  }

  async function createLedgerEntry() {
    var { API } = window.GO;
    var fechaEl  = document.getElementById('c-fecha');
    var tipoEl   = document.getElementById('c-tipo');
    var montoEl  = document.getElementById('c-monto');
    var monedaEl = document.getElementById('c-moneda');
    var ctrEl    = document.getElementById('c-contraparte');
    var notaEl   = document.getElementById('c-nota');
    var body = {
      date:        fechaEl  ? (fechaEl.value  || new Date().toISOString().substring(0, 10)) : new Date().toISOString().substring(0, 10),
      tipo:        tipoEl   ? tipoEl.value   : '',
      monto:       montoEl  ? montoEl.value  : '',
      moneda:      monedaEl ? monedaEl.value : 'USDT',
      contraparte: ctrEl    ? ctrEl.value    : '',
      nota:        notaEl   ? notaEl.value   : ''
    };
    if (!body.monto || !body.tipo) return toast('Monto y tipo son requeridos', 'err');
    try {
      var r = await fetch(API + '/canarian/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Canarian-Pin': canarianPin },
        body: JSON.stringify(body)
      });
      if (r.ok) {
        hideModal('modal-canarian');
        toast('Movimiento registrado', 'ok');
        var fresh = await fetch(API + '/canarian/ledger', { headers: { 'X-Canarian-Pin': canarianPin } });
        var fdata = await fresh.json();
        renderLedger(fdata.entries || []);
      } else {
        toast('Error al registrar (' + r.status + ')', 'err');
      }
    } catch (e) {
      toast('Error de red', 'err');
    }
  }
  window.createLedgerEntry = createLedgerEntry;

  async function deleteLedger(id) {
    if (!confirm('Eliminar este movimiento?')) return;
    var { API } = window.GO;
    try {
      var r = await fetch(API + '/canarian/ledger/' + id, {
        method: 'DELETE',
        headers: { 'X-Canarian-Pin': canarianPin }
      });
      if (r.ok) {
        toast('Movimiento eliminado', 'ok');
        var fresh = await fetch(API + '/canarian/ledger', { headers: { 'X-Canarian-Pin': canarianPin } });
        var fdata = await fresh.json();
        renderLedger(fdata.entries || []);
      } else {
        toast('Error al eliminar', 'err');
      }
    } catch (e) {
      toast('Error de red', 'err');
    }
  }
  window.deleteLedger = deleteLedger;

  /* ─── LOAD EXPENSES ─────────────────────────────────────────────── */
  async function loadExpenses() {
    var el = document.getElementById('expenses-content');
    var periodEl = document.getElementById('expenses-period');
    if (!el) return;

    // Show skeleton while loading
    el.innerHTML = '<div class="skeleton skeleton-block" style="height:160px;"></div>';

    var d = await apiFetch('/business/profitability?empresa=all');
    if (!d || d.__error || !d.expenses) {
      el.innerHTML = '<span style="color:var(--muted);font-size:.82rem;">Sin datos de gastos</span>';
      if (periodEl) periodEl.textContent = 'sin datos';
      return;
    }
    var exp = d.expenses;
    if (periodEl) periodEl.textContent = (exp.mes || '—') + ' · ' + (exp.count || 0) + ' registros';

    var cats = (exp.byCategory || []).slice().sort(function (a, b) { return (b.usd || 0) - (a.usd || 0); });
    var total = exp.totalUSD || 0;
    var maxVal = cats.length ? (cats[0].usd || 1) : 1;

    // Palette: alternate gold/teal
    var palette = ['#d4a640', '#4dde95', '#7ec8e3', '#a78bfa', '#ffbb55', '#5b9cf6', '#ff7b7b'];

    var headHtml = '<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:14px;">' +
      '<span style="font-family:var(--mono);font-size:1.6rem;font-weight:800;color:var(--gold);">$' +
        Math.round(total).toLocaleString('es-AR') + '</span>' +
      '<span style="font-size:.76rem;color:var(--muted);">USD · ' + (exp.count || 0) + ' registros</span>' +
    '</div>';

    var barsHtml = '<div class="expense-bar-chart">' +
      cats.map(function (c, i) {
        var pct = maxVal ? Math.round((c.usd || 0) * 100 / maxVal) : 0;
        var color = palette[i % palette.length];
        return '<div class="expense-row">' +
          '<span class="expense-label" title="' + escHtml(c.cat || '') + '">' + escHtml(c.cat || '—') + '</span>' +
          '<div class="expense-track"><div class="expense-fill" style="width:' + pct + '%;background:' + color + ';opacity:.75;"></div></div>' +
          '<span class="expense-val">$' + Math.round(c.usd || 0).toLocaleString('es-AR') + '</span>' +
        '</div>';
      }).join('') +
    '</div>';

    el.innerHTML = headHtml + barsHtml;
  }
  window.loadExpenses = loadExpenses;

  /* ─── LOAD BAMBI OPS ─────────────────────────────────────────────── */
  async function loadBambiOps() {
    var el = document.getElementById('bambi-ops-content');
    if (!el) return;

    el.innerHTML = '<div class="skeleton skeleton-block" style="height:80px;"></div>';

    var d = await apiFetch('/agents/bambi-analytics');
    if (!d || d.__error || !d.ok) {
      el.innerHTML = '<span style="color:var(--muted);font-size:.82rem;">Sin datos de Bambi</span>';
      return;
    }

    var retPct = parseFloat(d.retentionPct || 0);

    // Stat tiles
    var tilesHtml = '<div class="bambi-tiles">' +
      '<div class="bambi-tile"><span>Resueltos</span><strong style="color:var(--ok);">' + (d.resolved || 0) + '</strong></div>' +
      '<div class="bambi-tile"><span>Escalados</span><strong style="color:var(--warn);">' + (d.escalated || 0) + '</strong></div>' +
      '<div class="bambi-tile"><span>Takeover</span><strong style="color:var(--blue);">' + (d.takeover || 0) + '</strong></div>' +
      '<div class="bambi-tile"><span>Retención</span><strong style="color:var(--gold);">' + retPct.toFixed(1) + '%</strong></div>' +
    '</div>';

    // Mini retention gauge using Canvas
    var gaugeHtml = '<div style="display:flex;align-items:center;gap:16px;margin-top:4px;">' +
      '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;">' +
        '<canvas id="g-bambi-ret" width="72" height="72"></canvas>' +
        '<div style="font-size:.62rem;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;">Retención</div>' +
      '</div>' +
      '<div style="font-size:.76rem;color:var(--muted);line-height:1.6;">' +
        'Muestra: <strong style="color:var(--text);">' + (d.responseSamples || 0) + '</strong> conversaciones analizadas.<br>' +
        'Total gestionado: <strong style="color:var(--text);">' + ((d.resolved || 0) + (d.escalated || 0)) + '</strong> · ' +
        'Tasa takeover: <strong style="color:var(--text);">' +
          (((d.resolved || 0) + (d.escalated || 0)) > 0
            ? Math.round((d.takeover || 0) * 100 / ((d.resolved || 0) + (d.escalated || 0))) + '%'
            : '—') +
        '</strong>' +
      '</div>' +
    '</div>';

    el.innerHTML = tilesHtml + gaugeHtml;

    // Draw the gauge after DOM is updated
    setTimeout(function () {
      setGauge('g-bambi-ret', null, retPct, 'Retención', true);
      var gv = document.getElementById('g-bambi-ret');
      if (gv) {
        // Draw the value text directly on the canvas since there's no separate val element
        var canvas = gv;
        var ctx = canvas.getContext('2d');
        var W = canvas.width;
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.fillStyle = '#d4a640';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(retPct.toFixed(0) + '%', W / 2, W * 0.55);
      }
    }, 50);
  }
  window.loadBambiOps = loadBambiOps;

  /* ─── BANDEJA DE HUÉSPEDES (Frente 5) ─────────────────────────────── */
  function inboxAgo(s) {
    s = s || 0;
    if (s < 60) return 'recién';
    var m = Math.round(s / 60);
    if (m < 60) return 'hace ' + m + ' min';
    var h = Math.floor(m / 60), mm = m % 60;
    if (h < 24) return 'hace ' + h + 'h' + (mm ? ' ' + mm + 'm' : '');
    return 'hace ' + Math.floor(h / 24) + 'd';
  }
  async function loadBambiInbox() {
    var el = document.getElementById('bambi-inbox-content');
    if (!el) return;
    el.innerHTML = '<div class="skeleton skeleton-block" style="height:120px;"></div>';
    var badge = document.getElementById('bambi-inbox-waiting');
    var d = await apiFetch('/agents/conversations/bambi?limit=40');
    if (!d || d.__error || !d.ok) {
      el.innerHTML = '<span style="color:var(--muted);font-size:.82rem;">Sin datos de la bandeja' + (d && d.__error ? ' (' + d.__error + ')' : '') + '</span>';
      if (badge) badge.style.display = 'none';
      return;
    }
    var threads = (d.threads || []).slice();
    threads.sort(function (a, b) {
      if (!!a.waiting !== !!b.waiting) return a.waiting ? -1 : 1;
      return (b.waiting_s || 0) - (a.waiting_s || 0);
    });
    if (badge) {
      if (d.waiting > 0) { badge.textContent = d.waiting + ' esperando'; badge.style.display = ''; }
      else { badge.style.display = 'none'; }
    }
    if (!threads.length) {
      el.innerHTML = '<span style="color:var(--muted);font-size:.82rem;">Sin conversaciones recientes</span>';
      return;
    }
    var head = '<div style="font-size:.72rem;color:var(--muted);margin-bottom:8px;">' +
      (d.waiting > 0
        ? '<strong style="color:var(--warn);font-size:.95rem;">' + d.waiting + '</strong> esperando respuesta · ' + threads.length + ' chats'
        : '<strong style="color:var(--ok);">✓ al día</strong> · ' + threads.length + ' chats') +
      '</div>';
    var rows = threads.map(function (t) {
      var waiting = !!t.waiting;
      var accent = waiting ? 'var(--warn)' : 'rgba(255,255,255,0.10)';
      var meta = waiting ? '⏳ ' + inboxAgo(t.waiting_s) : '✓ respondido';
      var metaCol = waiting ? 'var(--warn)' : 'var(--muted)';
      return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.05);border-left:3px solid ' + accent + ';padding-left:9px;">' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:.82rem;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
            escHtml(t.name || '—') +
            (t.tag ? ' <span style="color:var(--muted);font-size:.72rem;font-weight:400;">· ' + escHtml(t.tag) + '</span>' : '') +
          '</div>' +
          (t.snippet ? '<div style="font-size:.72rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(t.snippet) + '</div>' : '') +
        '</div>' +
        '<span style="color:' + metaCol + ';font-size:.72rem;flex-shrink:0;white-space:nowrap;">' + meta + '</span>' +
      '</div>';
    }).join('');
    el.innerHTML = head + rows;
  }
  window.loadBambiInbox = loadBambiInbox;

  /* ─── OPERACIONES TAB ────────────────────────────────────────────── */
  async function loadOpsTab() {
    var el = document.getElementById('ops-tasks-content');
    if (!el) return;
    el.innerHTML = '<div class="skeleton skeleton-block" style="height:100px;"></div>';

    var d = await apiFetch('/tasks');
    var tasks = (d && d.all) ? d.all : [];
    if (!tasks.length) {
      el.innerHTML = '<span style="color:var(--muted);font-size:.82rem;">Sin tareas activas</span>';
      return;
    }
    var prioColor = { Urgente: 'var(--danger)', Alta: 'var(--warn)', Media: 'var(--ok)', Baja: 'var(--muted)' };
    var colorMap  = { Pamela: '#d4a640', Augusto: '#4dde95', Marcelo: '#5b9cf6', Franco: '#ff7b7b' };

    // Solo tareas URGENTES (pedido Franco)
    var urgent = tasks.filter(function (t) {
      return (t.priority || t.prioridad || '').toLowerCase() === 'urgente';
    });
    if (!urgent.length) {
      el.innerHTML = '<span style="color:var(--muted);font-size:.82rem;">✅ Sin tareas urgentes</span>';
      return;
    }
    el.innerHTML = '<div style="font-size:.72rem;color:var(--muted);margin-bottom:8px;"><strong style="color:var(--danger);font-size:.95rem;">' + urgent.length + '</strong> urgentes</div>' +
      urgent.slice(0, 12).map(function (t) {
        var r = t.responsable || '';
        var col = colorMap[r] || 'var(--muted)';
        return '<div style="display:flex;justify-content:space-between;align-items:center;font-size:.8rem;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05);">' +
          '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;">' + escHtml(t.title || '—') + '</span>' +
          '<span style="background:' + col + '22;color:' + col + ';padding:1px 6px;border-radius:6px;font-size:.72rem;flex-shrink:0;">' + escHtml(r || '—') + '</span>' +
        '</div>';
      }).join('');
  }
  window.loadOpsTab = loadOpsTab;

  async function loadOpsPipeline() {
    var el = document.getElementById('ops-pipeline-content');
    if (!el) return;
    el.innerHTML = '<div class="skeleton skeleton-block" style="height:100px;"></div>';

    var d = await apiFetch('/crm/pipeline');
    if (!d || d.__error || !d.ok || !(d.propiedades && d.propiedades.total)) {
      el.innerHTML = '<span style="color:var(--muted);font-size:.82rem;">Pipeline vacío — cargá propiedades en GRINGO CRM</span>';
      return;
    }
    var byStatus = d.propiedades.byEstado || {};
    var total = d.propiedades.total;

    var html = '<div style="font-size:.72rem;color:var(--muted);margin-bottom:10px;"><strong style="color:var(--text);font-size:.95rem;">' + total + '</strong> propiedades en cartera</div>' +
      '<div class="ops-pipeline">' +
      Object.keys(byStatus).map(function (s) {
        return '<div class="ops-pipe-item"><span>' + escHtml(s) + '</span><strong>' + byStatus[s] + '</strong></div>';
      }).join('') +
      '</div>';
    el.innerHTML = html;
  }
  window.loadOpsPipeline = loadOpsPipeline;

  /* ─── AGENT CHAT ─────────────────────────────────────────────────── */
  async function sendAgentChat(agent) {
    var inputEl = document.getElementById('chat-in-' + agent);
    var msgsEl  = document.getElementById('chat-msgs-' + agent);
    if (!inputEl || !msgsEl) return;
    var text = (inputEl.value || '').trim();
    if (!text) return;
    inputEl.value = '';

    // Render user message
    appendChatMsg(msgsEl, text, 'user');

    // Show typing indicator
    var typingId = 'typing-' + agent + '-' + Date.now();
    appendChatMsg(msgsEl, '…', 'agent', typingId);

    try {
      var d = await apiFetch('/agents/chat/' + agent, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text })
      });
      // Remove typing indicator
      var typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();

      if (!d || d.__error) {
        // Graceful fallback
        appendChatMsg(msgsEl, 'Chat en preparación — el endpoint /agents/chat/' + agent + ' está siendo conectado. Pronto disponible.', 'system');
      } else {
        var reply = (typeof d === 'string') ? d : (d.reply || d.text || d.response || JSON.stringify(d));
        appendChatMsg(msgsEl, reply, 'agent');
      }
    } catch (err) {
      var typingEl2 = document.getElementById(typingId);
      if (typingEl2) typingEl2.remove();
      appendChatMsg(msgsEl, 'Chat en preparación — endpoint en construcción.', 'system');
    }
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  window.sendAgentChat = sendAgentChat;

  function appendChatMsg(container, text, role, id) {
    var div = document.createElement('div');
    div.className = 'chat-msg ' + (role || 'agent');
    if (id) div.id = id;
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  /* ─── AGENT CONFIG EDITOR (ver + editar persona/config + reload en caliente) ─── */
  var AE_LABEL = 'font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin:0 0 4px;';
  async function toggleAgentConfig(agent) {
    var el = document.getElementById(agent + '-config-area');
    if (!el) return;
    if (el.style.display !== 'none') { el.style.display = 'none'; return; }
    el.style.display = '';
    el.innerHTML = '<div class="skeleton skeleton-block" style="height:90px;"></div>';

    // configs/personas vivos del runtime (MADRE_FILES: <agent>-config / <agent>-system)
    var res = await Promise.all([
      apiFetch('/files/' + agent + '-config'),
      apiFetch('/files/' + agent + '-system')
    ]);
    var cfg = res[0], sys = res[1];
    var cfgText = (cfg && !cfg.__error && typeof cfg.content === 'string') ? cfg.content : '';
    var sysText = (sys && !sys.__error && typeof sys.content === 'string') ? sys.content : '';
    if (!cfgText && !sysText) {
      el.innerHTML = '<div class="err">No se pudo cargar la config de ' + escHtml(agent) + ' (¿bridge / agente sin archivos?).</div>';
      return;
    }
    el.innerHTML =
      '<div style="' + AE_LABEL + '">Config — agent.config.json (modelo · voz · tools · allowlist)</div>' +
      '<textarea class="input" id="ae-cfg-' + agent + '" spellcheck="false" style="min-height:140px;font-family:var(--mono);font-size:.72rem;">' + escHtml(cfgText) + '</textarea>' +
      '<div style="' + AE_LABEL + 'margin-top:10px;">Persona — system.md (personalidad / "GPT" del agente)</div>' +
      '<textarea class="input" id="ae-sys-' + agent + '" spellcheck="false" style="min-height:170px;font-size:.78rem;">' + escHtml(sysText) + '</textarea>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center;">' +
        '<button class="btn btn-ghost btn-sm" onclick="saveAgentFile(\'' + agent + '\',\'config\')">Guardar config</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="saveAgentFile(\'' + agent + '\',\'system\')">Guardar persona</button>' +
        '<button class="btn btn-gold btn-sm" onclick="reloadAgentRuntime(\'' + agent + '\')">Aplicar (reload)</button>' +
        '<span id="ae-status-' + agent + '" class="small muted"></span>' +
      '</div>' +
      '<div class="small muted" style="margin-top:6px;">Cada guardado hace backup automático. "Aplicar" recarga el agente en caliente (afecta al agente vivo).</div>';
  }
  window.toggleAgentConfig = toggleAgentConfig;

  async function saveAgentFile(agent, which) {
    var isCfg = which === 'config';
    var key = agent + '-' + (isCfg ? 'config' : 'system');
    var ta = document.getElementById('ae-' + (isCfg ? 'cfg' : 'sys') + '-' + agent);
    var st = document.getElementById('ae-status-' + agent);
    if (!ta) return;
    if (isCfg) {
      try { JSON.parse(ta.value); }
      catch (e) { if (st) { st.textContent = '❌ JSON inválido: ' + e.message; st.style.color = 'var(--danger)'; } return; }
    }
    if (st) { st.textContent = 'Guardando…'; st.style.color = 'var(--muted)'; }
    var r = await apiFetch('/files/' + key, { method: 'POST', body: JSON.stringify({ content: ta.value }) });
    if (r && !r.__error && !r.error) {
      if (st) { st.textContent = '✅ Guardado (con backup). Aplicá "reload" para activar.'; st.style.color = 'var(--ok)'; }
      toast('Guardado ' + key, 'ok');
    } else {
      if (st) { st.textContent = '❌ ' + ((r && (r.error || r.__error)) || 'error'); st.style.color = 'var(--danger)'; }
    }
  }
  window.saveAgentFile = saveAgentFile;

  async function reloadAgentRuntime(agent) {
    if (!window.confirm('¿Aplicar los cambios y recargar ' + agent + ' en caliente? Afecta al agente productivo.')) return;
    var st = document.getElementById('ae-status-' + agent);
    if (st) { st.textContent = 'Recargando runtime…'; st.style.color = 'var(--muted)'; }
    var r = await apiFetch('/agents/reload/' + agent, { method: 'POST', body: JSON.stringify({}) });
    if (r && r.ok) {
      if (st) { st.textContent = '✅ ' + agent + ' recargado (' + (r.mode || 'live') + ')'; st.style.color = 'var(--ok)'; }
      toast(agent + ' recargado en caliente', 'ok');
    } else {
      if (st) { st.textContent = '❌ ' + ((r && (r.error || r.detail || r.__error)) || 'error'); st.style.color = 'var(--danger)'; }
    }
  }
  window.reloadAgentRuntime = reloadAgentRuntime;

  /* ─── BAMBI AGENT (for agentes view) ─────────────────────────────── */
  async function loadBambiAgent() {
    // Reuse existing loadBambi + load analytics for the agent view
    var d = await apiFetch('/agents/bambi-analytics');
    var badge = document.getElementById('bambi-status-badge');
    var statsRow = document.getElementById('bambi-stats-row');
    var liveWrap = document.getElementById('bambi-live-wrap');

    if (!d || d.__error || !d.ok) {
      if (badge) { badge.textContent = 'Sin datos analíticos'; badge.className = 'badge badge-warn'; }
      return;
    }

    if (badge) { badge.textContent = 'Live analytics'; badge.className = 'badge badge-ok'; }
    if (statsRow) {
      var retPct = parseFloat(d.retentionPct || 0);
      statsRow.innerHTML =
        '<div class="stat-item"><span>Resueltos</span><strong style="color:var(--ok);">' + (d.resolved || 0) + '</strong></div>' +
        '<div class="stat-item"><span>Escalados</span><strong style="color:var(--warn);">' + (d.escalated || 0) + '</strong></div>' +
        '<div class="stat-item"><span>Retención</span><strong style="color:var(--gold);">' + retPct.toFixed(1) + '%</strong></div>';
    }
    if (liveWrap) liveWrap.style.display = '';
  }
  window.loadBambiAgent = loadBambiAgent;

  // Keep old loadBambi for backward compat (called nowhere critical but exposed)
  window.loadBambi = loadBambiAgent;

  /* ─── AGENT TOOLS · CAPACIDADES + ACTIVIDAD + DISPARO CON CONFIRMACIÓN ─── */
  var AGENT_SPECS = {}; // cache: agent → { toolName → {name, description, parameters} }
  // Metadata visual de cada tool (icono + label corto + nivel de riesgo).
  var TOOL_META = {
    notion_search:      { icon: '🔍', label: 'Buscar en Notion',  risk: 'read'  },
    notion_create_task: { icon: '✅', label: 'Crear tarea',        risk: 'write' },
    notion_update_task: { icon: '✏️', label: 'Actualizar tarea',   risk: 'write' },
    generate_pdf:       { icon: '📄', label: 'Generar PDF',        risk: 'write' },
    save_to_drive:      { icon: '☁️', label: 'Guardar en Drive',   risk: 'write' },
    send_mail:          { icon: '✉️', label: 'Enviar email',       risk: 'send'  },
    send_document:      { icon: '📎', label: 'Enviar documento',   risk: 'send'  },
    presupuesto:        { icon: '🏷️', label: 'Presupuesto AMBBI',  risk: 'send'  },
    burn_sheet_writer:  { icon: '💸', label: 'Cargar gasto',       risk: 'write' },
    burn_sheet_edit:    { icon: '🧮', label: 'Editar gasto',       risk: 'write' },
    burn_sheet_cancel:  { icon: '🚫', label: 'Anular gasto',       risk: 'write' }
  };
  var RISK_META = {
    read:  { color: 'var(--ok)',   tag: 'lectura'   },
    write: { color: 'var(--gold)', tag: 'escritura' },
    send:  { color: 'var(--warn)', tag: 'envío'     }
  };

  // KPIs de actividad real (contadores Redis escritos por el runtime al disparar tools).
  async function loadAgentActivity(agent) {
    var el = document.getElementById(agent + '-activity');
    if (!el) return;
    var d = await apiFetch('/agents/activity/' + agent);
    if (!d || d.__error || !d.ok) { el.innerHTML = ''; return; }
    var top = Object.keys(d.total || {}).map(function (k) { return [k, d.total[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 4);
    var topHtml = top.length
      ? top.map(function (t) {
          var m = TOOL_META[t[0]] || { icon: '🔧', label: t[0] };
          return '<span class="act-chip">' + m.icon + ' ' + escHtml(m.label) + ' <b>' + t[1] + '</b></span>';
        }).join('')
      : '<span class="small muted">Sin acciones registradas todavía</span>';
    el.innerHTML =
      '<div class="stats-row" style="margin-bottom:8px;">' +
        '<div class="stat-item"><span>Acciones hoy</span><strong style="color:var(--gold)">' + (d.todayTotal || 0) + '</strong></div>' +
        '<div class="stat-item"><span>Acciones total</span><strong>' + (d.grandTotal || 0) + '</strong></div>' +
      '</div>' +
      '<div class="act-chips">' + topHtml + '</div>';
  }
  window.loadAgentActivity = loadAgentActivity;

  // Panel de capacidades: lista las tools del agente (con SPEC) + botón "Disparar".
  async function toggleAgentTools(agent) {
    var el = document.getElementById(agent + '-tools-area');
    if (!el) return;
    if (el.style.display !== 'none') { el.style.display = 'none'; return; }
    el.style.display = '';
    el.innerHTML = '<div class="skeleton skeleton-block" style="height:60px;"></div>';
    var d = await apiFetch('/agents/tools/' + agent);
    var tools = (d && !d.__error && d.ok && Array.isArray(d.tools)) ? d.tools : [];
    AGENT_SPECS[agent] = {};
    tools.forEach(function (t) { AGENT_SPECS[agent][t.name] = t; });
    if (!tools.length) {
      el.innerHTML = '<div class="small muted" style="line-height:1.6;">' +
        (agent === 'bambi'
          ? '🦌 Bambi es <b>conversacional</b>: no usa herramientas del registry. Sus capacidades: atención 24/7 a huéspedes, escalado a Franco y transcripción de audios (Whisper). Probalo desde el chat de abajo.'
          : 'Este agente no tiene herramientas habilitadas.') + '</div>';
      return;
    }
    el.innerHTML =
      '<div style="' + AE_LABEL + '">Herramientas (' + tools.length + ') — tocá una para dispararla (pide confirmación)</div>' +
      '<div class="tools-chips">' + tools.map(function (t) {
        var m = TOOL_META[t.name] || { icon: '🔧', label: t.name, risk: 'write' };
        var rk = RISK_META[m.risk] || RISK_META.write;
        var desc = (t.description || '').split('\n')[0].slice(0, 140);
        return '<button class="tool-chip" onclick="openToolForm(\'' + agent + '\',\'' + t.name + '\')" title="' + escHtml(desc) + ' · ' + rk.tag + '" aria-label="' + escHtml(m.label) + '">' +
            '<span class="tc-ico">' + m.icon + '</span>' +
            '<span class="tc-label">' + escHtml(m.label) + '</span>' +
            '<span class="tc-risk" style="background:' + rk.color + '" aria-hidden="true"></span>' +
          '</button>';
      }).join('') + '</div>' +
      '<div class="small muted" style="margin-top:8px;display:flex;gap:12px;font-size:.66rem;">' +
        '<span><i style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--ok);margin-right:4px;"></i>lectura</span>' +
        '<span><i style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--gold);margin-right:4px;"></i>escritura</span>' +
        '<span><i style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--warn);margin-right:4px;"></i>envío</span>' +
      '</div>';
  }
  window.toggleAgentTools = toggleAgentTools;

  // Arma el form del modal a partir del SPEC.parameters de la tool.
  function openToolForm(agent, name) {
    var spec = (AGENT_SPECS[agent] && AGENT_SPECS[agent][name]) || null;
    var m = TOOL_META[name] || { icon: '🔧', label: name, risk: 'write' };
    var params = (spec && spec.parameters) || { properties: {}, required: [] };
    var props = params.properties || {};
    var required = params.required || [];
    var fields = Object.keys(props).map(function (key) {
      var p = props[key] || {};
      var req = required.indexOf(key) >= 0;
      var hint = escHtml(p.description || '');
      var id = 'tf-' + agent + '-' + name + '-' + key;
      var input;
      if (Array.isArray(p.enum)) {
        input = '<select class="input" id="' + id + '" data-key="' + key + '" data-type="string">' +
          (req ? '' : '<option value="">—</option>') +
          p.enum.map(function (o) { return '<option>' + escHtml(o) + '</option>'; }).join('') + '</select>';
      } else if (p.type === 'boolean') {
        input = '<select class="input" id="' + id + '" data-key="' + key + '" data-type="boolean"><option value="">—</option><option value="true">true</option><option value="false">false</option></select>';
      } else if (p.type === 'integer' || p.type === 'number') {
        input = '<input class="input" id="' + id + '" data-key="' + key + '" data-type="number" type="number" placeholder="' + hint + '">';
      } else {
        input = '<input class="input" id="' + id + '" data-key="' + key + '" data-type="string" placeholder="' + hint + '">';
      }
      return '<div style="margin-bottom:8px;"><label class="tf-label" for="' + id + '">' + escHtml(key) +
        (req ? ' <span style="color:var(--danger)">*</span>' : '') + '</label>' + input +
        (hint ? '<div class="tf-hint">' + hint + '</div>' : '') + '</div>';
    }).join('') || '<div class="small muted">Esta herramienta no requiere parámetros.</div>';

    var warn = (m.risk === 'send')
      ? '<div class="tool-warn">⚠️ Acción real. Cualquier envío de WhatsApp va a <b>tu número</b> (nunca a un cliente). El email se arma como <b>borrador</b> y no sale hasta confirmar.</div>'
      : (m.risk === 'write')
        ? '<div class="tool-warn">⚠️ Acción real — escribe en tus sistemas (Notion / Drive / Sheet). Pide confirmación.</div>'
        : '<div class="tool-ok">🔍 Solo lectura — seguro.</div>';

    var body = document.getElementById('modal-tool-body');
    body.innerHTML =
      '<h3 style="margin-top:0;">' + m.icon + ' ' + escHtml(m.label) + ' <span class="small muted">· ' + escHtml(agent) + '</span></h3>' +
      '<div class="small muted" style="margin-bottom:10px;line-height:1.5;">' + escHtml((spec && spec.description || '').slice(0, 240)) + '</div>' +
      warn +
      '<div class="stack" id="tf-fields-' + agent + '-' + name + '" style="margin-top:10px;">' + fields + '</div>' +
      '<div id="tool-result" class="tool-result" style="display:none;"></div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;">' +
        '<button class="btn btn-ghost" onclick="hideModal(\'modal-tool\')">Cancelar</button>' +
        '<button class="btn btn-gold" id="tf-run" onclick="submitToolForm(\'' + agent + '\',\'' + name + '\',' + (m.risk !== 'read') + ')">Ejecutar</button>' +
      '</div>';
    showModal('modal-tool');
  }
  window.openToolForm = openToolForm;

  async function submitToolForm(agent, name, needsConfirm) {
    var wrap = document.getElementById('tf-fields-' + agent + '-' + name);
    if (!wrap) return;
    var args = {};
    wrap.querySelectorAll('[data-key]').forEach(function (inp) {
      var key = inp.getAttribute('data-key'), type = inp.getAttribute('data-type');
      var v = (inp.value || '').trim();
      if (v === '') return;
      if (type === 'number') { var n = parseFloat(v); if (!isNaN(n)) args[key] = n; }
      else if (type === 'boolean') { args[key] = (v === 'true'); }
      else args[key] = v;
    });
    if (needsConfirm && !window.confirm('¿Ejecutar «' + name + '» en ' + agent + '? Es una acción real.')) return;
    var runBtn = document.getElementById('tf-run');
    var resEl = document.getElementById('tool-result');
    if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Ejecutando…'; }
    var d = await apiFetch('/agents/tool/' + agent, { method: 'POST', body: JSON.stringify({ tool: name, args: args }) });
    if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Ejecutar'; }
    if (!resEl) return;
    resEl.style.display = '';
    if (!d || d.__error || !d.ok) {
      resEl.className = 'tool-result err';
      resEl.textContent = '❌ ' + ((d && (d.error || d.detail || d.__error)) || 'error');
      return;
    }
    var r = d.result || {};
    var okRun = r.ok !== false;
    resEl.className = 'tool-result ' + (okRun ? 'ok' : 'warn');
    resEl.innerHTML = (okRun ? '✅ Ejecutado' : '⚠️ ' + escHtml(r.error || r.stage || 'no completado')) +
      '<pre>' + escHtml(JSON.stringify(r, null, 2).slice(0, 1200)) + '</pre>';
    if (okRun) { toast(name + ' ejecutado', 'ok'); loadAgentActivity(agent); }
  }
  window.submitToolForm = submitToolForm;

  /* ─── UTIL ───────────────────────────────────────────────────────── */
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ─── INIT ───────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    // Initial load: home view is active by default
    initNavGroups(); // S80B1: aplica estado colapsado guardado del sidebar
    loadHome();

    // Update home-date badge with current date
    var dateEl = document.getElementById('home-date');
    if (dateEl) {
      var now = new Date();
      dateEl.textContent = 'v0.3 · ' + now.toLocaleDateString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: 'numeric', month: 'short'
      });
    }

    // Refresh pulso signals after other data loads (brief delay)
    setTimeout(loadPulso, 4000);

    // Periodic refresh
    setInterval(loadSystemBar, 60000);   // system bar every 60s
    setInterval(loadDocker,    120000);  // docker every 2min
    setInterval(loadGauges,    90000);   // gauges every 90s
    setInterval(loadPulso,     120000);  // pulso every 2min (reads cached DOM values)
    setInterval(loadBrainCard, 180000);  // brain card every 3min
    setInterval(loadIAChart,   300000);  // IA chart every 5min
  });

})();

/* ─── S47: WhatsApp App ⇄ Web (pedido Franco: poder abrir la línea Business) ─── */
window.waHref = function (tel) {
  var n = String(tel || '').replace(/[^0-9]/g, '');
  return (localStorage.getItem('waMode') === 'web' ? 'https://web.whatsapp.com/send?phone=' : 'https://wa.me/') + n;
};
window.waToggle = function () {
  var nuevo = localStorage.getItem('waMode') === 'web' ? 'app' : 'web';
  localStorage.setItem('waMode', nuevo);
  var b = document.getElementById('sys-wa-mode');
  if (b) b.textContent = nuevo === 'web' ? 'WA: Web' : 'WA: App';
  if (window.toast) toast(nuevo === 'web' ? 'Los botones 💬 abren WhatsApp WEB (logueá ahí tu línea Business)' : 'Los botones 💬 abren la APP de WhatsApp instalada', 'ok');
};
(function () {
  var b = document.getElementById('sys-wa-mode');
  if (b) b.textContent = localStorage.getItem('waMode') === 'web' ? 'WA: Web' : 'WA: App';
})();

/* ─── S48: Los 250 — listado completo con etiquetas (pedido Franco) ─── */
window.toggleLos250Lista = async function () {
  var box = document.getElementById('crm-250-lista');
  if (!box) return;
  if (box.innerHTML) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="small muted" style="margin-top:8px;">Cargando…</div>';
  var d = await apiFetch('/crm/contactos');
  if (!d || !d.ok) { box.innerHTML = '<div class="small muted">No pude leer contactos.</div>'; return; }
  var orden = { A: 0, B: 1, C: 2, D: 3 };
  var list = (d.contactos || []).slice().sort(function (a, b) {
    var ea = orden[a.etiqueta] != null ? orden[a.etiqueta] : 9;
    var eb = orden[b.etiqueta] != null ? orden[b.etiqueta] : 9;
    return ea - eb || (a.nombre || '').localeCompare(b.nombre || '');
  });
  var colorE = { A: 'var(--ok)', B: 'var(--gold)', C: 'var(--warn)', D: 'var(--muted)' };
  var sinEtiqueta = list.filter(function (c) { return !c.etiqueta; }).length;
  box.innerHTML = '<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px;">' +
    '<div style="font-size:.68rem;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em;">Listado completo (' + list.length + ')' + (sinEtiqueta ? ' — ' + sinEtiqueta + ' sin etiqueta A/B/C/D: click y etiquetalos' : '') + '</div>' +
    '<div style="max-height:340px;overflow-y:auto;">' +
    list.map(function (c) {
      return '<div onclick="abrirContactoEdit(\'' + c.id + '\')" style="display:flex;gap:8px;align-items:center;padding:4px 6px;border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer;font-size:.78rem;" title="Click para editar (etiqueta, etapas, NURC/PUFA)">' +
        '<strong style="width:18px;text-align:center;color:' + (colorE[c.etiqueta] || 'var(--muted)') + ';font-family:var(--mono);">' + (c.etiqueta || '·') + '</strong>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(c.nombre) + '</span>' +
        (c.tipo ? '<span class="badge badge-muted">' + escHtml(c.tipo) + '</span>' : '') +
        (c.en250 ? '<span title="En los 250">⭐</span>' : '') +
        '<span style="font-family:var(--mono);font-size:.64rem;color:var(--muted);">' + (c.ultimaInteraccion || '') + '</span>' +
      '</div>';
    }).join('') + '</div></div>';
};

/* ─── S48: tasación PRE-LLENADA desde PDF / audio / texto (pedido Franco: no cargar a mano) ─── */
window.tasacionDesdeArchivo = function (file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) return toast('Máx 20MB', 'err');
  toast('🧠 Extrayendo datos de ' + file.name + '… (~20-40s)', 'ok');
  var fr = new FileReader();
  fr.onload = async function () {
    var d = await apiFetch('/crm/ficha-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, base64: String(fr.result) }) });
    tasacionAplicarFicha(d);
  };
  fr.readAsDataURL(file);
};
window.tasacionDesdeTexto = async function () {
  var ta = document.getElementById('ts-imp-texto');
  var texto = ta ? ta.value.trim() : '';
  if (texto.length < 30) return toast('Pegá la ficha o descripción completa', 'err');
  toast('🧠 Extrayendo datos… (~20s)', 'ok');
  var d = await apiFetch('/crm/ficha-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: texto }) });
  if (ta) ta.value = '';
  tasacionAplicarFicha(d);
};
// S51 F7: grabar audio directo para pre-llenar la tasación (sin subir archivo)
window.tasacionGrabarAudio = function (btn) {
  grabarAudioYProcesar(btn, async function (b64) {
    toast('🧠 Transcribiendo y extrayendo datos… (~20-40s)', 'ok');
    var d = await apiFetch('/crm/ficha-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: 'nota.webm', base64: b64 }) });
    tasacionAplicarFicha(d);
  });
};
window.tasacionAplicarFicha = function (d) {
  if (!d || !d.ok) return toast('Error: ' + ((d && d.error) || (d && d.__error ? 'técnico ' + d.__error : 'no pude extraer')), 'err');
  var f = d.ficha || {};
  var set = function (id, v) { var e = document.getElementById(id); if (e && v != null && v !== '') e.value = String(v); };
  set('ts-titulo', f.propiedad); set('ts-direccion', f.direccion); set('ts-barrio', f.barrio);
  set('ts-tipo', f.tipoPropiedad); set('ts-m2cub', f.m2Cubiertos); set('ts-m2semi', f.m2Semicubiertos);
  set('ts-m2terraza', f.m2Descubiertos); set('ts-antiguedad', f.antiguedad); set('ts-pisosedif', f.pisosEdificio);
  set('ts-orientacion', f.orientacion); set('ts-disposicion', f.disposicion);
  var piso = parseInt(String(f.pisoDepto || '').replace(/[^0-9]/g, ''), 10);
  if (piso) set('ts-piso', piso);
  var co = document.getElementById('ts-cochera'); if (co) co.checked = !!f.cochera;
  var dud = f.camposDudosos || [];
  toast(dud.length ? '✅ Pre-llenada — ⚠ revisá: ' + dud.join(', ') : '✅ Tasación pre-llenada — revisá y creá', 'ok');
};

/* ════════════ S51 F1: HERMES DOCK FLOTANTE GLOBAL ════════════ */
(function () {
  var CTX_LABEL = {
    resumen: 'Prioridades del día', captacion: 'Propietarios a mover', demanda: 'Leads a escribir',
    operaciones: 'Operaciones y cierres', propiedades: 'Qué falta por propiedad', contactos: 'Clasificá y seguí',
    documentos: 'Documentos y cargas', tasaciones: 'Tasaciones y captación'
  };
  var CONSOLE_CHIPS = ['¿Qué tengo que hacer hoy?', '¿Qué propiedades están trabadas?', '¿Qué contactos debería promover?', 'Mostrame riesgos documentales', '¿Dónde está la plata en juego?'];

  function activeCrmTab() {
    var el = document.querySelector('.crm-tab.active');
    return el ? el.id.replace('ct-', '') : 'resumen';
  }
  // S80B3A: contexto del Hermes Dock por VISTA (los módulos promovidos en B2A no son crm-tabs)
  function crmCtxKey() {
    var map = { 'view-documentos': 'documentos', 'view-tasaciones': 'tasaciones', 'view-operaciones': 'operaciones' };
    for (var id in map) { var v = document.getElementById(id); if (v && v.classList.contains('active')) return map[id]; }
    return activeCrmTab();
  }
  function inCrm() {
    return ['view-gebroker', 'view-documentos', 'view-tasaciones', 'view-operaciones'].some(function (id) {
      var v = document.getElementById(id); return v && v.classList.contains('active');
    });
  }

  // Polling liviano: muestra/oculta el dock según sección + re-renderiza el panel al cambiar de sub-tab.
  // Desacoplado de nav()/crmTab() para no tocar esas funciones (menor riesgo).
  var lastTab = null, lastInCrm = null;
  function tick() {
    var dock = document.getElementById('hermes-dock');
    if (!dock) return;
    var here = inCrm();
    if (here !== lastInCrm) {
      dock.style.display = here ? '' : 'none';
      lastInCrm = here;
      if (here) loadHermesPulse();
    }
    if (here) {
      var t = crmCtxKey();
      if (t !== lastTab) {
        lastTab = t;
        var ctx = document.getElementById('hermes-panel-ctx');
        if (ctx) ctx.textContent = CTX_LABEL[t] || 'Copiloto';
        if (document.getElementById('hermes-panel').style.display !== 'none') renderHermesPanel();
      }
    }
  }
  setInterval(tick, 1000);

  window.hermesPulse = null;
  async function loadHermesPulse() {
    var d = await apiFetch('/crm/pulse');
    if (!d || !d.ok) return;
    window.hermesPulse = d;
    var txt = document.getElementById('hermes-mini-txt');
    if (txt) txt.innerHTML = 'Hermes · <b style="color:var(--gold)">' + d.recomendaciones + '</b> rec · <b style="color:var(--danger)">' + d.bloqueos + '</b> bloq · <b style="color:var(--warn)">' + d.urgentes + '</b> urg';
    if (document.getElementById('hermes-panel').style.display !== 'none') renderHermesPanel();
  }
  window.loadHermesPulse = loadHermesPulse;

  function dockState(s) { try { localStorage.setItem('hermesDockState', s); } catch (e) {} }
  window.hermesDockOpen = function () {
    document.getElementById('hermes-mini').style.display = 'none';
    document.getElementById('hermes-panel').style.display = '';
    dockState('open');
    if (!window.hermesPulse) loadHermesPulse(); else renderHermesPanel();
  };
  window.hermesDockCollapse = function () {
    document.getElementById('hermes-panel').style.display = 'none';
    document.getElementById('hermes-mini').style.display = '';
    dockState('mini');
  };

  function itemRow(icon, nombre, motivo, accion) {
    return '<div class="hermes-item"><span>' + icon + '</span><span style="flex:1;"><b>' + escHtml(nombre) + '</b>' + (motivo ? '<br><span style="color:var(--muted);font-size:.7rem;">' + escHtml(motivo) + '</span>' : '') + '</span>' + (accion || '') + '</div>';
  }
  function renderHermesPanel() {
    var body = document.getElementById('hermes-panel-body');
    var p = window.hermesPulse;
    if (!body) return;
    if (!p) { body.innerHTML = '<div class="skeleton skeleton-block" style="height:90px;"></div>'; return; }
    var tab = crmCtxKey();
    var det = p.detalle || {};
    var html = '<div class="hermes-pulse-row">' +
      '<div class="pulse-kpi"><strong style="color:var(--gold)">' + p.recomendaciones + '</strong><small>rec</small></div>' +
      '<div class="pulse-kpi"><strong style="color:var(--danger)">' + p.bloqueos + '</strong><small>bloq</small></div>' +
      '<div class="pulse-kpi"><strong style="color:var(--warn)">' + p.urgentes + '</strong><small>urg</small></div></div>';
    var items = '';
    if (tab === 'operaciones') {
      (det.bloqueosLista || []).filter(function (b) { return b.tipo === 'operacion'; }).forEach(function (b) { items += itemRow('🔴', b.nombre, 'Trabada: ' + (b.motivo || ''), ''); });
      if ((det.honorariosPipeline || 0) > 0) items += itemRow('💰', 'Honorarios en pipeline', 'USD ' + Number(det.honorariosPipeline).toLocaleString('es-AR'), '');
    } else if (tab === 'propiedades') {
      (det.bloqueosLista || []).filter(function (b) { return b.tipo === 'propiedad'; }).forEach(function (b) { items += itemRow('🏢', b.nombre, b.motivo, b.id ? '<button class="btn btn-xs btn-ghost" onclick="abrirLegajo(\'' + b.id + '\')">abrir</button>' : ''); });
    } else if (tab === 'contactos') {
      items += itemRow('🧹', (det.sinClasificar || 0) + ' sin clasificar', 'Refiná la base cruda de WhatsApp', '');
      (det.recomendados || []).slice(0, 4).forEach(function (r) { items += itemRow('⭐', r.nombre, r.motivo, r.telefono ? '<a class="btn btn-xs btn-ghost" href="' + waHref(r.telefono) + '" target="_blank" rel="noopener">💬</a>' : ''); });
    } else if (tab === 'documentos') {
      items += itemRow('🗂', (det.sinClasificar || 0) + ' sin clasificar', 'Cargas pendientes de validar en Doc Inbox', '');
    } else if (tab === 'tasaciones') {
      items += itemRow('🧮', 'Tasaciones', 'Comparables y captación — abrí una tasación para el detalle', '');
    } else {
      // resumen / captacion / demanda → recomendados del día
      (det.recomendados || []).forEach(function (r) { items += itemRow('⭐', r.nombre, r.motivo, r.telefono ? '<a class="btn btn-xs btn-ghost" href="' + waHref(r.telefono) + '" target="_blank" rel="noopener">💬</a>' : ''); });
      (det.urgentesLista || []).slice(0, 3).forEach(function (u) { items += itemRow(u.tipo === 'firma' ? '✍️' : u.tipo === 'reporte' ? '📊' : '⏰', u.nombre, u.tipo + (u.cuando ? ' · ' + u.cuando : ''), ''); });
    }
    body.innerHTML = html + (items || '<div class="small muted" style="padding:6px 0;">Todo al día acá. ✅</div>');
  }
  window.renderHermesPanel = renderHermesPanel;

  /* ── Hermes Console (chat global) ── */
  window.hermesConsoleOpen = function () {
    showModal('hermes-console');
    var chips = document.getElementById('hermes-console-chips');
    if (chips && !chips.dataset.ready) {
      chips.innerHTML = CONSOLE_CHIPS.map(function (c) { return '<span class="hermes-chip" onclick="hermesConsoleAsk(\'' + c.replace(/'/g, "\\'") + '\')">' + escHtml(c) + '</span>'; }).join('');
      chips.dataset.ready = '1';
    }
    var log = document.getElementById('hermes-console-log');
    if (log && !log.innerHTML) log.innerHTML = '<div class="small muted">Preguntale a Hermes sobre TODO tu brokerage — por texto o 🎤 voz. Tocá una sugerencia o escribí.</div>';
  };
  window.hermesConsoleAsk = function (q) {
    document.getElementById('hermes-console-input').value = q;
    hermesConsoleSend();
  };
  function consolePintarUsuario(txt) {
    var log = document.getElementById('hermes-console-log');
    if (log) { log.innerHTML += '<div style="text-align:right;margin:5px 0;"><span style="background:rgba(212,166,64,0.15);border-radius:8px;padding:5px 9px;display:inline-block;">' + escHtml(txt) + '</span></div><div id="hc-wait" class="small muted">Hermes está pensando…</div>'; log.scrollTop = log.scrollHeight; }
  }
  function consolePintarRespuesta(d) {
    var log = document.getElementById('hermes-console-log');
    var w = document.getElementById('hc-wait'); if (w) w.remove();
    var txt = (d && d.respuesta) || (d && d.error) || (d && d.__error ? '⚠ Error técnico (' + d.__error + ')' : 'No pude responder.');
    if (log) { log.innerHTML += '<div style="display:flex;gap:7px;align-items:flex-start;margin:5px 0;"><img src="/images/hermes-avatar.webp" alt="" style="width:22px;height:22px;border-radius:50%;object-fit:cover;flex-shrink:0;margin-top:2px;" onerror="this.outerHTML=\'🪽\'"><span style="background:rgba(94,200,216,0.12);border-radius:8px;padding:6px 10px;display:inline-block;white-space:pre-wrap;">' + escHtml(txt) + '</span></div>'; log.scrollTop = log.scrollHeight; }
  }
  window.hermesConsoleSend = async function () {
    var inp = document.getElementById('hermes-console-input');
    var q = inp ? inp.value.trim() : '';
    if (!q) return;
    inp.value = '';
    consolePintarUsuario(q);
    var d = await apiFetch('/crm/hermes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pregunta: q }) });
    consolePintarRespuesta(d);
  };
  window.hermesConsoleAudio = function (btn) {
    grabarAudioYProcesar(btn, async function (b64) {
      var log = document.getElementById('hermes-console-log');
      if (log) { log.innerHTML += '<div style="text-align:right;margin:5px 0;"><span id="hc-audiobub" style="background:rgba(212,166,64,0.15);border-radius:8px;padding:5px 9px;display:inline-block;">🎤 <i>transcribiendo…</i></span></div><div id="hc-wait" class="small muted">Hermes está escuchando…</div>'; log.scrollTop = log.scrollHeight; }
      var d = await apiFetch('/crm/hermes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: b64, filename: 'nota.webm' }) });
      var bub = document.getElementById('hc-audiobub'); if (bub) { bub.innerHTML = '🎤 ' + escHtml((d && d.transcripcion) || '(no entendí)'); bub.removeAttribute('id'); }
      consolePintarRespuesta(d);
    });
  };

  // restaurar estado del dock al cargar
  try { if (localStorage.getItem('hermesDockState') === 'open') { setTimeout(function () { if (inCrm()) hermesDockOpen(); }, 1200); } } catch (e) {}
})();

/* ════════════ S52: DOC INBOX — bandeja de documentos capturados de WhatsApp ════════════ */
window.loadDocInbox = async function () {
  var el = document.getElementById('doc-inbox');
  if (!el) return;
  var d = await apiFetch('/crm/doc-inbox');
  if (!d || d.__error || !d.ok) { el.innerHTML = '<span class="small muted">No pude leer el Doc Inbox.</span>'; return; }
  var cnt = document.getElementById('doc-inbox-count');
  if (cnt) cnt.textContent = (d.count || 0) + ' en bandeja';
  // cache de propiedades para los dropdowns de asignación
  window.docInboxProps = ((window.crmPipelineCache || {}).propiedades || {}).items || [];
  var html = '';
  var pend = d.pendientesRevision || [], sin = d.sinClasificar || [];
  if (pend.length) {
    html += '<div style="font-size:.7rem;color:var(--gold);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Pendientes de revisión (' + pend.length + ') — Hermes ya los asoció, validá vos</div>';
    html += pend.map(function (x) {
      return '<div style="border:1px solid ' + (x.redFlags ? 'var(--danger)' : 'rgba(255,255,255,0.08)') + ';border-radius:10px;padding:8px 11px;margin-bottom:7px;background:rgba(255,255,255,0.015);">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<strong style="font-size:.82rem;">' + escHtml(x.filename) + '</strong>' +
          (x.tipo ? '<span class="badge badge-muted">' + escHtml(x.tipo) + '</span>' : '') +
          '<span class="badge badge-metro">→ ' + escHtml(x.propiedad || '—') + '</span>' +
          (x.confianza ? '<span style="font-size:.66rem;color:var(--muted);">conf. ' + escHtml(x.confianza) + '</span>' : '') +
          (x.driveLink ? '<a href="' + escHtml(x.driveLink) + '" target="_blank" rel="noopener" style="color:var(--muted);font-size:.72rem;">↗ Drive</a>' : '') +
        '</div>' +
        (x.redFlags ? '<div style="font-size:.7rem;color:var(--danger);margin-top:4px;">⚠️ ' + escHtml(x.redFlags) + '</div>' : '') +
        '<div class="btn-row" style="margin-top:6px;">' +
          '<button class="btn btn-gold btn-sm" onclick="docInboxValidar(\'' + x.id + '\',\'' + (x.tipo || '') + '\')" title="Validar: confirmá que el documento está OK (verde = validado)">✓ Validar</button>' +
          (x.propiedadId ? '<button class="btn btn-ghost btn-sm" onclick="abrirLegajo(\'' + x.propiedadId + '\')">📂 Legajo</button>' : '') +
          '<button class="btn btn-ghost btn-sm" onclick="docInboxDescartar(\'' + x.id + '\')">🗑 Descartar</button>' +
        '</div></div>';
    }).join('');
  }
  if (sin.length) {
    html += '<div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin:10px 0 6px;">Sin clasificar (' + sin.length + ') — asignalos a una propiedad</div>';
    html += sin.map(function (x) {
      var opts = '<option value="">— elegir propiedad —</option>' + (window.docInboxProps || []).map(function (p) { return '<option value="' + p.id + '">' + escHtml(p.propiedad) + '</option>'; }).join('');
      return '<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:8px 11px;margin-bottom:7px;">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<strong style="font-size:.82rem;">' + escHtml(x.filename) + '</strong>' +
          (x.tipo ? '<span class="badge badge-muted">' + escHtml(x.tipo) + '</span>' : '') +
          (x.remitente ? '<span style="font-size:.68rem;color:var(--muted);">de ' + escHtml(x.remitente) + '</span>' : '') +
          (x.driveLink ? '<a href="' + escHtml(x.driveLink) + '" target="_blank" rel="noopener" style="color:var(--muted);font-size:.72rem;">↗ Drive</a>' : '') +
        '</div>' +
        '<div class="btn-row" style="margin-top:6px;">' +
          '<select class="input" id="di-prop-' + x.id + '" style="width:auto;font-size:.74rem;padding:3px 8px;">' + opts + '</select>' +
          '<button class="btn btn-gold btn-sm" onclick="docInboxAsignar(\'' + x.id + '\')">Asignar</button>' +
          '<button class="btn btn-ghost btn-sm" title="Descartar (no se borra, queda en el historial)" onclick="docInboxDescartar(\'' + x.id + '\')">🗑 Descartar</button>' +
        '</div></div>';
    }).join('');
  }
  el.innerHTML = html || '<div class="small muted">Bandeja vacía. Los documentos que te lleguen por WhatsApp aparecen acá automáticamente.</div>';
};

var DOC_LEGALES_AUD = ['Escritura', 'Testimonio / Declaratoria / Partición', 'Certif. dominio', 'Inhibiciones', 'Poder']; // confirmar al validar legales
window.docInboxValidar = async function (id, tipo) {
  if (DOC_LEGALES_AUD.indexOf(tipo) >= 0 && !confirm('⚠️ ' + tipo + ' es LEGAL. ¿Confirmás que lo revisaste y está OK para marcarlo VALIDADO?')) return;
  var d = await apiFetch('/crm/doc-inbox/validar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) });
  if (d && d.ok) { toast('🟢 Validado', 'ok'); loadDocInbox(); } else toast('Error al validar', 'err');
};
// S62A.2: validar/desvalidar desde la Auditoría (confirma legales · distingue recibido/validado)
window.docAuditValidar = async function (id, tipo) {
  if (DOC_LEGALES_AUD.indexOf(tipo) >= 0 && !confirm('⚠️ ' + tipo + ' es un documento LEGAL.\n\n¿Confirmás que lo revisaste y está OK para marcarlo VALIDADO? (🟢 verde = validado legalmente.)')) return;
  var d = await apiFetch('/crm/doc-inbox/validar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) });
  if (d && d.ok) { toast('🟢 Validado', 'ok'); loadDocAuditoria(); } else toast('Error al validar', 'err');
};
window.docAuditDesvalidar = async function (id) {
  var d = await apiFetch('/crm/doc-inbox/desvalidar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) });
  if (d && d.ok) { toast('↩ Vuelto a pendiente de revisión', 'ok'); loadDocAuditoria(); } else toast('Error al desvalidar', 'err');
};
window.docInboxAsignar = async function (id) {
  var sel = document.getElementById('di-prop-' + id);
  var propiedadId = sel ? sel.value : '';
  if (!propiedadId) return toast('Elegí una propiedad', 'err');
  var d = await apiFetch('/crm/doc-inbox/asignar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, propiedadId: propiedadId }) });
  if (d && d.ok) { toast('Asignado — pendiente de revisión', 'ok'); loadDocInbox(); } else toast('Error: ' + ((d && d.error) || 'sin conexión'), 'err');
};
window.docInboxDescartar = async function (id) {
  var d = await apiFetch('/crm/doc-inbox/descartar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) });
  if (d && d.ok) { toast('Descartado', 'ok'); loadDocInbox(); } else toast('Error al descartar', 'err');
};

/* ════════════ S52.1: AUDITORÍA DE CARGAS (depurador documental) ════════════ */
var DOC_ESTADO_COLOR = {
  'Validado': 'var(--ok)', 'Asociado · pendiente de revisión': 'var(--gold)', 'Bloqueante detectado': 'var(--danger)',
  'Sin clasificar': 'var(--muted)', 'Posible duplicado': '#a78bfa', 'Descartado': '#6b7078',
  'Recibido': 'var(--metro)', 'Extraído': 'var(--metro)', 'Analizado IA': 'var(--metro)', 'Requiere revisión': 'var(--warn)', 'Capturado': 'var(--metro)'
};
window.docAuditFiltro = window.docAuditFiltro || 'Todos';
// S58: conteos locales (recalculables sin refetch, para el descarte optimista)
window.docAuditRecount = function () {
  var d = window.docAuditData; if (!d) return;
  var pe = {}; (d.items || []).forEach(function (x) { var e = x.estado || '?'; pe[e] = (pe[e] || 0) + 1; });
  d.porEstado = pe; d.count = (d.items || []).length;
};
window.docAuditActivos = function () {
  var d = window.docAuditData; if (!d) return 0;
  return (d.count || 0) - ((d.porEstado && d.porEstado['Descartado']) || 0);
};
// S58: cabecera (contador + chips de filtro + buscador) — separada para refrescar sin refetch
window.renderDocAuditHead = function () {
  var d = window.docAuditData; if (!d) return;
  var nActivos = docAuditActivos();
  var cnt = document.getElementById('crm-audit-count'); if (cnt) cnt.textContent = nActivos;
  var fbox = document.getElementById('doc-audit-filtros');
  if (!fbox) return;
  var estados = ['Todos'].concat(Object.keys(d.porEstado || {}));
  fbox.innerHTML = estados.map(function (e) {
    var n = e === 'Todos' ? nActivos : d.porEstado[e];
    var on = window.docAuditFiltro === e;
    var lbl = e === 'Descartado' ? '🗑 Descartados' : escHtml(e);
    return '<button class="btn btn-sm ' + (on ? 'btn-gold' : 'btn-ghost') + '" onclick="window.docAuditFiltro=\'' + e.replace(/'/g, '') + '\';renderDocAuditHead();renderDocAuditoria()">' + lbl + ' <b>' + n + '</b></button>';
  }).join('') +
  '<span style="margin-left:auto;display:inline-flex;gap:6px;align-items:center;">' +
    '<input class="input" id="da-prop-buscar" placeholder="🔎 filtrar propiedades del selector…" value="' + escHtml(window.docAuditPropFiltro || '') + '" style="width:200px;font-size:.74rem;padding:3px 8px;" oninput="window.docAuditPropFiltro=this.value;renderDocAuditoria()">' +
    '<button class="btn btn-ghost btn-sm" onclick="loadDocAuditoria()" title="Releer las propiedades del CRM (después de crear una)">↻ Actualizar propiedades</button>' +
  '</span>';
};
window.loadDocAuditoria = async function () {
  var el = document.getElementById('doc-auditoria');
  if (!el) return;
  var d = await apiFetch('/crm/docs-auditoria');
  if (!d || d.__error || !d.ok) { el.innerHTML = '<span class="small muted">No pude leer la auditoría.</span>'; return; }
  window.docAuditData = d;
  window.docAuditProps = d.propiedades || [];
  renderDocAuditHead();
  renderDocAuditoria();
};
// S59: nombre corto del inmueble sugerido/asociado de un doc (para la relación por tanda)
window.docAuditInmueble = function (x) {
  if (x.propiedad) return x.propiedad;
  var s = x.sugerencia;
  if (s && s.direccionInmueble) return s.direccionInmueble + (s.unidad ? ' ' + s.unidad : '');
  return null;
};
// S59: naturaleza HONESTA del doc no clasificado (sin OCR) — del bridge (nota) o derivada del filename
window.docAuditNaturaleza = function (x) {
  if (x.tipo || x.textoSugerencia) return null; // ya marcado o con datos → no hace falta
  // en asociados la "nota" del bridge puede ser análisis legal → derivar por filename (seguro)
  if (!x.propiedadId && x.nota) return x.nota;
  var fn = (x.filename || '').toLowerCase();
  if (/\.(jpe?g|png|webp|gif|heic)$/.test(fn) || fn.indexOf('foto') === 0) return '🖼 Imagen — posible plano (revisar)';
  if (/\.pdf$/.test(fn)) return '📄 PDF escaneado — posible escritura (revisar)';
  return null;
};
// S60: clase del doc no clasificado → acción principal "Marcar como Plano/Escritura" (si aún no tiene tipo)
window.docAuditClase = function (x) {
  if (x.tipo || x.textoSugerencia) return null;
  var fn = (x.filename || '').toLowerCase();
  if (/\.(jpe?g|png|webp|gif|heic)$/.test(fn) || fn.indexOf('foto') === 0) return 'imagen';
  if (/\.pdf$/.test(fn)) return 'pdf';
  return null;
};
// S62B: ¿se puede leer este doc con OCR de Google Drive? (en Drive y aún sin texto extraído:
// legal sin datos, o escaneado/imagen sin clasificar). El Testimonio ya tiene tipo pero no datos → entra.
window.docPuedeOcr = function (x) {
  if (!x.driveLink) return false;                                        // tiene que estar en Drive
  if (x.estado === 'Extraído por OCR · pendiente de revisión') return false; // ya leído por OCR
  if (x.textoSugerencia) return false;                                   // ya tiene datos del inmueble
  var legal = ['Escritura', 'Testimonio / Declaratoria / Partición', 'Certif. dominio', 'Inhibiciones'].indexOf(x.tipo) >= 0;
  return legal || !!docAuditClase(x);
};
// S62B: leer un escaneado/imagen con el OCR de Google Drive (manual). NO valida nada → pendiente de revisión.
window.docAuditOcrDrive = async function (id) {
  if (!confirm('¿Leer este documento con el OCR de Google Drive?\n\nExtrae el texto (titulares, matrícula, partida, preguntas para escribanía…) y lo deja PENDIENTE DE REVISIÓN. No valida nada automáticamente.')) return;
  toast('Leyendo con OCR de Google Drive… (~20-40s)', 'ok');
  var d = await apiFetch('/crm/doc-inbox/ocr-drive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) });
  if (d && d.ok) { toast('🔎 OCR listo: ' + (d.chars || 0) + ' caracteres' + (d.tipo ? ' · ' + d.tipo : '') + ' — pendiente de revisión', 'ok'); loadDocAuditoria(); }
  else toast('OCR: ' + ((d && d.error) || 'no se pudo leer'), 'err');
};
// S59: agrupar por tanda (mismo remitente + ventana ≤5min). Mapa docId → grupo {docs, inmueble, hora, hermanosSinProp}
window.docAuditCalcTandas = function (items) {
  var byId = {};
  var sorted = items.slice().sort(function (a, b) { return (a.remitente || '').localeCompare(b.remitente || '') || (a.creada || '').localeCompare(b.creada || ''); });
  var grupos = [], cur = null;
  sorted.forEach(function (x) {
    var t = Date.parse(x.creada || '') || 0;
    if (cur && cur.rem === (x.remitente || '') && Math.abs(t - cur.lastT) <= 5 * 60 * 1000) { cur.docs.push(x); cur.lastT = t; }
    else { cur = { rem: x.remitente || '', lastT: t, docs: [x] }; grupos.push(cur); }
  });
  grupos.forEach(function (g) {
    var conInm = g.docs.find(function (dd) { return docAuditInmueble(dd); });
    g.inmueble = conInm ? docAuditInmueble(conInm) : null;
    g.hora = (g.docs[0].creada || '').slice(11, 16);
    g.hermanosSinProp = g.docs.filter(function (dd) { return !dd.propiedadId && !dd.puedeCrearPropiedad; }).map(function (dd) { return dd.id; });
    g.docs.forEach(function (dd) { byId[dd.id] = g; });
  });
  return byId;
};
window.renderDocAuditoria = function () {
  var el = document.getElementById('doc-auditoria'); var d = window.docAuditData;
  if (!el || !d) return;
  // S58: "Todos" = activos (oculta Descartados); el chip "🗑 Descartados" los muestra
  var items = (d.items || []).filter(function (x) { return window.docAuditFiltro === 'Todos' ? x.estado !== 'Descartado' : x.estado === window.docAuditFiltro; });
  if (!items.length) {
    var hayDesc = (d.porEstado && d.porEstado['Descartado']) || 0;
    var msg = window.docAuditFiltro !== 'Todos' ? 'Sin cargas en estado "' + escHtml(window.docAuditFiltro) + '"'
      : (hayDesc ? 'No hay cargas activas. Hay ' + hayDesc + ' descartada(s) — tocá «🗑 Descartados» para verlas.' : 'Sin cargas todavía. Lo que entre por WhatsApp aparece acá.');
    el.innerHTML = '<div class="small muted">' + msg + '</div>'; return;
  }
  var pf = (window.docAuditPropFiltro || '').toLowerCase();
  var propsFiltradas = (window.docAuditProps || []).filter(function (p) { return !pf || (p.nombre || '').toLowerCase().indexOf(pf) >= 0; });
  var tandas = docAuditCalcTandas(items); // S59
  var TIPOS_MARCAR = ['Escritura', 'Plano', 'ABL', 'Expensas', 'DNI/CUIT', 'Reglamento', 'Certif. dominio', 'Poder', 'Fotos', 'Contrato', 'Otro'];
  el.innerHTML = '<div style="max-height:60vh;overflow-y:auto;">' + items.map(function (x) {
    var col = DOC_ESTADO_COLOR[x.estado] || 'var(--muted)';
    var opts = '<option value="">— reasignar a… —</option>' + propsFiltradas.map(function (p) { return '<option value="' + p.id + '"' + (p.id === x.propiedadId ? ' selected' : '') + '>' + escHtml(p.nombre) + '</option>'; }).join('');
    var fecha = (x.creada || '').slice(0, 16).replace('T', ' ');
    var g = tandas[x.id] || {}; var enTanda = (g.docs || []).length > 1; // S59
    var nat = docAuditNaturaleza(x);
    var clase = docAuditClase(x); // S60: imagen → Marcar como Plano · pdf → Marcar como Escritura
    var hermanos = (g.hermanosSinProp || []).filter(function (hid) { return hid !== x.id; });
    var tipoSel = '<select class="input" title="Marcar el tipo a mano (para escaneados/imágenes que no se pudieron leer)" style="width:auto;font-size:.72rem;padding:2px 7px;" onchange="if(this.value)docAuditMarcarTipo(\'' + x.id + '\',this.value)"><option value="">🏷 Marcar tipo…</option>' + TIPOS_MARCAR.map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select>';
    return '<div style="border:1px solid rgba(255,255,255,0.07);border-left:3px solid ' + col + ';border-radius:9px;padding:8px 11px;margin-bottom:7px;background:rgba(255,255,255,0.012);">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
        '<strong style="font-size:.82rem;">' + escHtml(x.filename) + '</strong>' +
        '<span class="badge" style="border:1px solid ' + col + '66;color:' + col + ';">' + escHtml(x.estado) + '</span>' +
        (x.tipo ? '<span class="badge badge-muted">' + escHtml(x.tipo) + '</span>' : '') +
        (x.propiedad ? '<span class="badge badge-metro">→ ' + escHtml(x.propiedad) + '</span>' : '') +
        (enTanda ? '<span class="badge" style="border:1px solid #c9a86144;color:#c9a861;" title="Llegaron juntos: mismo remitente y horario (revisar como paquete)">🧩 Tanda de ' + g.docs.length + (g.hora ? ' · ' + g.hora : '') + '</span>' : '') +
        (x.confianza ? '<span style="font-size:.64rem;color:var(--muted);">conf. ' + escHtml(x.confianza) + '</span>' : '') +
        '<span style="margin-left:auto;font-size:.64rem;color:var(--muted);font-family:var(--mono);">' + escHtml(x.fuente || '') + ' · ' + fecha + (x.remitente ? ' · ' + escHtml(x.remitente) : '') + '</span>' +
      '</div>' +
      // S55: sugerencia editorial de Hermes (dirección detectada del inmueble)
      (x.textoSugerencia ? '<div style="font-size:.74rem;color:#aee4ee;margin-top:5px;">🪽 ' + escHtml(x.textoSugerencia) + '</div>' : '') +
      // S59/S60: naturaleza honesta + aviso de OCR pausado (la UI no promete lectura automática)
      (nat ? '<div style="font-size:.72rem;color:#d9b38c;margin-top:5px;">' + escHtml(nat) +
        '<div style="font-size:.64rem;color:var(--muted);margin-top:1px;">' + (x.driveLink ? '🔎 Tocá «Leer con OCR Drive» para extraer el texto, o marcá el tipo a mano.' : 'Marcá el tipo o asociá a mano.') + '</div></div>' : '') +
      // S59: relación por tanda (solo sugiere, no asocia)
      (enTanda && g.inmueble && !docAuditInmueble(x) ? '<div style="font-size:.72rem;color:#9fd6a0;margin-top:4px;">🔗 Llegó junto con <b>' + escHtml(g.inmueble) + '</b> — revisar antes de asociar</div>' : '') +
      (x.nombreSugerido && x.nombreSugerido !== x.filename ? '<div style="font-size:.66rem;color:var(--muted);margin-top:2px;">Nombre sugerido: <span style="font-family:var(--mono);">' + escHtml(x.nombreSugerido) + '</span></div>' : '') +
      (x.redFlags ? '<div style="font-size:.7rem;color:var(--danger);margin-top:4px;">⚠️ ' + escHtml(x.redFlags) + '</div>' : '') +
      '<div class="btn-row" style="margin-top:6px;">' +
        // S62B: leer escaneado/imagen con el OCR de Google Drive (manual, no automático, no valida solo)
        (docPuedeOcr(x) ? '<button class="btn btn-gold btn-sm" onclick="docAuditOcrDrive(\'' + x.id + '\')" title="Lee el escaneado/imagen con el OCR de Google Drive y extrae los datos (queda pendiente de revisión, no se valida solo)">🔎 Leer con OCR Drive</button>' : '') +
        (x.estado !== 'Validado' && x.propiedadId ? '<button class="btn btn-gold btn-sm" onclick="docAuditValidar(\'' + x.id + '\',\'' + (x.tipo || '') + '\')">✓ Validar</button>' : '') +
        (x.estado === 'Validado' ? '<button class="btn btn-ghost btn-sm" onclick="docAuditDesvalidar(\'' + x.id + '\')" title="Volver a pendiente de revisión (desvalidar)">↩ Desvalidar</button>' : '') +
        // S55/S59: crear propiedad desde el doc; si hay hermanos de tanda, los asocia como pendientes
        (x.puedeCrearPropiedad ? (hermanos.length
          ? '<button class="btn btn-gold btn-sm" onclick="docAuditCrearConTanda(\'' + x.id + '\',\'' + hermanos.join(',') + '\')" title="Crea la propiedad borrador desde este documento y asocia los ' + hermanos.length + ' de la misma tanda como pendientes de revisión">＋ Crear propiedad + asociar tanda (' + hermanos.length + ')</button>'
          : '<button class="btn btn-gold btn-sm" onclick="docAuditCrearPropiedad(\'' + x.id + '\')" title="Crea una propiedad borrador con los datos del documento y la asocia">＋ Crear propiedad desde documento</button>') : '') +
        // S60: acción principal según naturaleza cuando no se pudo leer y no tiene tipo aún
        (clase === 'imagen' ? '<button class="btn btn-gold btn-sm" onclick="docAuditMarcarTipo(\'' + x.id + '\',\'Plano\')" title="Marcarlo como Plano (no se pudo leer automáticamente)">📐 Marcar como Plano</button>' :
         clase === 'pdf' ? '<button class="btn btn-gold btn-sm" onclick="docAuditMarcarTipo(\'' + x.id + '\',\'Escritura\')" title="Marcarlo como Escritura (escaneado, no se pudo leer automáticamente)">📜 Marcar como Escritura</button>' : '') +
        tipoSel +
        '<select class="input" id="da-prop-' + x.id + '" style="width:auto;font-size:.72rem;padding:2px 7px;">' + opts + '</select>' +
        '<button class="btn btn-ghost btn-sm" onclick="docAuditReasignar(\'' + x.id + '\')">Reasignar</button>' +
        // S57/S60: PEGAR texto manual (no reanaliza el archivo ni hace OCR) — solo si NO está asociado (no es acción principal)
        (!x.propiedadId && !x.textoSugerencia ? '<button class="btn btn-ghost btn-sm" onclick="docAuditReanalizar(\'' + x.id + '\')" title="Abre un campo para PEGAR a mano el texto del documento. No lee el archivo, no hace OCR.">📋 Pegar texto manual</button>' : '') +
        (x.propiedadId ? '<button class="btn btn-ghost btn-sm" onclick="docAuditDesasociar(\'' + x.id + '\')" title="Sacar la asociación (vuelve a Sin clasificar)">⊘ Desasociar</button>' : '') +
        (x.driveLink ? '<a class="btn btn-ghost btn-sm" style="text-decoration:none;" href="' + escHtml(x.driveLink) + '" target="_blank" rel="noopener">↗ Drive</a>' : '') +
        (x.propiedadId ? '<button class="btn btn-ghost btn-sm" onclick="abrirLegajo(\'' + x.propiedadId + '\')">📂 Legajo</button>' : '') +
        (x.estado !== 'Descartado' ? '<button class="btn btn-ghost btn-sm" title="Descartar: lo saca de la bandeja activa (no se borra, queda en el historial y permite reenviarlo)" onclick="docAuditDescartar(\'' + x.id + '\')">🗑 Descartar</button>' : '') +
      '</div></div>';
  }).join('') + '</div>';
};
// S59: marcar tipo a mano (escaneados/imágenes que no se pudieron clasificar). Optimista.
window.docAuditMarcarTipo = async function (id, tipo) {
  if (!tipo) return;
  var d = window.docAuditData; var it = d && (d.items || []).find(function (x) { return x.id === id; });
  if (it) { it.tipo = tipo; renderDocAuditoria(); }
  var r = await apiFetch('/crm/doc-inbox/marcar-tipo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, tipo: tipo }) });
  if (r && r.ok) { toast('🏷 Marcado como ' + tipo, 'ok'); }
  else { toast('No se pudo marcar el tipo', 'err'); loadDocAuditoria(); }
};
// S59: crear propiedad desde el ABL + asociar los hermanos de la tanda (escritura/plano) como pendientes
window.docAuditCrearConTanda = async function (id, hermanosCsv) {
  var hermanos = (hermanosCsv || '').split(',').filter(Boolean);
  toast('Creando propiedad borrador y asociando la tanda…', 'ok');
  var r = await apiFetch('/crm/doc-inbox/crear-propiedad', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, asociar: hermanos }) });
  if (r && r.ok) { toast('🏠 ' + (r.nombre || 'Propiedad') + ' creada (borrador) + ' + (r.asociados || 0) + ' documento(s) asociado(s) pendientes', 'ok'); loadDocAuditoria(); }
  else { toast('Error: ' + ((r && r.error) || 'no se pudo crear'), 'err'); }
};
// S58: descartar desde la Auditoría — OPTIMISTA (la fila desaparece al instante de la bandeja
// activa, guarda en background, rollback si falla). No depende del refetch ni del caché de 45s.
window.docAuditDescartar = async function (id) {
  var d = window.docAuditData; if (!d) return;
  var it = (d.items || []).find(function (x) { return x.id === id; });
  if (!it) return;
  var prev = it.estado;
  it.estado = 'Descartado';
  docAuditRecount(); renderDocAuditHead(); renderDocAuditoria();
  var r = await apiFetch('/crm/doc-inbox/descartar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) });
  if (r && r.ok) { toast('🗑 Descartado — ya podés reenviarlo', 'ok'); }
  else { it.estado = prev; docAuditRecount(); renderDocAuditHead(); renderDocAuditoria(); toast('No se pudo descartar — lo dejé como estaba', 'err'); }
};
// S57 (opción B): re-analizar pegando el texto del PDF (emergencia, sin Drive/runtime/token)
window.docAuditReanalizar = async function (id) {
  var texto = prompt('Pegá el TEXTO del documento (ABL/expensas/etc.) para extraer dirección, partida y período. NO reenvía el archivo — es una herramienta manual:');
  if (texto === null) return;
  if (texto.trim().length < 40) return toast('Texto muy corto (mínimo 40 caracteres)', 'err');
  toast('Extrayendo del texto pegado… (~15s)', 'ok');
  var d = await apiFetch('/crm/doc-inbox/re-analizar-texto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, texto: texto }) });
  if (d && d.ok) { toast('✅ Re-analizado' + (d.tipo ? ' como ' + d.tipo : '') + (d.sugerencia ? ' — sugerencia lista' : ''), 'ok'); loadDocAuditoria(); }
  else toast('Error: ' + ((d && d.error) || 'no pude extraer'), 'err');
};
// S55: crear propiedad borrador desde el documento (un click) + asociar + refrescar selector
window.docAuditCrearPropiedad = async function (id) {
  toast('Creando propiedad borrador desde el documento…', 'ok');
  var d = await apiFetch('/crm/doc-inbox/crear-propiedad', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) });
  if (d && d.ok) { toast('🏠 Propiedad creada: ' + (d.nombre || '') + ' (borrador, pendiente de revisión)', 'ok'); loadDocAuditoria(); }
  else toast('Error: ' + ((d && d.error) || 'no pude crear'), 'err');
};
window.docAuditReasignar = async function (id) {
  var sel = document.getElementById('da-prop-' + id);
  var propiedadId = sel ? sel.value : '';
  if (!propiedadId) return toast('Elegí la propiedad correcta', 'err');
  var d = await apiFetch('/crm/doc-inbox/asignar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, propiedadId: propiedadId }) });
  if (d && d.ok) { toast('Reasignado — pendiente de revisión', 'ok'); loadDocAuditoria(); } else toast('Error: ' + ((d && d.error) || 'sin conexión'), 'err');
};
window.docAuditDesasociar = async function (id) {
  var d = await apiFetch('/crm/doc-inbox/desasociar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) });
  if (d && d.ok) { toast('Desasociado → Sin clasificar', 'ok'); loadDocAuditoria(); } else toast('Error al desasociar', 'err');
};
