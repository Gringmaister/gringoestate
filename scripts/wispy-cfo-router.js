#!/usr/bin/env node
'use strict';

const fs = require('fs');

/**
 * Wispy-CFO WhatsApp whitelist router.
 *
 * Gate BEFORE any LLM/CFO processing:
 * - Ignore silently when no attachment AND no financial keyword/amount.
 * - Route only Ambbi/Metropolitan-like financial messages to scripts/wispy-cfo-agent.js.
 * - Reject CANARIAN/personal scope explicitly.
 *
 * This module is intentionally side-effect-light: OpenClaw runtime calls should use
 * shouldRouteToCfo(message) before spawning/running Wispy-CFO.
 */

const FINANCE_KEYWORDS = [
  'gasto', 'gastos', 'pagamos', 'pago', 'pagué', 'pague', 'transferencia',
  'pesos', 'ars', 'usd', '$', 'factura', 'recibo', 'ticket', 'comprobante',
  'presupuesto', 'seña', 'senia', 'honorarios', 'proveedor', 'arreglo',
  'mantenimiento', 'limpieza', 'suscripción', 'suscripcion', 'cuota'
];

const ALLOWED_SCOPE = ['ambbi', 'metropolitan', 'uriburu', 'depto', 'departamento'];
const BLOCKED_SCOPE = ['canarian', 'personal', 'gasto personal'];

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
  if (isBlocked(text)) {
    return {
      route: false,
      silent: false,
      reason: 'blocked_scope',
      reply: '❌ Este canal registra solo Ambbi/Metropolitan. CANARIAN o gastos personales quedan fuera.'
    };
  }
  const attachment = hasAttachment(message);
  const financeSignal = hasFinanceSignal(text);
  if (!attachment && !financeSignal) return { route: false, silent: true, reason: 'no_finance_signal' };
  return {
    route: true,
    silent: false,
    reason: attachment ? 'attachment_or_receipt' : 'finance_keyword',
    target: 'Wispy-CFO',
    scopeHint: scopeHint(text),
    payload: message
  };
}

if (require.main === module) {
  const raw = process.argv[2] || fs.readFileSync(0, 'utf8');
  const message = JSON.parse(raw);
  console.log(JSON.stringify(shouldRouteToCfo(message), null, 2));
}

module.exports = { FINANCE_KEYWORDS, shouldRouteToCfo, hasFinanceSignal, hasAttachment };
