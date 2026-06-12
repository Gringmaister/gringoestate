/* Gringo Office Pixel — SPA futurista (S19 rewrite)
 * Reemplaza el Canvas/pixel lobby. Diseño: oro/negro glassmorphism.
 * Usa window.GO de api.js (apiFetch, prom, promAll, isLocal).
 * Sin dependencias externas — gauges dibujados con Canvas 2D nativo.
 * CSP-safe: sin cdn.jsdelivr.net, sin chart.js, connect-src same-origin.
 */
(function () {
  'use strict';

  const { apiFetch, prom, promAll } = window.GO;

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
    if (section === 'smarthome') { loadHue(); }
    if (section === 'infra')     { loadDocker(); }
    if (section === 'canarian')  { checkCanaSession(); }
  }
  window.nav = nav;

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
        '<button class="btn btn-ghost btn-sm" onclick="showModal(\'modal-import\')">📥 Importar</button>') : '') + crmFunnelHtml(d.captacion || []);
      var el = document.getElementById('crm-cap-total'); if (el) el.textContent = capTotal + ' propietarios';
      var dem = document.getElementById('crm-demanda');
      var demTotal = (d.demanda || []).reduce(function (s, e) { return s + e.count; }, 0);
      if (dem) dem.innerHTML = (demTotal === 0 ? emptyState(
        'Todavía no hay compradores/inquilinos. Cargá una consulta, mandale el screenshot del lead a Wispy o promové desde contactos.',
        '<button class="btn btn-gold btn-sm" onclick="showModal(\'modal-contacto\')">+ Lead demanda</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="crmTab(\'contactos\')">⭐ Promover desde contactos</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="showModal(\'modal-import\')">📥 Importar</button>') : '') + crmFunnelHtml(d.demanda || []);
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
        pr.innerHTML = items.length ? items.map(function (p) {
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
        }).join('') : '<span class="small muted">Sin propiedades todavía — cargá la primera con «+ Propiedad».</span>';
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
    var idx = ['resumen', 'captacion', 'demanda', 'operaciones', 'propiedades', 'contactos'].indexOf(which);
    var btns = document.querySelectorAll('#crm-tabs .sub-tab');
    if (btns[idx]) btns[idx].classList.add('active');
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
        var chips = [];
        ['captacion', 'demanda'].forEach(function (k) {
          var obj = (m.conversiones || {})[k] || {};
          Object.keys(obj).forEach(function (par) {
            if (obj[par] !== null) chips.push('<span class="badge badge-muted" title="' + escHtml(k) + '">' + escHtml(par) + ': <b style="color:var(--gold);">' + obj[par] + '%</b></span>');
          });
        });
        cv.innerHTML = chips.length ? '<div style="font-size:.68rem;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em;">Conversión por etapa</div><div style="display:flex;gap:6px;flex-wrap:wrap;">' + chips.join('') + '</div>' : '';
      }
      // Benchmarks Magnin + plan semanal 40-5-5-1
      var bm = document.getElementById('cm-benchmarks');
      if (bm && m.benchmarks) {
        bm.innerHTML =
          (m.carteraAlerta ? '<div style="font-size:.78rem;color:var(--warn);padding:6px 0;">' + escHtml(m.carteraAlerta) + '</div>' : '') +
          '<div style="font-size:.68rem;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em;">Referencias Magnin (benchmarks — para comparar, no automatizan nada)</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
            '<span class="badge badge-muted" title="Captar 1 de cada 3 tasaciones; antes, descartar la mitad de los pedidos que no califican">Tasación→Captada: <b style="color:var(--gold);">33%</b></span>' +
            '<span class="badge badge-muted" title="2 captaciones en cartera por cada venta">Captación→Venta: <b style="color:var(--gold);">50%</b></span>' +
            '<span class="badge badge-muted" title="600 clics → 30 consultas → 15 visitas → 1 reserva (reserva→venta 1:1)">15 visitas = <b style="color:var(--gold);">1 reserva</b></span>' +
            '<span class="badge badge-muted" title="Cartera chica y rotativa, marketing de altísima calidad">Cartera: <b style="color:var(--gold);">máx 5</b></span>' +
            '<span class="badge badge-muted" title="12 contactos diarios prospectando = 12 ventas/año">12 contactos/día</span>' +
            '<span class="badge badge-muted" title="Responder en menos de 1 minuto; 2-3hs ya es tarde">Speed-to-lead: <b style="color:var(--gold);">&lt;1 min</b></span>' +
          '</div>';
      }
    }
    var hh = await apiFetch('/crm/hablar-hoy');
    var el = document.getElementById('crm-hablar-hoy');
    if (el) {
      var recs = (hh && hh.ok && hh.recomendados) || [];
      window.crmRecsCache = {};
      recs.forEach(function (r) { window.crmRecsCache[r.id] = r; });
      el.innerHTML = recs.length ? recs.map(function (r) {
        return '<div style="border:1px solid var(--border);border-radius:10px;padding:9px 12px;margin-bottom:7px;background:rgba(255,255,255,0.02);">' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
            '<strong style="font-size:.86rem;">' + escHtml(r.nombre) + '</strong>' +
            (r.etiqueta ? '<span class="badge badge-gold">' + r.etiqueta + '</span>' : '') +
            '<span class="badge badge-muted">' + escHtml(r.tipo || '—') + '</span>' +
            '<span style="margin-left:auto;font-family:var(--mono);font-size:.7rem;color:var(--gold);">score ' + r.score + '</span>' +
          '</div>' +
          '<div style="font-size:.76rem;color:var(--muted);margin:4px 0 7px;"><b style="color:var(--text);">Motivo:</b> ' + r.motivos.map(escHtml).join(' · ') + (r.busca ? ' · busca: ' + escHtml(r.busca) : '') + '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
            (r.telefono ? '<a class="btn btn-gold btn-sm" style="text-decoration:none;" href="' + waHref(r.telefono) + '" target="_blank" rel="noopener">💬 Abrir chat</a>' : '') +
            '<button class="btn btn-ghost btn-sm" onclick="marcarContactado(\'' + r.id + '\')">✓ Contactado</button>' +
            '<button class="btn btn-ghost btn-sm" onclick="crearTareaContacto(\'' + r.id + '\')">📋 Crear tarea</button>' +
            '<button class="btn btn-ghost btn-sm" onclick="posponerContacto(\'' + r.id + '\')">⏰ Posponer 3d</button>' +
            '<button class="btn btn-ghost btn-sm" onclick="abrirContactoEdit(\'' + r.id + '\')">✏️ Editar</button>' +
          '</div>' +
        '</div>';
      }).join('') : '<span class="small muted">Sin recomendaciones todavía — el recomendador cobra vida cuando tus contactos tienen etiqueta, etapa o seguimiento. Cargá los primeros desde 🧹 Higiene o el Import Center.</span>';
    }
  }
  window.loadCrmResumen = loadCrmResumen;

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
      return '<div style="margin-bottom:18px;background:rgba(255,255,255,0.018);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:12px 14px;">' +
        '<div style="display:flex;align-items:center;gap:8px;font-size:.74rem;color:var(--gold);text-transform:uppercase;letter-spacing:.08em;font-weight:700;border-bottom:1px solid var(--border);padding-bottom:6px;margin-bottom:9px;"><span style="flex:1;">' + titulo + '</span>' + (extraHeader || '') + '</div>' + contenido + '</div>';
    };
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
    var colorDe = { recibido: 'var(--ok)', pedido: '#5ec8d8', revisar: 'var(--warn)', bloqueante: 'var(--danger)', no_aplica: '#555', pendiente: '#999' };
    var lblDe = { recibido: '✓ Recibido', pedido: '📨 Pedido', revisar: '🟡 Revisar', bloqueante: '⛔ BLOQUEA', no_aplica: 'No aplica', pendiente: 'Pendiente' };
    var nRec = (d.checklist || []).filter(function (c) { return c.estado === 'recibido'; }).length;
    var nTot = (d.checklist || []).filter(function (c) { return c.estado !== 'no_aplica'; }).length;
    var pct = nTot ? Math.round(nRec / nTot * 100) : 0;
    var chk = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">' +
      '<span class="badge" style="border:1.5px solid ' + (/legal/.test(sem.nivel) ? 'var(--danger)' : /comercial|operativo/.test(sem.nivel) ? 'var(--warn)' : 'var(--ok)') + ';font-size:.72rem;padding:3px 10px;">' + escHtml(sem.nivel || '—') + '</span>' +
      '<div style="flex:1;min-width:140px;height:7px;border-radius:5px;background:rgba(255,255,255,0.07);overflow:hidden;"><div style="height:100%;width:' + pct + '%;border-radius:5px;background:linear-gradient(90deg,var(--gold),#e8c96a);transition:width .4s;"></div></div>' +
      '<span style="font-family:var(--mono);font-size:.74rem;color:var(--gold);">' + nRec + '/' + nTot + ' · ' + pct + '%</span></div>';
    chk += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:7px;">';
    chk += (d.checklist || []).map(function (c) {
      var col = colorDe[c.estado] || '#999';
      return '<div style="border:1px solid rgba(255,255,255,0.07);border-left:3px solid ' + col + ';border-radius:9px;padding:7px 9px;background:rgba(255,255,255,0.015);' + (c.estado === 'no_aplica' ? 'opacity:.4;' : '') + '">' +
        '<div style="display:flex;align-items:center;gap:6px;">' +
          '<span style="flex:1;font-size:.79rem;font-weight:600;' + (c.estado === 'no_aplica' ? 'text-decoration:line-through;' : '') + '">' + escHtml(c.tipo) + (c.driveLink ? ' <a href="' + escHtml(c.driveLink) + '" target="_blank" rel="noopener" style="color:var(--muted);text-decoration:none;">↗</a>' : '') + '</span>' +
          '<span style="font-size:.62rem;color:' + col + ';white-space:nowrap;">' + lblDe[c.estado] + '</span></div>' +
        '<div style="display:flex;gap:3px;margin-top:5px;">' +
          (c.estado !== 'recibido' ? '<button class="btn btn-ghost btn-sm" style="padding:1px 7px;font-size:.66rem;" title="Marcar pedido" onclick="lgDocAccion(\'' + c.tipo + '\',\'pedido\')">📨 pedir</button>' : '') +
          (c.estado !== 'recibido' ? '<button class="btn btn-ghost btn-sm" style="padding:1px 7px;font-size:.66rem;" title="Marcar recibido (a mano)" onclick="lgDocAccion(\'' + c.tipo + '\',\'recibido\')">✓</button>' : '') +
          (c.estado !== 'no_aplica' ? '<button class="btn btn-ghost btn-sm" style="padding:1px 7px;font-size:.66rem;" title="No aplica" onclick="lgDocAccion(\'' + c.tipo + '\',\'no_aplica\')">🚫</button>' : '<button class="btn btn-ghost btn-sm" style="padding:1px 7px;font-size:.66rem;" title="Restaurar" onclick="lgDocAccion(\'' + c.tipo + '\',\'reset\')">↺</button>') +
        '</div>' +
        (c.redFlags ? '<div style="font-size:.68rem;color:var(--danger);margin-top:4px;">🚩 ' + escHtml(c.redFlags) + '</div>' : '') +
      '</div>';
    }).join('');
    chk += '</div>';
    // S44: DROPZONE — arrastrá el documento directo al legajo (o click para elegir)
    chk += '<div id="lg-dropzone" onclick="document.getElementById(\'lg-dropfile\').click()" style="margin-top:10px;border:2px dashed rgba(212,175,55,0.35);border-radius:11px;padding:16px;text-align:center;cursor:pointer;transition:all .2s;font-size:.8rem;color:var(--muted);">' +
      '📎 <b style="color:var(--text);">Arrastrá acá</b> la escritura, expensas, ABL, plano… <span style="opacity:.7;">(o hacé click)</span> — va al Drive y tilda el checklist solo' +
      '<input type="file" id="lg-dropfile" style="display:none;" onchange="lgFileElegido(this.files[0])"></div>' +
      '<div id="lg-droptipo" style="display:none;margin-top:8px;"></div>';
    izq += seccion('📥 Documental', chk);
    izq += seccion('🧮 Tasaciones (' + (d.tasaciones || []).length + ')',
      (d.tasaciones || []).length ? d.tasaciones.map(function (x) {
        return '<div style="display:flex;gap:8px;align-items:center;padding:3px 0;font-size:.78rem;flex-wrap:wrap;"><span style="flex:1;">' + escHtml(x.tasacion) + '</span><span class="badge badge-muted">' + escHtml(x.estado || '') + '</span>' + (x.precioCierre ? '<span style="font-family:var(--mono);color:var(--gold);">USD ' + Number(x.precioCierre).toLocaleString('es-AR') + '</span>' : '') + '<button class="btn btn-ghost btn-sm" onclick="hideModal(\'modal-legajo\');crmTab(\'propiedades\');abrirTasacion(\'' + x.id + '\')">abrir</button></div>';
      }).join('') : '<div class="small muted">Sin tasaciones.</div>');
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
    dock += '<div class="lgdock-pane" id="lgdock-resumen">' +
      '<div style="font-size:.74rem;line-height:1.6;">' +
        '<div>✅ <b>Tenemos:</b> ' + (tiene.join(', ') || '—') + '</div>' +
        '<div>📨 <b>Falta pedir:</b> ' + (pedir.join(', ') || '—') + '</div>' +
        (revisar.length ? '<div>🟡 <b>Falta revisar:</b> ' + revisar.join(', ') + '</div>' : '') +
        ((sem.bloqueos || []).length ? '<div style="color:var(--danger);">⛔ <b>Bloquea:</b> ' + sem.bloqueos.map(function (b) { return b.detalle; }).join(' · ') + '</div>' : '') +
        '<div style="margin-top:6px;">▶ <b>' + escHtml(d.proximaAccion || '') + '</b></div>' +
      '</div></div>';
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
    if (body) body.innerHTML = accionHtml + '<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;"><div style="flex:1.5;min-width:420px;">' + izq + '</div><div style="flex:1;min-width:320px;">' + dock + '</div></div>';
    lgDockTab('resumen');
    lgDropWire();
  }
  window.abrirLegajo = abrirLegajo;

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
  async function lgAudioToggle() {
    var btn = document.getElementById('lg-mic-btn');
    if (window.lgRec) { // grabando → frenar y mandar
      window.lgRec.stop();
      return;
    }
    if (!navigator.mediaDevices || !window.MediaRecorder) return toast('Tu navegador no soporta grabación de audio', 'err');
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      var chunks = [];
      var rec = new MediaRecorder(stream);
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        stream.getTracks().forEach(function (t2) { t2.stop(); });
        window.lgRec = null;
        if (btn) { btn.textContent = '🎤'; btn.style.background = ''; btn.style.color = ''; }
        var blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        if (blob.size < 1200) return toast('Audio muy corto — probá de nuevo', 'err');
        var fr = new FileReader();
        fr.onload = function () { lgChatSendAudio(String(fr.result)); };
        fr.readAsDataURL(blob);
      };
      rec.start();
      window.lgRec = rec;
      if (btn) { btn.textContent = '⏹'; btn.style.background = 'var(--danger)'; btn.style.color = '#fff'; }
      toast('🎤 Grabando… tocá ⏹ para mandar', 'ok');
    } catch (e) { toast('No pude acceder al micrófono (permiso denegado)', 'err'); }
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
    var d = await apiFetch('/crm/tasacion', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasacion: v('ts-titulo'), direccion: v('ts-direccion'), barrio: v('ts-barrio'), tipoPropiedad: v('ts-tipo'), m2Cubiertos: Number(v('ts-m2cub')) || 0, m2Balcon: Number(v('ts-m2balcon')) || 0, m2Terraza: Number(v('ts-m2terraza')) || 0, m2Semicubiertos: Number(v('ts-m2semi')) || 0, m2Patio: Number(v('ts-m2patio')) || 0, precioPretendido: Number(v('ts-pretendido')) || undefined, piso: v('ts-piso') !== '' ? Number(v('ts-piso')) : undefined, pisosEdificio: Number(v('ts-pisosedif')) || undefined, antiguedad: Number(v('ts-antiguedad')) || undefined, orientacion: v('ts-orientacion') || undefined, disposicion: v('ts-disposicion') || undefined, cochera: !!(co && co.checked), operacion: 'Venta', objetivo: 'Captación' })
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
    var t = d.tasacion, comps = d.comparables || [];
    var filas = comps.map(function (c) {
      var excl = c.estadoAviso === 'Excluido' || c.outlier;
      var est = c.estadoAviso === 'Excluido' ? '🚫' : c.outlier ? '⚠ outlier' : c.similar ? '✓' : '✕';
      return '<tr style="border-top:1px solid rgba(255,255,255,0.06);' + (excl ? 'opacity:.45;' : '') + '">' +
        '<td style="padding:4px 6px;font-size:.76rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escHtml(c.motivoExclusion || c.notas || '') + '">' + (c.link ? '<a href="' + escHtml(c.link) + '" target="_blank" rel="noopener" style="color:var(--text);">' + escHtml(c.comparable) + ' ↗</a>' : escHtml(c.comparable)) + '</td>' +
        '<td style="padding:4px 6px;font-family:var(--mono);font-size:.74rem;text-align:right;">' + (c.precio ? c.precio.toLocaleString('es-AR') : '—') + '</td>' +
        '<td style="padding:4px 6px;font-family:var(--mono);font-size:.74rem;text-align:right;">' + (c.precioAjustado ? c.precioAjustado.toLocaleString('es-AR') : '—') + (c.cochera ? ' 🚗' : '') + '</td>' +
        '<td style="padding:4px 6px;font-family:var(--mono);font-size:.74rem;text-align:right;">' + (c.m2Pond || '—') + '</td>' +
        '<td style="padding:4px 6px;font-family:var(--mono);font-size:.78rem;text-align:right;color:var(--gold);">' + (c.usdM2 ? c.usdM2.toLocaleString('es-AR') : '—') + '</td>' +
        '<td style="padding:4px 6px;font-family:var(--mono);font-size:.7rem;text-align:right;">' + (c.diasPublicado != null ? c.diasPublicado + 'd' : '—') + '</td>' +
        '<td style="padding:4px 6px;font-size:.74rem;text-align:center;">' + est + '</td>' +
        '<td style="padding:4px 6px;text-align:center;"><button class="btn btn-ghost btn-sm" style="padding:0 6px;" title="' + (excl ? 'Re-incluir en el cálculo' : 'Excluir del cálculo') + '" onclick="toggleComparable(\'' + c.id + '\',\'' + (excl ? 'Incluido' : 'Excluido') + '\',\'' + t.id + '\')">' + (excl ? '↩' : '🚫') + '</button></td>' +
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
    el.innerHTML =
      '<div style="border:1px solid var(--border);border-radius:12px;padding:12px;">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">' +
          '<strong style="font-size:.9rem;">' + escHtml(t.tasacion) + '</strong>' +
          '<span class="badge badge-muted">' + escHtml(t.barrio || '') + '</span>' +
          '<span class="badge badge-muted">' + escHtml(t.estado || '') + '</span>' +
          '<span style="font-family:var(--mono);font-size:.74rem;color:var(--muted);">' + (t.m2Pond || '—') + ' m² pond.' + (t.cochera ? ' + 🚗' : '') + '</span>' +
          '<span style="margin-left:auto;"></span>' +
          '<button class="btn btn-gold btn-sm" onclick="calcularTasacion(\'' + t.id + '\')">🧮 Calcular</button>' +
          (t.precioCierre ? '<button class="btn btn-gold btn-sm" onclick="pdfTasacion(\'' + t.id + '\')">📄 Carpeta Wow</button>' : '') +
        '</div>' +
        preciosHtml + diagHtml +
        '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">' +
          '<input class="input" id="cmp-link" placeholder="Pegá un LINK de Zonaprop…" style="flex:2;min-width:200px;">' +
          '<button class="btn btn-gold btn-sm" onclick="agregarComparable(\'' + t.id + '\',\'link\')">+ por link</button>' +
        '</div>' +
        '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">' +
          '<textarea class="input" id="cmp-texto" placeholder="…o pegá el TEXTO del aviso (compartir → copiar)" style="flex:2;min-width:200px;min-height:44px;"></textarea>' +
          '<button class="btn btn-ghost btn-sm" onclick="agregarComparable(\'' + t.id + '\',\'texto\')">+ por texto</button>' +
        '</div>' +
        (comps.length ? '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;"><thead><tr style="font-size:.66rem;color:var(--muted);text-transform:uppercase;"><th style="text-align:left;padding:4px 6px;">Comparable</th><th style="text-align:right;">Precio</th><th style="text-align:right;">Ajustado</th><th style="text-align:right;">m²</th><th style="text-align:right;">USD/m²</th><th style="text-align:right;">Días</th><th>Estado</th><th></th></tr></thead><tbody>' + filas + '</tbody></table></div>' : '<div class="small muted">Sin comparables todavía — pegá el primero ↑</div>') +
      '</div>';
  }
  window.abrirTasacion = abrirTasacion;

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
      var c = d.comparable;
      toast('✅ ' + c.titulo + ' — USD/m² ' + (c.usdM2 || '?') + (c.esSimilar ? '' : ' (lo marqué NO similar: ' + (c.razon || '') + ')'), 'ok');
      abrirTasacion(tasacionId);
    } else toast('Error: ' + ((d && d.error) || 'sin conexión'), 'err');
  }
  window.agregarComparable = agregarComparable;

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
    var col = function (titulo, emoji, tab, etapas, total) {
      return '<div onclick="crmTab(\'' + tab + '\')" style="cursor:pointer;border:1px solid var(--border);border-radius:10px;padding:10px 12px;" title="Ir a ' + titulo + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;"><strong style="font-size:.8rem;">' + emoji + ' ' + titulo + '</strong><span class="badge badge-muted">' + total + '</span></div>' +
        (etapas || []).map(function (e) {
          var on = e.count > 0;
          return '<div style="display:flex;justify-content:space-between;font-size:.72rem;padding:2px 0;color:' + (on ? 'var(--text)' : 'var(--muted)') + ';">' +
            '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(e.etapa) + '</span>' +
            '<span style="font-family:var(--mono);color:' + (on ? 'var(--gold)' : 'var(--muted)') + ';">' + e.count + '</span></div>';
        }).join('') + '</div>';
    };
    var html = '';
    if (pipe) {
      var capT = (pipe.captacion || []).reduce(function (s, e) { return s + e.count; }, 0);
      var demT = (pipe.demanda || []).reduce(function (s, e) { return s + e.count; }, 0);
      html += col('Captación', '🏠', 'captacion', pipe.captacion, capT);
      html += col('Demanda', '🛒', 'demanda', pipe.demanda, demT);
    }
    if (ops) {
      var activas = (ops.etapas || []).filter(function (e) { return ['Cerrada', 'Caída'].indexOf(e.etapa) < 0; });
      html += col('Operaciones', '💼', 'operaciones', activas, ops.activas || 0);
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
    var item = function (campo, label, val, target) {
      var ok = val >= target;
      return '<div style="display:flex;align-items:center;gap:6px;border:1px solid ' + (ok ? 'var(--ok)' : 'var(--border)') + ';border-radius:10px;padding:6px 10px;">' +
        '<span style="font-size:.74rem;color:var(--muted);">' + label + '</span>' +
        '<strong style="font-family:var(--mono);font-size:.85rem;color:' + (ok ? 'var(--ok)' : 'var(--text)') + ';">' + val + '/' + target + (ok ? ' ✓' : '') + '</strong>' +
        '<button class="btn btn-gold btn-sm" style="padding:1px 8px;" title="Sumar 1 (lo hiciste vos)" onclick="sumarPlan(\'' + campo + '\',1)">+1</button>' +
        '<button class="btn btn-ghost btn-sm" style="padding:1px 7px;" title="Restar 1 (corrección)" onclick="sumarPlan(\'' + campo + '\',-1)">−</button>' +
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
    if (!d || d.__error || !d.ok) { el.innerHTML = '<span class="small muted">No pude leer higiene.</span>'; return; }
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
        return '<button class="btn btn-sm ' + (on ? 'btn-gold' : 'btn-ghost') + '" onclick="window.crmHigFiltro=\'' + key + '\';window.crmHigFocus=0;loadCrmHigiene()">' + label + '</button>';
      };
      html += '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">' +
        chip('todos', 'Todos') + chip('activos', '🔥 ≥20 msgs') + chip('telefono', '📞 Con tel.') + chip('basura', '🧹 Probable basura') +
        '<input class="input" placeholder="🔎 Buscar nombre…" value="' + escHtml(window.crmHigBusca || '') + '" style="width:160px;font-size:.74rem;padding:3px 8px;" oninput="window.crmHigBusca=this.value.toLowerCase();window.crmHigFocus=0;clearTimeout(window.crmHigBuscaT);window.crmHigBuscaT=setTimeout(function(){var v=document.activeElement&&document.activeElement.value;loadCrmHigiene().then(function(){var i=document.querySelector(\'#crm-higiene input.input\');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}});},350)">' +
        '<button class="btn btn-sm ' + (window.crmHigKb ? 'btn-gold' : 'btn-ghost') + '" style="margin-left:auto;" title="Clasificá con el teclado: ↑↓ moverse · P promover · E equipo · A ambbi · X personal · V proveedor · N no contactar · D descartar · S saltar" onclick="window.crmHigKb=!window.crmHigKb;window.crmHigFocus=0;loadCrmHigiene()">⌨️ Modo rápido</button>' +
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
          '<button class="btn btn-ghost btn-sm" onclick="window.crmHigSel={};loadCrmHigiene()">✕ limpiar</button>' +
        '</div>';
      }
      html += '<div style="font-size:.72rem;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em;">Sin clasificar (' + lista.length + (window.crmHigFiltro !== 'todos' ? ' con este filtro' : '') + ') — tildá varios para clasificar en lote</div>';
      html += '<div style="max-width:820px;">';
      html += lista.slice(0, window.crmHigieneVisible).map(function (l, idx) {
        var foco = window.crmHigKb && (window.crmHigFocus || 0) === idx;
        var sel = !!window.crmHigSel[l.id];
        return '<div data-hig-idx="' + idx + '" style="display:grid;grid-template-columns:24px minmax(140px,1fr) 70px auto;align-items:center;gap:8px;padding:4px 6px;border-bottom:1px solid rgba(255,255,255,0.05);' + (foco ? 'background:rgba(212,175,55,0.12);border-radius:8px;' : '') + '">' +
          '<input type="checkbox"' + (sel ? ' checked' : '') + ' onchange="toggleHigSel(\'' + l.id + '\',this.checked)" aria-label="Seleccionar">' +
          '<span style="font-size:.82rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(l.nombre) + (l.telefono ? '' : ' <span style="color:var(--muted);font-weight:400;font-size:.66rem;">(sin tel.)</span>') + '</span>' +
          '<span style="font-size:.68rem;color:var(--muted);font-family:var(--mono);text-align:right;">' + (l.mensajes || 0) + ' msgs</span>' +
          '<span style="display:inline-flex;gap:4px;">' +
            '<button class="btn btn-gold btn-sm" title="Promover al CRM: lo crea como contacto TRABAJABLE en tu base de brokerage" onclick="clasificarLinea(\'' + l.id + '\',\'Promover\')">⭐ Promover</button>' +
            '<button class="btn btn-ghost btn-sm" title="Tu gente: staff, socios, colaboradores" onclick="clasificarLinea(\'' + l.id + '\',\'Equipo\')">👔 Equipo</button>' +
            '<button class="btn btn-ghost btn-sm" title="Huésped AMBBI (temporario) — no pertenece a este CRM" onclick="clasificarLinea(\'' + l.id + '\',\'AMBBI\')">🏨</button>' +
            '<button class="btn btn-ghost btn-sm" title="Personal (familia/amigos)" onclick="clasificarLinea(\'' + l.id + '\',\'Personal\')">👤</button>' +
            '<button class="btn btn-ghost btn-sm" title="Proveedor (negocios/servicios)" onclick="clasificarLinea(\'' + l.id + '\',\'Proveedor\')">🏪</button>' +
            '<button class="btn btn-ghost btn-sm" title="No contactar nunca (bloqueado)" onclick="clasificarLinea(\'' + l.id + '\',\'No contactar\')">⛔</button>' +
            '<button class="btn btn-ghost btn-sm" title="Descartar: basura/spam, no sirve" onclick="clasificarLinea(\'' + l.id + '\',\'Descartado\')">🗑</button>' +
          '</span>' +
        '</div>';
      }).join('');
      html += '</div>';
      if (lista.length > window.crmHigieneVisible) {
        html += '<div style="display:flex;gap:6px;margin-top:8px;">' +
          '<button class="btn btn-ghost btn-sm" onclick="window.crmHigieneVisible+=20;loadCrmHigiene()">▾ Mostrar 20 más (' + (lista.length - window.crmHigieneVisible) + ' restantes)</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="window.crmHigieneVisible=99999;loadCrmHigiene()">⤓ Mostrar TODOS (' + lista.length + ')</button></div>';
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
  window.loadCrmHigiene = loadCrmHigiene;

  async function clasificarLinea(id, clasificacion) {
    delete (window.crmHigSel || {})[id];
    var d = await apiFetch('/crm/clasificar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, clasificacion: clasificacion }) });
    if (d && d.ok) { toast(clasificacion === 'Promover' ? '⭐ Promovido al CRM' : 'Clasificado: ' + clasificacion, 'ok'); loadCrmHigiene(); }
    else toast('Error al clasificar', 'err');
  }
  window.clasificarLinea = clasificarLinea;

  /* P5 consultor (S43): selección + lote + teclado */
  function toggleHigSel(id, on) {
    window.crmHigSel = window.crmHigSel || {};
    if (on) window.crmHigSel[id] = true; else delete window.crmHigSel[id];
    loadCrmHigiene();
  }
  window.toggleHigSel = toggleHigSel;

  async function clasificarLote(clasificacion) {
    var ids = Object.keys(window.crmHigSel || {});
    if (!ids.length) return;
    toast('Clasificando ' + ids.length + ' como ' + clasificacion + '…', 'ok');
    var d = await apiFetch('/crm/clasificar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ids, clasificacion: clasificacion }) });
    if (d && d.ok) { toast('✅ ' + (d.aplicados || ids.length) + ' clasificados como ' + clasificacion, 'ok'); window.crmHigSel = {}; loadCrmHigiene(); }
    else toast('Error en el lote: ' + ((d && d.error) || 'sin conexión'), 'err');
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
    if (e.key === 'ArrowDown') { e.preventDefault(); window.crmHigFocus = Math.min(idx + 1, max); loadCrmHigiene(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); window.crmHigFocus = Math.max(idx - 1, 0); loadCrmHigiene(); }
    else if (k === 's') { e.preventDefault(); window.crmHigFocus = Math.min(idx + 1, max); loadCrmHigiene(); }
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
    var opsEmpty = !(d.items || []).length;
    el.innerHTML = (opsEmpty
      ? '<div style="border:1px dashed var(--border);border-radius:12px;padding:18px;text-align:center;margin-bottom:12px;"><div style="font-size:.82rem;color:var(--muted);margin-bottom:10px;">Sin operaciones activas. Cuando haya una oferta o reserva en la mesa, cargala acá (o aprobá la sugerencia de Hermes desde el Inbox).</div><button class="btn btn-gold btn-sm" onclick="showModal(\'modal-operacion\')">+ Primera operación</button></div>'
      : '') + crmFunnelHtml((d.etapas || []).map(function (e) {
      return { etapa: e.etapa, count: e.count, cards: (e.items || []).map(function (i) { return { nombre: i.operacion + (i.montoTotal ? ' · $' + Number(i.montoTotal).toLocaleString('es-AR') : ''), onclick: 'abrirOperacion(\'' + i.id + '\')', title: 'Abrir flujo guiado de la operación' }; }) };
    }));
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
    if (document.getElementById('modal-op-detalle')) return;
    var div = document.createElement('div');
    div.innerHTML = '<div class="modal-overlay hidden" id="modal-op-detalle"><div class="modal" style="max-width:560px;">' +
      '<h3 id="opd-titulo" style="margin:0 18px 0 0;font-size:.95rem;">Operación</h3>' +
      '<div id="opd-body" style="margin-top:10px;max-height:70vh;overflow-y:auto;"></div>' +
      '</div></div>';
    document.body.appendChild(div.firstChild);
    initModalUX(); // suma la ✕ + click-afuera + Esc (mismo wiring que los demás modales)
  }

  window.crmOpDetalle = null; // operación abierta + estado de checklist en edición

  async function abrirOperacion(id) {
    if (!window.crmOpsCache) { var d0 = await apiFetch('/crm/operaciones'); if (d0 && d0.ok) window.crmOpsCache = d0; }
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
    var html = '';
    // tipo (si falta, elegirlo activa la guía)
    html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">' +
      '<span style="font-size:.72rem;color:var(--muted);">Tipo:</span>' +
      ['Venta', 'Alquiler'].map(function (tp) {
        var on = op.tipo === tp;
        return '<button class="btn btn-sm ' + (on ? 'btn-gold' : 'btn-ghost') + '" onclick="setOpTipo(\'' + tp + '\')">' + tp + '</button>';
      }).join('') +
      '<span style="margin-left:auto;font-size:.72rem;color:var(--muted);">Etapa:</span>' +
      '<select id="opd-etapa" style="font-size:.74rem;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:3px 6px;">' +
      ((d.etapas || []).map(function (e) { return e.etapa; })).map(function (e) { return '<option' + (op.etapa === e ? ' selected' : '') + '>' + e + '</option>'; }).join('') +
      '</select></div>';
    if (!tipo) {
      html += '<div style="border:1px dashed var(--border);border-radius:10px;padding:12px;font-size:.78rem;color:var(--muted);">Elegí <b>Venta</b> o <b>Alquiler</b> y aparece el flujo guiado con su checklist (informes, escribanía, garantías…).</div>';
    } else {
      // próxima acción ENORME (mismo patrón que el legajo)
      if (proximo) {
        html += '<div style="border:1px solid var(--gold);border-radius:10px;padding:10px 12px;margin-bottom:10px;background:rgba(212,175,55,0.06);">' +
          '<div style="font-size:.66rem;color:var(--gold);text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px;">▶ Próximo paso (' + hechos + '/' + tpl.length + ')</div>' +
          '<div style="font-size:.86rem;font-weight:700;">' + escHtml(proximo.label) + '</div></div>';
      } else if (tpl.length) {
        html += '<div style="border:1px solid var(--ok);border-radius:10px;padding:10px 12px;margin-bottom:10px;font-size:.82rem;">✅ Checklist completo — si cobraste, pasala a <b>Cerrada</b> (y cargá el cierre como comparable 💎)</div>';
      }
      html += '<div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px;">Checklist ' + tipo + '</div>';
      html += tpl.map(function (i) {
        var on = !!st.checklist[i.k];
        return '<label style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer;font-size:.8rem;' + (on ? 'color:var(--muted);' : '') + '">' +
          '<input type="checkbox"' + (on ? ' checked' : '') + ' onchange="toggleOpItem(\'' + i.k + '\',this.checked)">' +
          '<span style="' + (on ? 'text-decoration:line-through;' : '') + '">' + escHtml(i.label) + '</span></label>';
      }).join('');
    }
    // montos + bloqueo
    var num = function (id2, ph, val) { return '<input id="' + id2 + '" type="number" placeholder="' + ph + '" value="' + (val == null ? '' : val) + '" style="width:110px;font-size:.74rem;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:4px 6px;">'; };
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">' +
      num('opd-monto', 'Monto USD', op.montoTotal) + num('opd-reserva', 'Reserva', op.reserva) + num('opd-refuerzo', 'Refuerzo', op.refuerzo) +
      num('opd-honesp', 'Honor. esp.', op.honorariosEsperados) + num('opd-honcob', 'Honor. cobrados', op.honorariosCobrados) +
      '<input id="opd-firma" type="date" value="' + (op.fechaFirma || '') + '" style="font-size:.74rem;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:4px 6px;">' +
      '</div>' +
      '<input id="opd-bloqueo" placeholder="🔴 ¿Trabada? Escribí el bloqueo (queda en alertas)" value="' + escHtml(op.bloqueo || '') + '" style="width:100%;margin-top:8px;font-size:.76rem;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:6px 8px;">' +
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button class="btn btn-gold btn-sm" onclick="saveOpDetalle()">💾 Guardar</button>' +
        '<a class="btn btn-ghost btn-sm" style="text-decoration:none;" href="' + (op.url || '#') + '" target="_blank" rel="noopener">↗ Abrir ficha</a>' +
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
      fechaFirma: v('opd-firma') || undefined
    };
    var r = await apiFetch('/crm/operacion/actualizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r && r.ok) { hideModal('modal-op-detalle'); toast('Operación actualizada — próximo paso: ' + (body.proximoPaso || '—'), 'ok'); window.crmOpsCache = null; loadCrmOperaciones(); }
    else toast('Error: ' + ((r && r.error) || 'sin conexión'), 'err');
  }
  window.saveOpDetalle = saveOpDetalle;

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
