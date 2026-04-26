const { getContextData, getInbox } = require('./_wispy-panel-utils');

function buildSystemPrompt(context) {
  return [
    'Sos Wispy, asistente ejecutivo privado de Franco Garbini.',
    'Respondé en español argentino con voseo, tono ejecutivo, directo y breve.',
    'Priorizá Ambbi, Gringo Estate y foco operativo real.',
    'No menciones secretos ni detalles sensibles de Canarian Financiera.',
    '',
    'Contexto real:',
    `- Portfolio actual: ${context.portfolio}`,
    `- Prioridades: ${context.priorities.join(' | ')}`,
    `- Staff clave: ${context.staff.join(' | ')}`,
    `- Estilo: ${context.communication.join(' | ')}`,
    `- Memoria diaria reciente: ${context.daily.join(' | ')}`
  ].join('\n');
}

function fallbackReply(message, context, inbox) {
  const firstPriority = context.priorities[0] || 'ordenar foco operativo';
  const firstInbox = inbox.find((item) => item.status !== 'done')?.title || 'sin pendientes cargados';
  return [
    `Te bajo esto directo: ${message.trim()}`,
    '',
    `- Prioridad conectada: ${firstPriority}.`,
    `- Inbox actual: ${firstInbox}.`,
    `- Recomendación: convierto esto en brief corto + próximo paso ejecutable.`
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
    const { message, history = [] } = JSON.parse(event.body || '{}');
    if (!message || !String(message).trim()) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'message requerido' })
      };
    }

    const context = getContextData();
    const inbox = getInbox();
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({ ok: true, reply: fallbackReply(message, context, inbox), mode: 'fallback' })
      };
    }

    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

    const transcript = history
      .slice(-8)
      .map((entry) => `${entry.role === 'assistant' ? 'Wispy' : 'Franco'}: ${entry.content}`)
      .join('\n');

    const prompt = [
      buildSystemPrompt(context),
      '',
      transcript ? `Historial reciente:\n${transcript}` : '',
      `Franco: ${message}`,
      'Wispy:'
    ].filter(Boolean).join('\n\n');

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ok: true, reply: text, mode: 'gemini' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: error.message })
    };
  }
};
