const { getInbox, getContextData, getActionLog } = require('./_wispy-panel-utils');
const { getRuntimeTelemetry } = require('./_wispy-runtime');
const { getTrelloBoardsSnapshot } = require('./_wispy-trello');

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

exports.handler = async function () {
  const now = new Date();
  const inbox = getInbox();
  const context = getContextData();
  const runtimeTelemetry = await getRuntimeTelemetry();
  const trelloBoards = await getTrelloBoardsSnapshot().catch(() => null);

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
  const actionLog = getActionLog();
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
    ...(Array.isArray(context.liveLog) ? context.liveLog : []),
    ...((runtimeTelemetry?.liveLogItems) || []),
    ...bridgeAlert,
    ...boardSyncLog
  ].slice(0, 8);

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
  const runtime = bridgePending
    ? (Array.isArray(context.runtime) ? context.runtime : [])
    : (runtimeTelemetry?.runtimeItems?.length
      ? runtimeTelemetry.runtimeItems
      : (Array.isArray(context.runtime) ? context.runtime : []));

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
      liveLog,
      notifications,
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
