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
    if (section === 'ambbi')     { loadTasks(); }
    if (section === 'gebroker')  { loadProperties(); }
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
      loadOpsTab(),
      loadOpsPipeline(),
      loadIAChart(),
      loadModelBars(),
      loadPulso(),
      loadBrainCard(),
      load3Pilares(),
      loadAlerts()
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
        : docker.containers.filter(function (c) { return (c.status || '').toLowerCase().includes('up'); }).length;
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
    var running = containers.filter(function (c) { return (c.status || '').toLowerCase().includes('up'); }).length;

    // Update KPIs
    var kpiDock = document.getElementById('kpi-docker');
    if (kpiDock) kpiDock.textContent = running + ' / ' + containers.length;
    var sbDock = document.getElementById('sb-docker');
    if (sbDock) sbDock.innerHTML = '<span class="dot ' + (running === containers.length ? 'ok' : 'warn') + '"></span>' + running + '/' + containers.length + ' UP';

    grid.innerHTML = containers.map(function (c) {
      var ok = (c.status || '').toLowerCase().includes('up');
      return '<div class="docker-item">' +
        '<div class="d-name"><span class="dot ' + (ok ? 'ok' : 'err') + '"></span>' + escHtml(c.name || '—') + '</div>' +
        '<div class="d-status" style="color:' + (ok ? 'var(--ok)' : 'var(--danger)') + '">' +
        escHtml((c.status || '—').split(' ').slice(0, 3).join(' ')) + '</div>' +
        '</div>';
    }).join('');
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
          var up = dk.containers.filter(function (c) { return (((c.status || '') + '').toLowerCase()).indexOf('up') >= 0; }).length;
          labs.textContent = '🟢 ' + up + '/' + dk.containers.length;
        } else { labs.textContent = '🟢 Online'; }
      }
      if (sub) {
        var md = (st && !st.__error && st.model) ? st.model : 'gpt-5.5';
        var tt = (st && !st.__error) ? (st.tokens_total || 0) : 0;
        var tStr = tt >= 1e6 ? (Math.round(tt / 1e6) + 'M') : Number(tt).toLocaleString('es-AR');
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
    body.innerHTML = byUnit.map(function (u) {
      var ocPct = (u.occupancyPct !== undefined && u.occupancyPct !== null)
        ? Math.round(u.occupancyPct <= 1 ? u.occupancyPct * 100 : u.occupancyPct)
        : '—';
      var next = (u.upcoming && u.upcoming[0] && u.upcoming[0].start)
        ? new Date(u.upcoming[0].start).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
        : '—';
      return '<tr>' +
        '<td style="font-family:var(--mono);font-size:.78rem;color:var(--muted);">' + escHtml(u.id || '—') + '</td>' +
        '<td style="font-weight:600;">' + escHtml(u.alias || '—') + '</td>' +
        '<td>' + (u.busyNights != null ? u.busyNights : '—') + '</td>' +
        '<td><span style="color:' + (ocPct >= 60 ? 'var(--ok)' : ocPct >= 30 ? 'var(--warn)' : 'var(--danger)') + ';font-weight:700;">' + ocPct + (ocPct !== '—' ? '%' : '') + '</span></td>' +
        '<td style="color:var(--gold);font-family:var(--mono);font-size:.8rem;">' + next + '</td>' +
      '</tr>';
    }).join('');
  }
  window.loadAmbiOcup = loadAmbiOcup;

  /* ─── AMBBI TAB SWITCHER ─────────────────────────────────────────── */
  function ambiTab(which) {
    var prefixes = ['tareas', 'huespedes', 'ocupacion'];
    prefixes.forEach(function (p) {
      var sv = document.getElementById('at-' + p);
      if (sv) sv.classList.remove('active');
    });
    var sv = document.getElementById('at-' + which);
    if (sv) sv.classList.add('active');
    // Sync tab buttons
    var tabs = document.querySelectorAll('#view-ambbi .sub-tab');
    tabs.forEach(function (t) { t.classList.remove('active'); });
    var idx = prefixes.indexOf(which);
    if (tabs[idx]) tabs[idx].classList.add('active');
    // Lazy load
    if (which === 'huespedes') loadGuests();
    if (which === 'ocupacion') loadAmbiOcup();
    if (which === 'tareas')    loadTasks();
  }
  window.ambiTab = ambiTab;

  /* ─── PROPERTIES ─────────────────────────────────────────────────── */
  async function loadProperties() {
    var d = await apiFetch('/ge/properties');
    var body = document.getElementById('props-body');
    if (!body) return;
    if (!Array.isArray(d) || !d.length) {
      body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px;">Pipeline vacío</td></tr>';
      return;
    }
    body.innerHTML = d.map(function (p) {
      return '<tr>' +
        '<td style="font-weight:600;">' + escHtml(p.address || p.direccion || '—') + '</td>' +
        '<td style="color:var(--muted);font-size:.8rem;">' + escHtml(p.type || p.tipo || '—') + '</td>' +
        '<td><span class="badge badge-muted">' + escHtml(p.status || p.estado || '—') + '</span></td>' +
        '<td style="color:var(--gold);font-weight:700;">$' + escHtml(String(p.price || p.precio || '—')) + '</td>' +
        '<td style="font-size:.8rem;">' + escHtml(p.contact || p.propietario || '—') + '</td>' +
        '<td style="font-size:.76rem;color:var(--muted);">' + (p.createdAt ? new Date(p.createdAt).toLocaleDateString('es-AR') : '—') + '</td>' +
        '<td><button class="btn btn-danger btn-sm" onclick="deleteProperty(' + (p.id || 0) + ')">✕</button></td>' +
      '</tr>';
    }).join('');
  }
  window.loadProperties = loadProperties;

  async function createProperty() {
    var addrEl   = document.getElementById('p-address');
    var typeEl   = document.getElementById('p-type');
    var statusEl = document.getElementById('p-status');
    var priceEl  = document.getElementById('p-price');
    var contEl   = document.getElementById('p-contact');
    var notesEl  = document.getElementById('p-notes');
    if (!addrEl || !addrEl.value.trim()) return toast('La dirección es requerida', 'err');
    var body = {
      address: addrEl.value.trim(),
      type:    typeEl  ? typeEl.value  : '',
      status:  statusEl ? statusEl.value : '',
      price:   priceEl ? priceEl.value : '',
      contact: contEl  ? contEl.value  : '',
      notes:   notesEl ? notesEl.value : ''
    };
    var d = await apiFetch('/ge/property', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (d && d.ok) {
      hideModal('modal-prop');
      toast('Propiedad agregada al pipeline', 'ok');
      loadProperties();
    } else {
      toast('Error al agregar propiedad', 'err');
    }
  }
  window.createProperty = createProperty;

  async function deleteProperty(id) {
    if (!confirm('Eliminar esta propiedad del pipeline?')) return;
    toast('Función de eliminación pendiente en el bridge', 'warn');
  }
  window.deleteProperty = deleteProperty;

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

    // Group by status
    var byStatus = {};
    tasks.forEach(function (t) {
      var s = t.status || 'Sin estado';
      if (!byStatus[s]) byStatus[s] = 0;
      byStatus[s]++;
    });
    var statusRows = Object.keys(byStatus).map(function (s) {
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:rgba(255,255,255,0.02);font-size:.78rem;">' +
        '<span style="color:var(--muted);">' + escHtml(s) + '</span>' +
        '<strong style="color:var(--gold);font-family:var(--mono);">' + byStatus[s] + '</strong>' +
      '</div>';
    }).join('');

    // Recent urgent tasks
    var urgent = tasks.filter(function (t) {
      return (t.priority || t.prioridad || '').toLowerCase() === 'urgente';
    }).slice(0, 3);
    var urgentHtml = urgent.length
      ? '<div style="margin-top:10px;font-size:.72rem;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px;">Urgentes</div>' +
        urgent.map(function (t) {
          var r = t.responsable || '';
          var col = colorMap[r] || 'var(--muted)';
          return '<div style="display:flex;justify-content:space-between;align-items:center;font-size:.78rem;padding:4px 0;">' +
            '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px;">' + escHtml(t.title || '—') + '</span>' +
            '<span style="background:' + col + '22;color:' + col + ';padding:1px 6px;border-radius:6px;font-size:.72rem;flex-shrink:0;">' + escHtml(r || '—') + '</span>' +
          '</div>';
        }).join('')
      : '';

    el.innerHTML = '<div style="font-size:.72rem;color:var(--muted);margin-bottom:8px;"><strong style="color:var(--text);font-size:.95rem;">' + tasks.length + '</strong> tareas en total</div>' +
      '<div style="display:grid;gap:4px;">' + statusRows + '</div>' + urgentHtml;
  }
  window.loadOpsTab = loadOpsTab;

  async function loadOpsPipeline() {
    var el = document.getElementById('ops-pipeline-content');
    if (!el) return;
    el.innerHTML = '<div class="skeleton skeleton-block" style="height:100px;"></div>';

    var d = await apiFetch('/ge/properties');
    if (!Array.isArray(d) || !d.length) {
      el.innerHTML = '<span style="color:var(--muted);font-size:.82rem;">Pipeline vacío</span>';
      return;
    }
    // Count by status
    var byStatus = {};
    d.forEach(function (p) {
      var s = p.status || p.estado || 'Sin estado';
      if (!byStatus[s]) byStatus[s] = 0;
      byStatus[s]++;
    });

    var html = '<div style="font-size:.72rem;color:var(--muted);margin-bottom:10px;"><strong style="color:var(--text);font-size:.95rem;">' + d.length + '</strong> propiedades en cartera</div>' +
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
      '<div style="' + AE_LABEL + '">Herramientas habilitadas (' + tools.length + ') — «Disparar» las ejecuta de verdad, con confirmación</div>' +
      '<div class="tools-list">' + tools.map(function (t) {
        var m = TOOL_META[t.name] || { icon: '🔧', label: t.name, risk: 'write' };
        var rk = RISK_META[m.risk] || RISK_META.write;
        var desc = (t.description || '').split('\n')[0].slice(0, 120);
        return '<div class="tool-row">' +
            '<div class="tool-row-main">' +
              '<span class="tool-ico">' + m.icon + '</span>' +
              '<div><div class="tool-name">' + escHtml(m.label) +
                ' <span class="tool-risk" style="color:' + rk.color + ';border-color:' + rk.color + '">' + rk.tag + '</span></div>' +
                '<div class="tool-desc">' + escHtml(desc) + '</div></div>' +
            '</div>' +
            '<button class="btn btn-ghost btn-sm" onclick="openToolForm(\'' + agent + '\',\'' + t.name + '\')">Disparar</button>' +
          '</div>';
      }).join('') + '</div>';
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
