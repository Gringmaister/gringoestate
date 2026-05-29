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
    if (section === 'agentes')   { loadWispy(); loadBambi(); }
    if (section === 'ambbi')     { loadTasks(); }
    if (section === 'gebroker')  { loadProperties(); }
    if (section === 'smarthome') { loadHue(); }
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

  /* ─── LOAD HOME (orchestrates all home loaders) ─────────────────── */
  function loadHome() {
    loadSystemBar();
    loadGauges();
    loadProfitability();
    loadOccupancy();
    loadDocker();
  }
  window.loadHome = loadHome;

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
    var kpiTok = document.getElementById('kpi-tokens');
    if (kpiTok) kpiTok.textContent = tokens !== null ? Math.round(tokens).toLocaleString('es-AR') : '—';
    var kpiCost = document.getElementById('kpi-cost');
    if (kpiCost) kpiCost.textContent = cost !== null ? '$' + parseFloat(cost).toFixed(4) : '$—';
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

    // Periodic refresh
    setInterval(loadSystemBar, 60000);   // system bar every 60s
    setInterval(loadDocker,    120000);  // docker every 2min
    setInterval(loadGauges,    90000);   // gauges every 90s
  });

})();
