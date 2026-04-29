const { getInbox, getContextData, getActionLog, getBugJournal, appendBug } = require('./_wispy-panel-utils');
const { getRuntimeTelemetry } = require('./_wispy-runtime');
const { getTrelloBoardsSnapshot, getTrelloRecentActivity } = require('./_wispy-trello');
const { getModuleRegistry } = require('./_wispy-modules');
const { proxyPortableApi } = require('./_wispy-portable-proxy');

function countBlockedFocus(focus = []) {
  return focus.filter((item) => item.status === 'blocked').length;
}

function countAudioLike(items = []) {
  return items.filter((item) => /audio|voice|nota/i.test(`${item.title} ${item.summary}`)).length;
}

function hoursBetween(now, isoString) {
  const then = isoString ? new Date(isoString).getTime() : null;
  if (!then || Number.isNaN(then)) return null;
  return Math.max(0, (now - then) / (1000 * 60 * 60));
}

function enrichCollaborators(items = []) {
  const now = Date.now();
  return items.map((item) => {
    const waitingHours = hoursBetween(now, item.waitingSinceAt);
    const overdue = waitingHours !== null && Number.isFinite(item.slaHours) && waitingHours >= item.slaHours;
    return {
      ...item,
      waitingHours,
      overdue,
      statusTone: overdue ? 'danger' : (item.statusTone || 'ok')
    };
  });
}

function buildHealthChecks({ runtimeTelemetry, bridgePending, trelloBoards, collaborators, blockedFocus, bugJournal }) {
  const checks = [];
  checks.push({
    name: 'Gateway runtime',
    status: bridgePending ? 'warn' : (runtimeTelemetry?.gateway?.online ? 'ok' : 'danger'),
    note: bridgePending ? 'Pendiente enlazar bridge externo.' : (runtimeTelemetry?.gateway?.online ? 'Gateway online.' : 'Gateway offline o sin respuesta.')
  });
  checks.push({
    name: 'Boards sync',
    status: Array.isArray(trelloBoards) && trelloBoards.length ? 'ok' : 'warn',
    note: Array.isArray(trelloBoards) && trelloBoards.length ? `${trelloBoards.length} boards cargados.` : 'No cargó boards reales.'
  });
  checks.push({
    name: 'Colaboradores SLA',
    status: collaborators.some((item) => item.overdue) ? 'warn' : 'ok',
    note: collaborators.some((item) => item.overdue) ? `${collaborators.filter((item) => item.overdue).length} colaborador(es) vencidos.` : 'Sin SLA vencidos ahora.'
  });
  checks.push({
    name: 'Bloqueos de foco',
    status: blockedFocus > 0 ? 'warn' : 'ok',
    note: blockedFocus > 0 ? `${blockedFocus} foco(s) bloqueados.` : 'Sin bloqueos activos.'
  });
  checks.push({
    name: 'Bug journal',
    status: bugJournal.some((item) => item.status === 'open') ? 'warn' : 'ok',
    note: bugJournal.some((item) => item.status === 'open') ? `${bugJournal.filter((item) => item.status === 'open').length} bug(s) abiertos.` : 'Sin bugs abiertos registrados.'
  });
  return checks;
}

function maybeAutoRecordBridgePending({ runtimeTelemetry, bugJournal }) {
  if (runtimeTelemetry?.source !== 'bridge-pending') return;
  const existing = bugJournal.find((item) => item.flow === 'runtime-bridge' && item.status === 'open');
  if (existing) return;
  appendBug({
    title: 'Bridge externo pendiente',
    flow: 'runtime-bridge',
    severity: 'medium',
    detail: 'Netlify todavía no está enlazado al runtime bridge externo.',
    impact: 'El panel público no ve toda la telemetría real.'
  });
}

function buildPipeline(context = {}, boards = []) {
  if (Array.isArray(context.pipeline) && context.pipeline.length) return context.pipeline;

  return [
    {
      name: 'Captación Ambbi',
      stage: 'pipeline',
      summary: context.priorities?.[0] || 'Expansión y captación siguen siendo prioridad.',
      nextStep: 'Bajar a follow-up comercial concreto.',
      owner: 'Franco',
      tone: 'warn'
    },
    {
      name: 'Equipo operativo',
      stage: 'setup',
      summary: `${(context.staff || []).slice(0, 3).join(' · ') || 'Staff base por consolidar'}`,
      nextStep: 'Ordenar pendientes por colaborador y SLA.',
      owner: 'Wispy',
      tone: 'ok'
    },
    {
      name: 'Boards activos',
      stage: 'ops',
      summary: Array.isArray(boards) && boards.length ? boards.slice(0, 2).map((board) => `${board.name}: ${board.pending}`).join(' · ') : 'Sin boards cargados.',
      nextStep: 'Conectar pipeline real a panel.',
      owner: 'Panel',
      tone: 'warn'
    }
  ];
}

exports.handler = async function (event = {}) {
  const proxied = await proxyPortableApi({ httpMethod: 'GET' }, 'api/panel-data');
  if (proxied) return proxied;
  const now = new Date();
  const inbox = getInbox();
  const context = getContextData();
  const runtimeTelemetry = await getRuntimeTelemetry();
  const trelloBoards = await getTrelloBoardsSnapshot().catch(() => null);
  const trelloActivity = await getTrelloRecentActivity(6).catch(() => []);
  const modules = getModuleRegistry();

  const openInbox = inbox.filter((item) => item.status !== 'done');
  const focus = Array.isArray(context.focus) && context.focus.length
    ? context.focus
    : (context.priorities || []).slice(0, 4).map((priority, index) => ({
        title: `Prioridad ${index + 1}`,
        body: priority,
        status: index === 0 ? 'active' : 'pending',
        nextStep: 'Bajarlo a acción concreta.'
      }));

  const blockedFocus = countBlockedFocus(focus);
  const runtimeCards = runtimeTelemetry?.cards || null;
  const bridgePending = runtimeTelemetry?.pending === true;
  const gatewayOnline = bridgePending ? null : runtimeTelemetry?.gateway?.online;
  const activeSessions = bridgePending ? null : runtimeTelemetry?.sessions?.activeCount;

  const snapshot = [
    {
      label: 'Gateway',
      value: bridgePending ? 'Bridge pending' : (runtimeCards?.gatewayValue || 'Online'),
      note: bridgePending ? 'Falta conectar el runtime bridge externo desde Netlify.' : (runtimeTelemetry?.gateway?.detail || 'Pulso principal visible desde Office.'),
      badge: bridgePending ? 'bridge' : (gatewayOnline === false ? 'caído' : 'verde'),
      tone: bridgePending ? 'warn' : (gatewayOnline === false ? 'danger' : 'ok')
    },
    {
      label: 'Sesiones activas',
      value: String(activeSessions ?? 1),
      note: bridgePending
        ? 'Pendiente enlazar sesiones reales vía bridge.'
        : (runtimeTelemetry?.sessions?.current
          ? `${runtimeTelemetry.sessions.current.model} · ${runtimeTelemetry.sessions.current.updatedAgo}`
          : 'Main session operativa.'),
      badge: 'live',
      tone: 'ok'
    },
    {
      label: 'Tareas corriendo',
      value: String(openInbox.length),
      note: openInbox[0]?.title || 'Sin tareas abiertas en inbox.',
      badge: 'ops',
      tone: openInbox.length ? 'warn' : 'ok'
    },
    {
      label: 'Errores / alertas',
      value: String(blockedFocus),
      note: blockedFocus ? 'Hay bloqueos reales en foco.' : 'Sin alertas activas ahora.',
      badge: 'alertas',
      tone: blockedFocus ? 'danger' : 'ok'
    }
  ];

  const collaborators = enrichCollaborators(Array.isArray(context.collaborators) ? context.collaborators : []);
  const boards = Array.isArray(trelloBoards) && trelloBoards.length
    ? trelloBoards
    : (Array.isArray(context.boards) ? context.boards : []);
  const pipeline = buildPipeline(context, boards);
  const actionLog = getActionLog();
  let bugJournal = getBugJournal();
  maybeAutoRecordBridgePending({ runtimeTelemetry, bugJournal });
  bugJournal = getBugJournal();
  const healthChecks = buildHealthChecks({ runtimeTelemetry, bridgePending, trelloBoards: boards, collaborators, blockedFocus, bugJournal });
  const bridgeAlert = bridgePending ? [{
    title: 'Runtime bridge pendiente',
    body: 'El deploy público ya tomó el panel nuevo, pero todavía falta unir Netlify con el bridge externo real.',
    time: 'live',
    tone: 'warn'
  }] : [];
  const boardSyncLog = Array.isArray(trelloBoards) && trelloBoards.length ? [{
    title: 'Boards sync',
    body: `Boards reales cargados: ${trelloBoards.map((board) => `${board.name} ${board.pending}`).join(' · ')}`,
    time: 'live',
    tone: 'ok'
  }] : [];
  const liveLog = [
    ...actionLog,
    ...trelloActivity,
    ...(Array.isArray(context.liveLog) ? context.liveLog : []),
    ...((runtimeTelemetry?.liveLogItems) || []),
    ...bridgeAlert,
    ...boardSyncLog
  ].slice(0, 10);

  const notifications = [
    ...(blockedFocus ? [{
      title: 'Bloqueos activos',
      body: `${blockedFocus} foco(s) bloqueados requieren seguimiento.`,
      level: 'danger'
    }] : []),
    ...bridgeAlert.map((item) => ({ title: item.title, body: item.body, level: 'warn' })),
    ...((Array.isArray(trelloBoards) ? trelloBoards : [])
      .filter((board) => board.blocked > 0 || board.today > 0)
      .slice(0, 3)
      .map((board) => ({
        title: `${board.name} requiere atención`,
        body: `${board.today || 0} para hoy · ${board.blocked || 0} bloqueadas`,
        level: board.blocked > 0 ? 'warn' : 'ok'
      }))),
    ...collaborators
      .filter((item) => item.overdue)
      .slice(0, 3)
      .map((item) => ({
        title: `${item.name} pasado de SLA`,
        body: `${Math.round(item.waitingHours)}h esperando respuesta · ${item.pending}`,
        level: 'danger'
      })),
    ...actionLog.slice(0, 2).map((item) => ({
      title: item.title,
      body: item.body,
      level: item.tone === 'danger' ? 'danger' : 'ok'
    }))
  ].slice(0, 6);
  const runtimeBase = bridgePending
    ? (Array.isArray(context.runtime) ? context.runtime : [])
    : (runtimeTelemetry?.runtimeItems?.length
      ? runtimeTelemetry.runtimeItems
      : (Array.isArray(context.runtime) ? context.runtime : []));
  const runtime = [
    {
      title: 'Health checks',
      value: `${healthChecks.filter((item) => item.status !== 'ok').length} issue(s)`,
      tone: healthChecks.some((item) => item.status === 'danger') ? 'danger' : (healthChecks.some((item) => item.status === 'warn') ? 'warn' : 'ok'),
      note: healthChecks.map((item) => `${item.name}: ${item.note}`).join(' · ')
    },
    {
      title: 'Bug journal',
      value: `${bugJournal.filter((item) => item.status === 'open').length} abiertos`,
      tone: bugJournal.some((item) => item.status === 'open') ? 'warn' : 'ok',
      note: bugJournal[0]?.title ? `${bugJournal[0].title} · ${bugJournal[0].detail || bugJournal[0].impact || ''}`.trim() : 'Sin bugs abiertos registrados.'
    },
    ...runtimeBase
  ].slice(0, 7);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify({
      ok: true,
      generatedAt: now.toISOString(),
      snapshot,
      inbox: openInbox.slice(0, 8),
      inboxMeta: {
        unprocessed: openInbox.length,
        audioLike: countAudioLike(openInbox)
      },
      focus,
      focusMeta: {
        topCount: focus.length,
        blocked: blockedFocus
      },
      collaborators,
      boards,
      pipeline,
      liveLog,
      notifications,
      healthChecks,
      bugJournal: bugJournal.slice(0, 10),
      modules,
      runtime,
      runtimeSummary: {
        status: runtimeTelemetry?.source || 'seed'
      },
      runtimeTelemetry,
      source: {
        portfolio: context.portfolio,
        prioritiesCount: (context.priorities || []).length,
        staffCount: (context.staff || []).length
      }
    })
  };
};
