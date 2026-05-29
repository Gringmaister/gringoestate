/* Gringo Office Pixel — oficina en Canvas 2D + overlay Home (Fase 1).
 * Sin dependencias externas. Look pixel via image-rendering:pixelated + dibujo blocky.
 * Agentes: Wispy (oro), Bambi (teal), Leonardo (gris, "Próximamente").
 * Puertas: Home (default), AMBBI, GE Broker, Smart Home, Canarian (candado). */
(function () {
  'use strict';
  const { apiFetch, prom } = window.GO;
  const cv = document.getElementById('office');
  const ctx = cv.getContext('2d');
  const overlay = document.getElementById('overlay');
  const oTitle = document.getElementById('overlay-title');
  const oBody = document.getElementById('overlay-body');
  document.getElementById('overlay-close').onclick = closeOverlay;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });

  // ---- Paletas pixel de personajes ----
  const PAL = {
    wispy:    { skin:'#e7c9a0', hair:'#3a2c1a', body:'#d4a640', body2:'#b6892f' },
    bambi:    { skin:'#e7c9a0', hair:'#2a1d12', body:'#3aa0a0', body2:'#2c7d7d' },
    leonardo: { skin:'#9a9a9a', hair:'#5a5a5a', body:'#6a6a6a', body2:'#525252' }
  };

  const AGENTS = [
    { key:'wispy', name:'WISPY', role:'Asistente / Scrum', pal:PAL.wispy },
    { key:'bambi', name:'BAMBI', role:'Anfitrión 24/7 AMBBI', pal:PAL.bambi },
    { key:'leonardo', name:'LEONARDO', role:'Marketing & Ventas (pronto)', pal:PAL.leonardo, soon:true }
  ];
  const DOORS = [
    { key:'home', label:'HOME', color:'#d4a640' },
    { key:'ambbi', label:'AMBBI', color:'#cf9b54' },
    { key:'gebroker', label:'GE BROKER', color:'#cf9b54' },
    { key:'smarthome', label:'SMART HOME', color:'#cf9b54' },
    { key:'canarian', label:'CANARIAN', color:'#8a7b50', lock:true }
  ];

  let zones = [];     // hit-testing: {x,y,w,h,type,ref}
  let hover = null;
  let DPR = 1, W = 0, H = 0;

  function resize() {
    DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);

  // ---- Dibujo ----
  function drawRoom() {
    // piso
    ctx.fillStyle = '#15120e'; ctx.fillRect(0, 0, W, H);
    const t = 32;
    ctx.strokeStyle = '#1d1813'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += t) { ctx.beginPath(); ctx.moveTo(x, 44); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 44; y < H; y += t) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // pared superior
    ctx.fillStyle = '#0e0c0a'; ctx.fillRect(0, 44, W, 36);
    ctx.fillStyle = '#241e16'; ctx.fillRect(0, 78, W, 4);
    // título sobre la pared
    ctx.fillStyle = '#d4a640'; ctx.font = '10px "Press Start 2P", monospace'; ctx.textAlign = 'center';
    ctx.fillText('· GRINGO LABS · CONTROL ROOM ·', W / 2, 68);
  }

  function drawCharacter(x, y, s, pal, bob) {
    const yo = bob || 0;
    // sombra
    ctx.fillStyle = '#0006'; ctx.fillRect(x - 9 * s, y + 1, 18 * s, 3 * s);
    // cuerpo
    ctx.fillStyle = pal.body; ctx.fillRect(x - 8 * s, y - 16 * s + yo, 16 * s, 14 * s);
    ctx.fillStyle = pal.body2; ctx.fillRect(x - 8 * s, y - 6 * s + yo, 16 * s, 4 * s);
    // brazos
    ctx.fillStyle = pal.body2; ctx.fillRect(x - 11 * s, y - 15 * s + yo, 3 * s, 11 * s); ctx.fillRect(x + 8 * s, y - 15 * s + yo, 3 * s, 11 * s);
    // cabeza
    ctx.fillStyle = pal.skin; ctx.fillRect(x - 6 * s, y - 28 * s + yo, 12 * s, 12 * s);
    // pelo
    ctx.fillStyle = pal.hair; ctx.fillRect(x - 6 * s, y - 28 * s + yo, 12 * s, 4 * s);
    // ojos
    ctx.fillStyle = '#11100e'; ctx.fillRect(x - 3 * s, y - 22 * s + yo, 2 * s, 2 * s); ctx.fillRect(x + 1 * s, y - 22 * s + yo, 2 * s, 2 * s);
  }

  function drawDesk(x, y, w) {
    ctx.fillStyle = '#241b10'; ctx.fillRect(x - w / 2, y, w, 14);
    ctx.fillStyle = '#3a2c19'; ctx.fillRect(x - w / 2, y, w, 4);
    ctx.fillStyle = '#0c0a08'; ctx.fillRect(x - w / 2 + 3, y + 14, 4, 14); ctx.fillRect(x + w / 2 - 7, y + 14, 4, 14);
    // monitorcito
    ctx.fillStyle = '#11150f'; ctx.fillRect(x - 9, y - 12, 18, 12);
    ctx.fillStyle = '#3a6f4a'; ctx.fillRect(x - 7, y - 10, 14, 8);
  }

  function plate(x, y, text, color) {
    ctx.font = '7px "Press Start 2P", monospace'; ctx.textAlign = 'center';
    const w = Math.max(56, text.length * 7 + 12);
    ctx.fillStyle = '#0c0a08'; ctx.fillRect(x - w / 2, y, w, 14);
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(x - w / 2, y, w, 14);
    ctx.fillStyle = color; ctx.fillText(text, x, y + 10);
  }

  function drawDoorZone(d, x, y, w, h, hovered) {
    ctx.fillStyle = hovered ? '#221b10' : '#171309';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = d.color; ctx.lineWidth = hovered ? 3 : 2; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = d.color; ctx.font = '7px "Press Start 2P", monospace'; ctx.textAlign = 'center';
    ctx.fillText((d.lock ? '🔒 ' : '') + d.label, x + w / 2, y + h / 2 + 3);
  }

  function layout() {
    zones = [];
    const n = AGENTS.length;
    const slotW = Math.min(220, (W - 40) / n);
    const baseY = Math.max(200, Math.min(Math.round(H * 0.46), H - 200));
    AGENTS.forEach((a, i) => {
      const cx = W / 2 + (i - (n - 1) / 2) * slotW;
      zones.push({ x: cx - 36, y: baseY - 70, w: 72, h: 120, type: 'agent', ref: a, cx, cy: baseY });
    });
    // puertas en una fila inferior
    const dy = Math.min(H - 92, baseY + 120);
    const dw = Math.min(150, (W - 40) / DOORS.length - 10), dh = 56, gap = 10;
    const totalW = DOORS.length * dw + (DOORS.length - 1) * gap;
    let dx = (W - totalW) / 2;
    DOORS.forEach((d) => {
      zones.push({ x: dx, y: dy, w: dw, h: dh, type: 'door', ref: d });
      dx += dw + gap;
    });
  }

  let tAnim = 0;
  function render() {
    tAnim += 0.05;
    drawRoom();
    for (const z of zones) {
      const hovered = hover === z;
      if (z.type === 'agent') {
        const a = z.ref;
        drawDesk(z.cx, z.cy + 6, 96);
        const bob = Math.sin(tAnim + (a.key.length)) * 2;
        ctx.globalAlpha = a.soon ? 0.55 : 1;
        drawCharacter(z.cx, z.cy, 1.5, a.pal, bob);
        ctx.globalAlpha = 1;
        plate(z.cx, z.cy + 28, a.name, a.soon ? '#7a7a7a' : '#d4a640');
        if (hovered && !a.soon) { ctx.strokeStyle = '#e8c873'; ctx.lineWidth = 1; ctx.strokeRect(z.x, z.y, z.w, z.h); }
        if (a.soon) { ctx.fillStyle = '#7a7a7a'; ctx.font = '6px "Press Start 2P"'; ctx.textAlign = 'center'; ctx.fillText('PRÓXIMAMENTE', z.cx, z.cy + 56); }
      } else {
        drawDoorZone(z.ref, z.x, z.y, z.w, z.h, hovered);
      }
    }
    requestAnimationFrame(render);
  }

  // ---- Interacción ----
  function pick(mx, my) {
    for (const z of zones) if (mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h) return z;
    return null;
  }
  cv.addEventListener('mousemove', (e) => {
    const r = cv.getBoundingClientRect();
    hover = pick(e.clientX - r.left, e.clientY - r.top);
    cv.style.cursor = hover && !(hover.type === 'agent' && hover.ref.soon) ? 'pointer' : 'default';
  });
  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect();
    const z = pick(e.clientX - r.left, e.clientY - r.top);
    if (!z) return;
    if (z.type === 'agent') {
      if (z.ref.soon) return toast('Leonardo: próximamente 🛠️');
      openAgent(z.ref);
    } else openDoor(z.ref);
  });

  function openDoor(d) {
    if (d.key === 'home') return openHome();
    // Otras salas (Fase 3): por ahora reusan el office clásico que ya funciona.
    const sec = { ambbi: 'ambbi', gebroker: 'gebroker', smarthome: 'smarthome', canarian: 'canarian' }[d.key];
    const base = window.GO.isLocal ? 'https://gringo.estate/office/' : '/office/';
    window.open(base + (sec ? '#' + sec : ''), '_blank');
    toast('Abriendo ' + d.label + ' (panel clásico)…');
  }

  // ---- HUD ----
  function fmtClock() {
    try { return new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }); }
    catch { return new Date().toTimeString().slice(0, 5); }
  }
  function tickClock() { document.getElementById('clock').textContent = fmtClock(); }
  setInterval(tickClock, 1000); tickClock();

  async function refreshHud() {
    const el = document.getElementById('hud-kpis');
    const [gw, docker, occ] = await Promise.all([
      prom('wispy_gateway_online'),
      apiFetch('/docker'),
      apiFetch('/occupancy?days=30&company=all')
    ]);
    const up = docker && docker.summary ? (docker.summary.running ?? '?') : '?';
    const total = docker && docker.summary ? (docker.summary.total ?? '?') : '?';
    const occPct = occ && occ.occupancyPct != null ? Math.round(occ.occupancyPct * 100) + '%' : '—';
    el.innerHTML =
      kpiChip('Gateway', gw === 1 ? 'ONLINE' : (gw === 0 ? 'OFFLINE' : '—')) +
      kpiChip('Containers', up + '/' + total) +
      kpiChip('Ocupación 30d', occPct);
  }
  const kpiChip = (k, v) => `<span class="hud-kpi">${k}: <b>${v}</b></span>`;

  // ---- Overlay base ----
  function openOverlay(title) { oTitle.textContent = title; overlay.classList.remove('hidden'); }
  function closeOverlay() { overlay.classList.add('hidden'); oBody.innerHTML = ''; }
  function toast(msg) {
    const t = document.getElementById('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 2600);
  }

  // ---- Gauge pixel ----
  function gauge(pct, color, label) {
    pct = Math.max(0, Math.min(100, pct || 0));
    const wrap = document.createElement('div'); wrap.className = 'gauge';
    const c = document.createElement('canvas'); c.width = 84; c.height = 84;
    const x = c.getContext('2d'); const cx = 42, cy = 42, rad = 32;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    x.lineWidth = 9; x.lineCap = 'round';
    x.strokeStyle = '#000'; x.beginPath(); x.arc(cx, cy, rad, a0, a1); x.stroke();
    x.strokeStyle = color; x.beginPath(); x.arc(cx, cy, rad, a0, a0 + (a1 - a0) * pct / 100); x.stroke();
    x.fillStyle = color; x.font = '13px "Press Start 2P", monospace'; x.textAlign = 'center';
    x.fillText(Math.round(pct) + '', cx, cy + 5);
    wrap.appendChild(c);
    const l = document.createElement('div'); l.className = 'lbl'; l.textContent = label; wrap.appendChild(l);
    return wrap.outerHTML;
  }

  const fmtUSD = (n) => (n == null ? '—' : (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('es-AR'));
  const asPct = (n) => (n == null ? null : (Math.abs(n) <= 1 ? n * 100 : n));

  // ---- HOME ----
  async function openHome() {
    openOverlay('🏠 HOME · Métricas de Gringo Labs');
    oBody.innerHTML = '<div class="muted small">Cargando métricas…</div>';
    const [cpu, mem, disk, cache, sess, tok, cost, docker, prof, occ] = await Promise.all([
      prom('100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'),
      prom('100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))'),
      prom('100 - (node_filesystem_avail_bytes{mountpoint="/"} * 100 / node_filesystem_size_bytes{mountpoint="/"})'),
      prom('wispy_cache_efficiency_percent'),
      prom('wispy_sessions_active'),
      prom('wispy_current_session_tokens{kind="total"}'),
      prom('wispy_current_session_cost_usd'),
      apiFetch('/docker'),
      apiFetch('/business/profitability?empresa=all'),
      apiFetch('/occupancy?days=30&company=all')
    ]);

    const up = docker && docker.summary ? docker.summary.running : null;
    const total = docker && docker.summary ? docker.summary.total : null;

    let html = '';
    // KPIs
    html += '<div class="grid g-kpis" style="margin-bottom:14px">';
    html += kcard('Gateway IA', (await prom('wispy_gateway_online')) === 1 ? 'ONLINE' : 'OFF', 'sesiones activas: ' + (sess ?? '—'));
    html += kcard('Tokens sesión', tok != null ? Math.round(tok).toLocaleString('es-AR') : '—', 'costo: ' + (cost != null ? '$' + cost.toFixed(3) : '—'));
    html += kcard('Containers', (up != null ? up : '—') + ' / ' + (total != null ? total : '—'), 'docker activos');
    html += kcard('Ocupación 30d', occ && occ.occupancyPct != null ? Math.round(occ.occupancyPct * 100) + '%' : '—', (occ && occ.unitsCounted != null ? occ.unitsCounted + ' unidades' : ''));
    html += '</div>';

    // Gauges servidor + IA
    html += '<div class="card" style="margin-bottom:14px"><h4>SERVIDOR · MOTOR IA</h4><div class="gauge-wrap">';
    html += gauge(cpu, '#7ea6d4', 'CPU %');
    html += gauge(mem, '#d4a640', 'RAM %');
    html += gauge(disk, '#cf9b54', 'DISCO %');
    if (cache != null) html += gauge(cache, '#5bbf6a', 'CACHE %');
    if (occ && occ.occupancyPct != null) html += gauge(occ.occupancyPct * 100, '#e8c873', 'OCUP %');
    html += '</div></div>';

    // Rentabilidad
    html += '<div class="grid g-cards" style="margin-bottom:14px">';
    if (prof && prof.companies) {
      for (const [emp, c] of Object.entries(prof.companies)) {
        const metro = emp.toLowerCase() === 'metropolitan';
        const m = asPct(c.margenPct);
        html += `<div class="card ${metro ? 'metro' : ''}">
          <div class="row"><h4>${emp}</h4><span class="tag">${c.mes || ''} ${c.anio || ''}</span></div>
          <div class="kpi-val">${fmtUSD(c.ebitdaUSD)}</div>
          <div class="kpi-sub">EBITDA · ingresos ${fmtUSD(c.ingresosUSD)} · margen ${m != null ? m.toFixed(1) + '%' : '—'}<br>
          ADR ${fmtUSD(c.adrUSD)} · RevPAR ${fmtUSD(c.revparUSD)} · ${(prof.byUnit && prof.byUnit[emp] ? prof.byUnit[emp].length : 0)} unidades</div>
        </div>`;
      }
    } else {
      html += '<div class="card err">Rentabilidad no disponible' + (prof && prof.__error ? ' (' + prof.__error + ')' : '') + '</div>';
    }
    html += '</div>';

    // Ocupación: próximas reservas
    html += '<div class="card"><h4>PRÓXIMAS RESERVAS (iCal · 30d)</h4><div class="unit-list">';
    if (occ && occ.upcoming && occ.upcoming.length) {
      occ.upcoming.slice(0, 8).forEach((r) => {
        html += `<div class="u"><span>${(r.alias || r.id || '?')}</span><span class="muted">${r.start} → ${r.end} · ${r.nights}n</span></div>`;
      });
    } else html += '<div class="muted small">Sin reservas próximas o iCal no disponible.</div>';
    html += '</div><div class="kpi-sub" style="margin-top:8px">Ocupación próxima (iCal) ≠ ocupación contable del cierre CFO.</div></div>';

    oBody.innerHTML = html;
  }
  const kcard = (h, v, sub) => `<div class="card"><h4>${h}</h4><div class="kpi-val">${v}</div><div class="kpi-sub">${sub || ''}</div></div>`;

  // ---- AGENTE ----
  async function openAgent(a) {
    openOverlay('🤖 ' + a.name + ' · ' + a.role);
    oBody.innerHTML = '<div class="muted small">Cargando estado…</div>';
    let html = '';
    if (a.key === 'wispy') {
      const s = await apiFetch('/wispy/status');
      if (s && !s.__error) {
        const wa = s.wa_status && s.wa_status !== 'unknown' ? ('WhatsApp: ' + s.wa_status) : 'agente activo';
        html += kcard('Modelo', s.model || '—', wa);
      } else html += '<div class="err">Estado no disponible (' + (s && s.__error) + ')</div>';
    } else if (a.key === 'bambi') {
      const m = await apiFetch('/bambi/api/mode');
      if (m && !m.__error) html += kcard('Modo', (m.mode || '—'), 'kill: ' + (m.kill ? 'SÍ' : 'no'));
      else html += '<div class="card"><h4>Bambi</h4><div class="kpi-sub">Estado en vivo no disponible — el runtime único (gringo_agents) reemplazó al contenedor bambi. Repunte del proxy: Fase 2.</div></div>';
    }
    html += '<div class="card" style="margin-top:12px"><h4>Editar prompt / config</h4><div class="kpi-sub">Ver y editar el system.md + agent.config.json de cada agente llega en <b>Fase 2</b> (editor cableado a /api/files con reload del runtime).</div></div>';
    oBody.innerHTML = html;
  }

  // ---- Boot ----
  function frame() { resize(); layout(); }
  window.addEventListener('resize', () => { resize(); layout(); });
  resize(); layout(); render();
  refreshHud(); setInterval(refreshHud, 60000);
  // Abrir Home por default
  setTimeout(openHome, 400);
})();
