const { getInbox, getContextData } = require('./_wispy-panel-utils');

exports.handler = async function () {
  const now = new Date();
  const inbox = getInbox();
  const context = getContextData();

  const openInbox = inbox.filter((item) => item.status !== 'done');

  const snapshot = [
    {
      label: 'Ambbi portfolio',
      value: '17-18 unidades',
      note: context.portfolio,
      footLeft: 'base real',
      footRight: 'Uriburu 1070'
    },
    {
      label: 'Prioridades activas',
      value: String(context.priorities.length || 0),
      note: context.priorities[0] || 'Sin prioridades detectadas.',
      footLeft: 'MEMORY.md',
      footRight: 'vivo'
    },
    {
      label: 'Inbox abierto',
      value: String(openInbox.length),
      note: openInbox[0]?.title || 'Sin pendientes cargados.',
      footLeft: 'persistente',
      footRight: 'panel'
    },
    {
      label: 'Staff clave',
      value: String(context.staff.length || 0),
      note: context.staff.slice(0, 2).join(' · ') || 'Sin staff detectado.',
      footLeft: 'operación',
      footRight: 'Ambbi'
    }
  ];

  const memory = [
    {
      title: 'Prioridad #1',
      body: context.priorities[0] || 'Sin prioridad detectada.'
    },
    {
      title: 'Prioridad #2',
      body: context.priorities[1] || 'Sin segunda prioridad detectada.'
    },
    {
      title: 'Vibe de comunicación',
      body: context.communication[0] || 'Tono ejecutivo local, directo y de carga cero.'
    },
    ...context.daily.slice(0, 2).map((entry, index) => ({
      title: `Memoria diaria ${index + 1}`,
      body: entry
    }))
  ];

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
      memory,
      actions: [
        'Daily brief 10:00',
        'Procesar audio a tareas',
        'Resumen pipeline RE',
        'Generar copy comercial'
      ],
      source: {
        portfolio: context.portfolio,
        prioritiesCount: context.priorities.length,
        staffCount: context.staff.length
      }
    })
  };
};
