#!/usr/bin/env node
'use strict';

/**
 * Wispy Finance Writer — Ambbi / Metropolitan burn ledger.
 *
 * Input: JSON from WhatsApp parser via --json, --file, or stdin.
 * Output: appends one row to Google Sheets after validating the canonical header.
 *
 * Required env:
 *   GOOGLE_APPLICATION_CREDENTIALS=/home/franco/.openclaw/workspace/secrets/google-sa-credentials.json
 *   WISPY_FINANCE_SPREADSHEET_ID=<Google Sheet ID shared with the service account>
 * Optional env:
 *   WISPY_FINANCE_SHEET_NAME="Gastos Ambbi"
 */

const fs = require('fs');
const crypto = require('crypto');

const DEFAULT_CREDENTIALS = '/home/franco/.openclaw/workspace/secrets/google-sa-credentials.json';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

const LEDGER_COLUMNS = [
  'ESTADO',
  'FECHA DE PAGO',
  'EMPRESA',
  'COST CENTER',
  'CATEGORIA',
  'DESCRIPCION',
  'EGRESO',
  'PESOS',
  'USD',
  'TIPO DE CAMBIO',
  'PROVEEDOR',
  'MEDIO DE PAGO',
  'PAGADO POR',
  'FECHA DE CARGA',
  'FUENTE',
  'NOTAS CFO',
  'CONFIANZA'
];

function usage() {
  console.log(`Usage:
  node scripts/wispy-finance-writer.js --print-email
  node scripts/wispy-finance-writer.js --dry-run --json '{"empresa":"Ambbi","descripcion":"Arreglos eléctricos","pesos":50000,"proveedor":"Gustavo Torres"}'
  node scripts/wispy-finance-writer.js --file expense.json
  cat expense.json | node scripts/wispy-finance-writer.js

Env:
  GOOGLE_APPLICATION_CREDENTIALS=${DEFAULT_CREDENTIALS}
  WISPY_FINANCE_SPREADSHEET_ID=<sheet-id>
  WISPY_FINANCE_SHEET_NAME=Gastos Ambbi`);
}

function parseArgs(argv) {
  const args = { dryRun: false, printEmail: false, json: null, file: null, help: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--print-email') args.printEmail = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--json') args.json = argv[++i];
    else if (arg === '--file') args.file = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function readCredentials() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || DEFAULT_CREDENTIALS;
  const raw = fs.readFileSync(credentialsPath, 'utf8');
  const credentials = JSON.parse(raw);
  if (credentials.type !== 'service_account' || !credentials.client_email || !credentials.private_key) {
    throw new Error(`Invalid service account credentials at ${credentialsPath}`);
  }
  return { credentials, credentialsPath };
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signJwt(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: credentials.client_email,
    scope: SCOPES.join(' '),
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(credentials.private_key, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${unsigned}.${signature}`;
}

async function getAccessToken(credentials) {
  const assertion = signJwt(credentials);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Google token error ${response.status}: ${JSON.stringify(payload)}`);
  return payload.access_token;
}

function sheetRange(sheetName, range) {
  const escaped = String(sheetName).replace(/'/g, "''");
  return `'${escaped}'!${range}`;
}

async function sheetsRequest({ token, spreadsheetId, path, method = 'GET', body }) {
  const response = await fetch(`${SHEETS_BASE}/${spreadsheetId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`Sheets API ${method} ${path} failed ${response.status}: ${text}`);
  return payload;
}

async function ensureHeader({ token, spreadsheetId, sheetName }) {
  const range = encodeURIComponent(sheetRange(sheetName, 'A1:Q1'));
  let current = [];
  try {
    const res = await sheetsRequest({ token, spreadsheetId, path: `/values/${range}` });
    current = res.values?.[0] || [];
  } catch (error) {
    if (!String(error.message).includes('Unable to parse range') && !String(error.message).includes('not found')) throw error;
    throw new Error(`No pude leer la pestaña "${sheetName}". Verificá que exista y que el Sheet esté compartido con la Service Account.`);
  }

  const matches = LEDGER_COLUMNS.every((col, idx) => current[idx] === col) && current.length === LEDGER_COLUMNS.length;
  if (matches) return { updated: false, columns: LEDGER_COLUMNS };

  await sheetsRequest({
    token,
    spreadsheetId,
    path: `/values/${range}?valueInputOption=RAW`,
    method: 'PUT',
    body: { range: sheetRange(sheetName, 'A1:Q1'), majorDimension: 'ROWS', values: [LEDGER_COLUMNS] }
  });
  return { updated: true, previous: current, columns: LEDGER_COLUMNS };
}

function pick(input, keys, fallback = '') {
  for (const key of keys) {
    if (input[key] !== undefined && input[key] !== null && input[key] !== '') return input[key];
  }
  return fallback;
}

function normalizeMoney(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'number') return value;
  const cleaned = String(value).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  return cleaned === '' ? '' : Number(cleaned);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowISO() {
  return new Date().toISOString();
}

function buildLedgerRow(input) {
  const moneda = String(pick(input, ['moneda', 'moneda_original', 'currency'], '')).toUpperCase();
  const monto = normalizeMoney(pick(input, ['monto', 'monto_original', 'amount'], ''));
  const pesos = normalizeMoney(pick(input, ['PESOS', 'pesos', 'ars'], moneda === 'ARS' ? monto : ''));
  const usd = normalizeMoney(pick(input, ['USD', 'usd'], moneda === 'USD' ? monto : ''));
  const tipoCambio = normalizeMoney(pick(input, ['TIPO DE CAMBIO', 'tipo_de_cambio', 'fx', 'tc'], ''));
  const egreso = normalizeMoney(pick(input, ['EGRESO', 'egreso'], monto || pesos || usd || ''));

  return [
    pick(input, ['ESTADO', 'estado'], 'PENDIENTE'),
    pick(input, ['FECHA DE PAGO', 'fecha_de_pago', 'fecha_pago', 'fecha'], todayISO()),
    pick(input, ['EMPRESA', 'empresa'], 'Ambbi'),
    pick(input, ['COST CENTER', 'cost_center', 'unidad', 'propiedad'], 'General'),
    pick(input, ['CATEGORIA', 'categoria'], 'REVISAR'),
    pick(input, ['DESCRIPCION', 'descripcion', 'concepto', 'description'], ''),
    egreso,
    pesos,
    usd,
    tipoCambio,
    pick(input, ['PROVEEDOR', 'proveedor', 'vendor'], ''),
    pick(input, ['MEDIO DE PAGO', 'medio_de_pago', 'payment_method'], ''),
    pick(input, ['PAGADO POR', 'pagado_por', 'paid_by'], 'Franco'),
    pick(input, ['FECHA DE CARGA', 'fecha_de_carga', 'loaded_at'], nowISO()),
    pick(input, ['FUENTE', 'fuente', 'source'], 'WhatsApp'),
    pick(input, ['NOTAS CFO', 'notas_cfo', 'notas', 'notes'], ''),
    pick(input, ['CONFIANZA', 'confianza', 'confidence'], 'media')
  ];
}

async function readInput(args) {
  if (args.json) return JSON.parse(args.json);
  if (args.file) return JSON.parse(fs.readFileSync(args.file, 'utf8'));
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (raw) return JSON.parse(raw);
  }
  throw new Error('Missing input JSON. Use --json, --file, or stdin.');
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) return usage();
  const { credentials, credentialsPath } = readCredentials();

  if (args.printEmail) {
    console.log(JSON.stringify({ serviceAccountEmail: credentials.client_email, projectId: credentials.project_id, credentialsPath }, null, 2));
    return;
  }

  const input = await readInput(args);
  const row = buildLedgerRow(input);
  const sheetName = process.env.WISPY_FINANCE_SHEET_NAME || 'Gastos Ambbi';
  const spreadsheetId = process.env.WISPY_FINANCE_SPREADSHEET_ID || input.spreadsheetId;

  if (args.dryRun) {
    console.log(JSON.stringify({ dryRun: true, sheetName, columns: LEDGER_COLUMNS, row }, null, 2));
    return;
  }
  if (!spreadsheetId) throw new Error('Missing WISPY_FINANCE_SPREADSHEET_ID or input.spreadsheetId');

  const token = await getAccessToken(credentials);
  const header = await ensureHeader({ token, spreadsheetId, sheetName });
  const appendRange = encodeURIComponent(sheetRange(sheetName, 'A:Q'));
  const append = await sheetsRequest({
    token,
    spreadsheetId,
    path: `/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    method: 'POST',
    body: { values: [row] }
  });

  console.log(JSON.stringify({ ok: true, sheetName, header, append: append.updates || append }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
