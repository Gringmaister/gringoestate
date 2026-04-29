const { getContextData, updateCollaborator, appendActionLog, appendBug } = require('./_wispy-panel-utils');
const { proxyPortableApi } = require('./_wispy-portable-proxy');

function inferChannel(item) {
  const role = (item.role || '').toLowerCase();
  if (role.includes('mantenimiento')) return 'maintenance';
  if (role.includes('admin')) return 'admin';
  return 'inbox';
}

function buildFollowUpMessage(item) {
  const pending = item.pending || 'este pendiente';
  return `Hola ${item.name}, te sigo por ${pending}. ¿Cómo venís con esto? Si necesitás algo para cerrarlo hoy, decímelo y lo ordenamos.`;
}

exports.handler = async function (event) {
  const proxied = await proxyPortableApi(event, 'api/followup');
  if (proxied) return proxied;
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Method Not Allowed' })
    };
  }

  try {
    const { name, mode = 'prepare' } = JSON.parse(event.body || '{}');
    if (!name) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'name requerido' })
      };
    }

    const context = getContextData();
    const collaborator = (context.collaborators || []).find((item) => item.name === name);
    if (!collaborator) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'colaborador no encontrado' })
      };
    }

    const message = buildFollowUpMessage(collaborator);

    if (mode === 'trigger') {
      const nowIso = new Date().toISOString();
      const nextReviewAt = new Date(Date.now() + ((Number(collaborator.slaHours) || 24) * 60 * 60 * 1000)).toISOString();
      updateCollaborator(name, {
        status: 'follow-up enviado',
        statusTone: 'ok',
        lastContact: 'recién',
        lastContactAt: nowIso,
        waitingSinceAt: nowIso,
        nextAction: `Revisar respuesta antes de ${nextReviewAt.slice(0, 16).replace('T', ' ')}`,
        lastFollowUpMessage: message,
        nextReviewAt,
        followUpCount: Number(collaborator.followUpCount || 0) + 1
      });
      appendActionLog({
        title: 'Follow-up preparado',
        body: `${name} · ${collaborator.pending}`,
        time: 'ahora',
        tone: 'ok'
      });
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({
          ok: true,
          mode,
          collaborator: name,
          channel: inferChannel(collaborator),
          message,
          note: 'Follow-up registrado y trazado. Falta aún la salida automática real al canal externo.'
        })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        ok: true,
        mode,
        collaborator: name,
        channel: inferChannel(collaborator),
        message
      })
    };
  } catch (error) {
    appendActionLog({
      title: 'Error follow-up',
      body: error.message,
      time: 'ahora',
      tone: 'danger'
    });
    appendBug({
      title: 'Fallo en follow-up',
      flow: 'wispy-panel-followup',
      severity: 'high',
      detail: error.message,
      impact: 'No se pudo preparar o registrar el follow-up.'
    });
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: error.message })
    };
  }
};
