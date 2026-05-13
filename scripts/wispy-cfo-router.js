#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Wispy-CFO WhatsApp whitelist router.
 *
 * v3 feedback protocol:
 * - If a message passes whitelist, caller must immediately send ACK_MESSAGE.
 * - If a message is ignored, write an internal log line (no group reply).
 * - If blocked by scope, reply with the blocked-scope message.
 */

const ACK_MESSAGE = '⏳ Leyendo información y procesando comprobante...';
const LOG_PATH = process.env.WISPY_CFO_ROUTER_LOG || '/home/franco/.openclaw/workspace/logs/wispy-cfo-router.log';

const FINANCE_KEYWORDS = [
  'gasto', 'gastos', 'pagamos', 'pago', 'pagué', 'pague', 'transferencia',
  'pesos', 'ars', 'usd', '$', 'factura', 'recibo', 'ticket', 'comprobante',
  'presupuesto', 'seña', 'senia', 'honorarios', 'proveedor', 'arreglo',
  'mantenimiento', 'limpieza', 'suscripción', 'suscripcion', 'cuota', 'abono',
  'deposito', 'depósito', 'mercado pago', 'mp', 'banco', 'efectivo'
];

const ALLOWED_SCOPE = ['ambbi', 'metropolitan', 'uriburu', 'depto', 'departamento'];
const BLOCKED_SCOPE = ['canarian', 'personal', 'gasto personal'];

function ensureLogDir() {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
}

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

function shouldRouteToCfo(message = {}) {
  const text = message.text || message.caption || message.transcript || message.body || '';
  const messageId = message.messageId || message.message_id || message.id || '';
  if (isBlocked(text)) {
    const result = {
      route: false,
      silent: false,
      reason: 'blocked_scope',
      reply: '❌ Este canal registra solo Ambbi/Metropolitan. CANARIAN o gastos personales quedan fuera.'
    };
    writeInternalLog({ messageId, decision: 'blocked_scope', textPreview: String(text).slice(0, 180) });
    return result;
  }
  const attachment = hasAttachment(message);
  const financeSignal = hasFinanceSignal(text);
  if (!attachment && !financeSignal) {
    const result = { route: false, silent: true, reason: 'no_finance_signal' };
    writeInternalLog({ messageId, decision: 'ignored', reason: result.reason, hasAttachment: attachment, financeSignal, textPreview: String(text).slice(0, 180) });
    return result;
  }
  const result = {
    route: true,
    silent: false,
    reason: attachment ? 'attachment_or_receipt' : 'finance_keyword',
    target: 'Wispy-CFO',
    ackMessage: ACK_MESSAGE,
    scopeHint: scopeHint(text),
    payload: message
  };
  writeInternalLog({ messageId, decision: 'routed', reason: result.reason, scopeHint: result.scopeHint, textPreview: String(text).slice(0, 180) });
  return result;
}

if (require.main === module) {
  const raw = process.argv[2] || fs.readFileSync(0, 'utf8');
  const message = JSON.parse(raw);
  console.log(JSON.stringify(shouldRouteToCfo(message), null, 2));
}

module.exports = { ACK_MESSAGE, FINANCE_KEYWORDS, shouldRouteToCfo, hasFinanceSignal, hasAttachment, writeInternalLog, LOG_PATH };
