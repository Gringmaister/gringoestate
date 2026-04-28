const { appendActionLog } = require('./_wispy-panel-utils');
const { createTrelloCard } = require('./_wispy-trello');

function detectArea(text) {
  const lower = text.toLowerCase();
  if (lower.includes('pamela') || lower.includes('admin') || lower.includes('contrato')) return 'admin';
  if (lower.includes('mantenimiento') || lower.includes('marcelo') || lower.includes('arreglo') || lower.includes('repar')) return 'maintenance';
  return 'inbox';
}

function detectVertical(text) {
  const lower = text.toLowerCase();
  if (lower.includes('ambbi') || lower.includes('limpieza') || lower.includes('mantenimiento') || lower.includes('check-in')) return 'Ambbi';
  if (lower.includes('propiedad') || lower.includes('lead') || lower.includes('pipeline') || lower.includes('copy') || lower.includes('publica')) return 'Gringo Estate';
  if (lower.includes('agenda') || lower.includes('recordatorio') || lower.includes('personal') || lower.includes('día')) return 'Personal';
  return 'General';
}

function detectDeliverable(text) {
  const lower = text.toLowerCase();
  if (lower.includes('audio')) return 'Extracción de tareas y decisiones';
  if (lower.includes('copy') || lower.includes('publica')) return 'Copy comercial listo para usar';
  if (lower.includes('brief') || lower.includes('resumen')) return 'Brief ejecutivo';
  if (lower.includes('pipeline') || lower.includes('lead')) return 'Resumen comercial con próximos pasos';
  return 'Acción ejecutiva estructurada';
}

function buildPlan(prompt) {
  const cleaned = String(prompt || '').replace(/\s+/g, ' ').trim();
  const area = detectArea(cleaned);
  const vertical = detectVertical(cleaned);
  const deliverable = detectDeliverable(cleaned);

  return {
    cleaned,
    area,
    vertical,
    deliverable,
    output: [
      'Resumen ejecutivo',
      `- Pedido limpio: ${cleaned}`,
      `- Vertical: ${vertical}`,
      `- Ruta operativa: ${area}`,
      `- Entregable: ${deliverable}`,
      '',
      'Qué haría Wispy',
      '- Ordenar contexto y objetivo en un formato breve.',
      '- Detectar si requiere delegación, memoria o seguimiento.',
      '- Convertirlo en output listo para ejecutar o enviar.',
      '',
      'Siguiente paso sugerido',
      `- Ejecutar este pedido dentro del flujo ${vertical}.`
    ].join('\n')
  };
}

function makeCardTitle(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 72) || 'Nueva tarea Wispy';
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Method Not Allowed' })
    };
  }

  try {
    const { prompt, mode = 'plan', dryRun = false } = JSON.parse(event.body || '{}');
    if (!prompt || !String(prompt).trim()) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Prompt requerido' })
      };
    }

    const plan = buildPlan(prompt);

    if (mode === 'createCard') {
      const card = await createTrelloCard({
        area: plan.area,
        title: makeCardTitle(plan.cleaned),
        desc: [
          `Vertical: ${plan.vertical}`,
          `Ruta operativa: ${plan.area}`,
          '',
          plan.cleaned
        ].join('\n'),
        dryRun
      });

      appendActionLog({
        title: dryRun ? 'Dry run Trello' : 'Trello card creada',
        body: `${plan.area} · ${makeCardTitle(plan.cleaned)}`,
        time: 'ahora',
        tone: 'ok'
      });

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        },
        body: JSON.stringify({
          ok: true,
          mode,
          plan,
          card,
          output: dryRun
            ? `${plan.output}\n\nDry run Trello\n- Área: ${plan.area}\n- Título: ${makeCardTitle(plan.cleaned)}`
            : `${plan.output}\n\nTrello\n- Card creada: ${card.name}\n- Ruta: ${plan.area}`
        })
      };
    }

    appendActionLog({
      title: 'Plan de acción generado',
      body: `${plan.vertical} · ${plan.deliverable}`,
      time: 'ahora',
      tone: 'ok'
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({
        ok: true,
        mode,
        plan,
        output: plan.output
      })
    };
  } catch (error) {
    appendActionLog({
      title: 'Error en acción Ops',
      body: error.message,
      time: 'ahora',
      tone: 'danger'
    });
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: error.message })
    };
  }
};
