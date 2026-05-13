#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { run: runCfo } = require('./wispy-cfo-agent');

/**
 * Wispy-CFO E2E WhatsApp controller v5.
 *
 * STRICT ORDER:
 * 1. Whitelist.
 * 2. First async action after whitelist: send WhatsApp ACK "⏳ Procesando gasto...".
 * 3. Run CFO processor. Drive errors degrade inside the agent and do not stop Sheets.
 * 4. Sheets errors are reported to WhatsApp.
 * 5. Success: react ✅ then send final summary.
 */

const ACK_MESSAGE = '⏳ Procesando gasto...';
const LOG_PATH = process.env.WISPY_CFO_ROUTER_LOG || '/home/franco/.openclaw/workspace/logs/wispy-cfo-router.log';
const BURN_GROUP_JID = '120363406989655854@g.us';

const FINANCE_KEYWORDS = [
  'gasto', 'gastos', 'pagamos', 'pago', 'pagué', 'pague', 'transferencia',
  'pesos', 'ars', 'usd', '$', 'factura', 'recibo', 'ticket', 'comprobante',
  'presupuesto', 'seña', 'senia', 'honorarios', 'proveedor', 'arreglo',
  'mantenimiento', 'limpieza', 'suscripción', 'suscripcion', 'cuota', 'abono',
  'deposito', 'depósito', 'mercado pago', 'mp', 'banco', 'efectivo'
];

const ALLOWED_SCOPE = ['ambbi', 'metropolitan', 'uriburu', 'depto', 'departamento'];
const BLOCKED_SCOPE = ['canarian', 'personal', 'gasto personal'];

function ensureLogDir() { fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true }); }
function writeInternalLog(event) {
  ensureLogDir();
  fs.appendFileSync(LOG_PATH, JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n');
}

function hasAttachment(message = {}) {
  if (message.hasAttachment || message.hasMedia) return true;
  if (Array.isArray(message.attachments) && message.attachments.length > 0) return true;
  const mime = String(message.mimeType || message.mimetype || '').toLowerCase();
  return /image\/(png|jpe?g|webp)|application\/pdf/.test(mime);
}

function hasFinanceSignal(text = '') {
  const raw = String(text).toLowerCase();
  if (/(^|\s)(\$|ars|usd|u\$s|us\$)\s?\d|\d[\d.,]*\s?(ars|usd|pesos?)/i.test(raw)) return true;
  return FINANCE_KEYWORDS.some((keyword) => raw.includes(keyword));
}

function isBlocked(text = '') {
  const raw = String(text).toLowerCase();
  return BLOCKED_SCOPE.some((keyword) => raw.includes(keyword));
}

function scopeHint(text = '') {
  const raw = String(text).toLowerCase();
  return ALLOWED_SCOPE.find((keyword) => raw.includes(keyword)) || '';
}

function normalizeInbound(message = {}) {
  return {
    ...message,
    text: message.text || message.caption || message.transcript || message.body || message.message || '',
    messageId: message.messageId || message.message_id || message.id || '',
    chatId: message.chatId || message.chat_id || message.from || message.to || '',
    chatType: message.chatType || message.chat_type || (String(message.chatId || message.chat_id || '').endsWith('@g.us') ? 'group' : 'direct')
  };
}

function isWispyMentioned(message = {}) {
  const text = String(message.text || '');
  return message.wasMentioned === true || /@\s*wispy/i.test(text) || /wispy/i.test(text);
}

function shouldRouteToCfo(message = {}) {
  const normalized = normalizeInbound(message);
  const text = normalized.text;
  const isGroup = normalized.chatType === 'group' || String(normalized.chatId).endsWith('@g.us');
  const isBurnGroup = normalized.chatId === BURN_GROUP_JID;
  const mentioned = normalized.wasMentioned === true || /@\s*wispy/i.test(String(text)) || /\bwispy\b/i.test(String(text));
  if (isGroup && !isBurnGroup && !mentioned) {
    const result = { route: false, silent: true, reason: 'passive_group_requires_mention' };
    writeInternalLog({ messageId: normalized.messageId, chatId: normalized.chatId, decision: 'ignored', reason: result.reason, textPreview: String(text).slice(0, 180) });
    return result;
  }
  if (isBlocked(text)) {
    const result = {
      route: false,
      silent: false,
      reason: 'blocked_scope',
      reply: '❌ Este canal registra solo Ambbi/Metropolitan. CANARIAN o gastos personales quedan fuera.'
    };
    writeInternalLog({ messageId: normalized.messageId, chatId: normalized.chatId, decision: 'blocked_scope', textPreview: String(text).slice(0, 180) });
    return result;
  }
  const attachment = hasAttachment(normalized);
  const financeSignal = hasFinanceSignal(text);
  if (!attachment && !financeSignal) {
    const result = { route: false, silent: true, reason: 'no_finance_signal' };
    writeInternalLog({ messageId: normalized.messageId, chatId: normalized.chatId, decision: 'ignored', reason: result.reason, hasAttachment: attachment, financeSignal, textPreview: String(text).slice(0, 180) });
    return result;
  }
  const result = {
    route: true,
    silent: false,
    reason: attachment ? 'attachment_or_receipt' : 'finance_keyword',
    target: 'Wispy-CFO',
    ackMessage: ACK_MESSAGE,
    scopeHint: scopeHint(text),
    payload: normalized
  };
  writeInternalLog({ messageId: normalized.messageId, chatId: normalized.chatId, decision: 'routed', reason: result.reason, scopeHint: result.scopeHint, textPreview: String(text).slice(0, 180) });
  return result;
}

async function defaultSendMessage(text) {
  // OpenClaw runtime should inject the real WhatsApp sender. CLI mode prints an event for tests.
  console.log(JSON.stringify({ action: 'sendMessage', text }));
}

async function defaultReact(messageId, emoji) {
  // OpenClaw runtime should inject the real WhatsApp reaction sender.
  console.log(JSON.stringify({ action: 'react', messageId, emoji }));
}

async function handleWhatsAppExpense(message, io = {}) {
  const sendMessage = io.sendMessage || defaultSendMessage;
  const react = io.react || defaultReact;
  const route = shouldRouteToCfo(message);

  if (!route.route) {
    if (!route.silent && route.reply) await sendMessage(route.reply);
    return { ok: true, routed: false, route };
  }

  // FIRST ASYNC ACTION after whitelist. Do not move below any Drive/Sheets/DolarAPI work.
  await sendMessage(ACK_MESSAGE);

  let result;
  try {
    result = await runCfo(route.payload, { dryRun: !!io.dryRun });
  } catch (error) {
    const errorMessage = `❌ Error crítico: Falló el subagente CFO antes de escribir. Motivo: ${error.message}`;
    writeInternalLog({ messageId: route.payload.messageId, decision: 'agent_exception', error: error.message });
    await sendMessage(errorMessage);
    return { ok: false, routed: true, stage: 'agent', errorMessage };
  }

  if (!result.ok) {
    await sendMessage(result.errorMessage || '❌ Error crítico: No pude procesar el gasto.');
    return { ok: false, routed: true, result };
  }

  if (route.payload.messageId) await react(route.payload.messageId, '✅');
  await sendMessage(result.confirmationMessage);
  return { ok: true, routed: true, result };
}

if (require.main === module) {
  (async () => {
    const raw = process.argv[2] || fs.readFileSync(0, 'utf8');
    const message = JSON.parse(raw);
    const result = await handleWhatsAppExpense(message, { dryRun: process.env.WISPY_CFO_DRY_RUN === '1' });
    console.log(JSON.stringify({ controllerResult: result }, null, 2));
    if (!result.ok) process.exit(2);
  })().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
  });
}

module.exports = {
  ACK_MESSAGE,
  FINANCE_KEYWORDS,
  shouldRouteToCfo,
  handleWhatsAppExpense,
  hasFinanceSignal,
  hasAttachment,
  writeInternalLog,
  LOG_PATH,
  BURN_GROUP_JID
};
