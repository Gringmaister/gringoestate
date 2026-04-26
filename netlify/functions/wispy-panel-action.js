function detectArea(text) {
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

function buildResponse(prompt) {
  const cleaned = String(prompt || '').replace(/\s+/g, ' ').trim();
  const area = detectArea(cleaned);
  const deliverable = detectDeliverable(cleaned);

  return [
    'Resumen ejecutivo',
    `- Pedido limpio: ${cleaned}`,
    `- Vertical: ${area}`,
    `- Entregable: ${deliverable}`,
    '',
    'Qué haría Wispy',
    '- Ordenar contexto y objetivo en un formato breve.',
    '- Detectar si requiere delegación, memoria o seguimiento.',
    '- Convertirlo en output listo para ejecutar o enviar.',
    '',
    'Siguiente paso sugerido',
    `- Ejecutar este pedido dentro del flujo ${area}.`
  ].join('\n');
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
    const { prompt } = JSON.parse(event.body || '{}');
    if (!prompt || !String(prompt).trim()) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Prompt requerido' })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({
        ok: true,
        output: buildResponse(prompt)
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: error.message })
    };
  }
};
