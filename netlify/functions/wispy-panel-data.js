const { getInbox, getContextData } = require('./_wispy-panel-utils');
const { getRuntimeTelemetry } = require('./_wispy-runtime');

function countBlockedFocus(focus = []) {
  return focus.filter((item) => item.status === 'blocked').length;
}

function countAudioLike(items = []) {
  return items.filter((item) => /audio|voice|nota/i.test(`${item.title} ${item.summary}`)).length;
}

exports.handler = async function () {
  const now = new Date();
  const inbox = getInbox();
  const context = getContextData();
  const runtimeTelemetry = await getRuntimeTelemetry();

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

  const collaborators = Array.isArray(context.collaborators) ? context.collaborators : [];
  const boards = Array.isArray(context.boards) ? context.boards : [];
  const liveLog = [
    ...(Array.isArray(context.liveLog) ? context.liveLog : []),
    ...((runtimeTelemetry?.liveLogItems) || []),
    ...(bridgePending ? [{
      title: 'Runtime bridge pendiente',
      body: 'El deploy público ya tomó el panel nuevo, pero todavía falta unir Netlify con el bridge externo real.',
      time: 'live',
      tone: 'warn'
    }] : [])
  ].slice(0, 8);
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
