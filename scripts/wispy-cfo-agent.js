#!/usr/bin/env node
'use strict';

/**
 * Wispy-CFO Agent — isolated financial subagent for Ambbi / Metropolitan.
 *
 * Responsibilities:
 *  - Parse WhatsApp text/audio transcripts into strict Burn ambbi schema.
 *  - Convert ARS -> USD using dolarapi blue venta.
 *  - Upload receipts to Drive monthly folders when a local attachment path is provided.
 *  - Append a fixed-width row to Google Sheets in the immutable order requested by Franco.
 *  - Never fail silently: every Drive/Sheets call is wrapped and returns an explicit user-facing error.
 *
 * This script intentionally returns a protocol object instead of sending WhatsApp directly;
 * OpenClaw owns channel delivery/reactions. On success, caller must react ✅ to the original message,
 * then send result.confirmationMessage.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_CREDENTIALS = '/home/franco/.openclaw/workspace/secrets/google-sa-credentials.json';
const DEFAULT_SPREADSHEET_ID = '1htz5jbM26ZnjTCC7rl43g46pPhjDoVjUAlmwMaDfGoE';
const DEFAULT_SHEET_NAME = 'Burn ambbi';
const DEFAULT_DRIVE_ROOT_ID = '1cD4Vs5UbZTlKpGhvYEHRveqfqYJ7jUTb';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const DOLAR_BLUE_URL = 'https://dolarapi.com/v1/dolares/blue';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'];

const MONTHS_ES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

const ROW_COLUMNS = Object.freeze([
  'ESTADO',
  'COST CENTER',
  'AÑO',
  'N° MES',
  'MES',
  'CATEGORIA',
  'EMPRESA',
  'DEPTO',
  'DESCRIPCION',
  'CANTIDAD',
  'EGRESO',
  'MEDIO DE PAGO',
  'PRECIO UNITARIO',
  'PESOS',
  'USD',
  'TIPO DE CAMBIO',
  'FECHA DE PAGO',
  'CUOTAS',
  'ANOTACIONES',
  'COMPROBANTE (LINK)',
  'ANOTACIONES_2',
  'FUENTE DEL DATO',
  'NOTAS DEL SISTEMA'
]);

const STRICT_OUTPUT_SCHEMA = Object.freeze({
  name: 'wispy_cfo_burn_ambbi_row',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ROW_COLUMNS,
    properties: Object.fromEntries(ROW_COLUMNS.map((key) => [key, { type: ['string', 'number'] }]))
  }
});

const VENDOR_FIXES = new Map([
  ['gustavo torres', 'Gustavo J. Torres'],
  ['gustavo j torres', 'Gustavo J. Torres'],
  ['gustavo j. torres', 'Gustavo J. Torres'],
  ['lewy', 'Lewi'],
  ['lewi', 'Lewi'],
  ['cantor', 'Kantor'],
  ['kantor', 'Kantor']
]);

function parseArgs(argv) {
  const args = { json: null, file: null, text: null, dryRun: false, schema: false, printEmail: false, help: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = argv[++i];
    else if (arg === '--file') args.file = argv[++i];
    else if (arg === '--text') args.text = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--schema') args.schema = true;
    else if (arg === '--print-email') args.printEmail = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node scripts/wispy-cfo-agent.js --schema
  node scripts/wispy-cfo-agent.js --print-email
  node scripts/wispy-cfo-agent.js --dry-run --text "Pago a Gustavo Torres de 50.000 ARS por arreglos eléctricos en Uriburu"
  node scripts/wispy-cfo-agent.js --json '{"text":"Suscripción software 50 USD","messageId":"..."}'
  node scripts/wispy-cfo-agent.js --file inbound.json

Success protocol:
  1. react ✅ to input.messageId only after result.ok === true
  2. send result.confirmationMessage
Failure protocol:
  send result.errorMessage; do not react ✅`);
}

function readCredentials() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || DEFAULT_CREDENTIALS;
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  if (!credentials.client_email || !credentials.private_key) throw new Error(`Invalid Google service account at ${credentialsPath}`);
  return { credentials, credentialsPath };
}

function b64(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signJwt(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64(JSON.stringify({
    iss: credentials.client_email,
    scope: SCOPES.join(' '),
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now
  }))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(credentials.private_key, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
}

async function getAccessToken(credentials) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signJwt(credentials) })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Google token error ${response.status}: ${JSON.stringify(payload)}`);
  return payload.access_token;
}

async function googleJson(url, { token, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${url} -> ${response.status}: ${text}`);
  return payload;
}

function normalizeMoney(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'number') return value;
  const raw = String(value).trim();
  const decimalComma = raw.includes(',') && (!raw.includes('.') || raw.lastIndexOf(',') > raw.lastIndexOf('.'));
  const thousandsDot = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw.replace(/[^0-9.,-]/g, ''));
  const cleaned = decimalComma || thousandsDot
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/,/g, '');
  const numeric = cleaned.replace(/[^0-9.-]/g, '');
  return numeric === '' ? '' : Number(numeric);
}

function formatDate(date = new Date()) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function parseDate(value) {
  if (!value) return new Date();
  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) return new Date(Number(match[3].length === 2 ? `20${match[3]}` : match[3]), Number(match[2]) - 1, Number(match[1]));
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function monthFolderName(date) {
  const proper = MONTHS_ES[date.getMonth()][0] + MONTHS_ES[date.getMonth()].slice(1).toLowerCase();
  return `${String(date.getMonth() + 1).padStart(2, '0')} - ${proper}`;
}

function safeName(value) {
  return String(value || 'Sin proveedor').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function normalizeVendor(value) {
  const raw = String(value || '').trim();
  const key = raw.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
  return VENDOR_FIXES.get(key) || raw;
}

function validateScope(text, company) {
  const raw = `${text || ''} ${company || ''}`.toLowerCase();
  if (raw.includes('canarian')) throw new Error('Scope rechazado: CANARIAN no se registra en este canal Ambbi/Metropolitan.');
  if (raw.includes('personal') || raw.includes('gasto personal')) throw new Error('Scope rechazado: gasto personal fuera del canal Ambbi/Metropolitan.');
}

async function fetchBlueRate() {
  const response = await fetch(DOLAR_BLUE_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`dolarapi error ${response.status}`);
  const payload = await response.json();
  const venta = Number(payload.venta);
  if (!Number.isFinite(venta) || venta <= 0) throw new Error(`dolarapi venta inválida: ${JSON.stringify(payload)}`);
  return venta;
}

function extractProvider(text) {
  const lower = String(text || '').toLowerCase();
  for (const key of VENDOR_FIXES.keys()) if (lower.includes(key)) return VENDOR_FIXES.get(key);
  const toMatch = text.match(/(?:a|para|proveedor)\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ.]+(?:\s+[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ.]+){0,3})/);
  return toMatch ? normalizeVendor(toMatch[1]) : '';
}

function extractAmountAndCurrency(text) {
  const raw = String(text || '');
  const usd = raw.match(/(?:usd|u\$s|us\$|d[oó]lares?)\s*([\d.,]+)|([\d.,]+)\s*(?:usd|u\$s|us\$|d[oó]lares?)/i);
  if (usd) return { currency: 'USD', amount: normalizeMoney(usd[1] || usd[2]) };
  const ars = raw.match(/(?:ars|\$|pesos?)\s*([\d.,]+)|([\d.,]+)\s*(?:ars|pesos?)/i);
  if (ars) return { currency: 'ARS', amount: normalizeMoney(ars[1] || ars[2]) };
  return { currency: '', amount: '' };
}

function guessCategory(text) {
  const raw = String(text || '').toLowerCase();
  if (/el[eé]ctric|arreglo|reparaci[oó]n|mantenimiento|plomer|gasista|pintur/.test(raw)) return 'Mantenimiento';
  if (/limpieza|sandra|lavander/.test(raw)) return 'Limpieza';
  if (/software|suscrip|app|sistema|saas/.test(raw)) return 'Software';
  if (/meli|insumo|bid[oó]n|blanqueador|suministro/.test(raw)) return 'Insumos';
  return 'REVISAR';
}

function guessCostCenter(text, company) {
  const raw = String(text || '').toLowerCase();
  if (raw.includes('uriburu')) return 'Uriburu 1070';
  if (raw.includes('metropolitan')) return 'Metropolitan General';
  return company === 'Metropolitan' ? 'Metropolitan General' : 'Ambbi General';
}

function deterministicParse(input, fx) {
  const text = input.text || input.transcript || input.message || input.DESCRIPCION || '';
  const paymentDate = parseDate(input.fecha || input['FECHA DE PAGO']);
  const company = /metropolitan/i.test(`${text} ${input.empresa || ''}`) ? 'Metropolitan' : 'Ambbi';
  validateScope(text, company);
  const provider = normalizeVendor(input.proveedor || extractProvider(text));
  const amount = extractAmountAndCurrency(text);
  const currency = String(input.moneda || amount.currency || '').toUpperCase();
  const originalAmount = normalizeMoney(input.monto || input.amount || amount.amount || input.PESOS || input.USD || '');
  let pesos = normalizeMoney(input.PESOS || input.pesos || (currency === 'ARS' ? originalAmount : ''));
  let usd = normalizeMoney(input.USD || input.usd || (currency === 'USD' ? originalAmount : ''));
  let tipoCambio = normalizeMoney(input['TIPO DE CAMBIO'] || input.tipo_de_cambio || input.fx || '');
  if (pesos && !usd) {
    tipoCambio = tipoCambio || fx;
    usd = Number((pesos / tipoCambio).toFixed(2));
  }
  if (usd && !pesos && tipoCambio) pesos = Number((usd * tipoCambio).toFixed(2));

  const rowObject = {
    ESTADO: input.ESTADO || input.estado || 'pagado',
    'COST CENTER': input['COST CENTER'] || input.cost_center || guessCostCenter(text, company),
    AÑO: paymentDate.getFullYear(),
    'N° MES': paymentDate.getMonth() + 1,
    MES: MONTHS_ES[paymentDate.getMonth()],
    CATEGORIA: input.CATEGORIA || input.categoria || guessCategory(text),
    EMPRESA: company,
    DEPTO: input.DEPTO || input.depto || '',
    DESCRIPCION: input.DESCRIPCION || input.descripcion || text,
    CANTIDAD: input.CANTIDAD || input.cantidad || 1,
    EGRESO: input.EGRESO || input.egreso || input.CATEGORIA || input.categoria || guessCategory(text),
    'MEDIO DE PAGO': input['MEDIO DE PAGO'] || input.medio_de_pago || '',
    'PRECIO UNITARIO': input['PRECIO UNITARIO'] || input.precio_unitario || originalAmount || pesos || usd || '',
    PESOS: pesos || '',
    USD: usd || '',
    'TIPO DE CAMBIO': tipoCambio || '',
    'FECHA DE PAGO': formatDate(paymentDate),
    CUOTAS: input.CUOTAS || input.cuotas || '',
    ANOTACIONES: input.ANOTACIONES || input.anotaciones || (provider ? `Proveedor: ${provider}` : ''),
    'COMPROBANTE (LINK)': input['COMPROBANTE (LINK)'] || input.COMPROBANTE || input.comprobante || input.comprobante_link || '',
    ANOTACIONES_2: '',
    'FUENTE DEL DATO': input['FUENTE DEL DATO'] || input.FUENTE || input.fuente || 'Wispy-CFO Automático',
    'NOTAS DEL SISTEMA': input['NOTAS DEL SISTEMA'] || input['NOTAS CFO'] || input.notas_cfo || `Dólar Blue Venta a $${fx}`
  };
  return rowObject;
}

function validateStrictObject(obj) {
  const extra = Object.keys(obj).filter((key) => !ROW_COLUMNS.includes(key));
  const missing = ROW_COLUMNS.filter((key) => !(key in obj));
  if (extra.length || missing.length) throw new Error(`Structured output inválido. Extra=[${extra.join(', ')}] Missing=[${missing.join(', ')}]`);
  return obj;
}

function rowFromObject(obj) {
  return ROW_COLUMNS.map((key) => obj[key] ?? '');
}

async function findOrCreateFolder({ token, parentId, name }) {
  const q = [`mimeType='application/vnd.google-apps.folder'`, `name='${String(name).replace(/'/g, "\\'")}'`, `'${parentId}' in parents`, 'trashed=false'].join(' and ');
  const search = await googleJson(`${DRIVE_BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&supportsAllDrives=true&includeItemsFromAllDrives=true`, { token });
  if (search.files?.[0]) return search.files[0];
  return googleJson(`${DRIVE_BASE}/files?fields=id,name,webViewLink&supportsAllDrives=true`, {
    token,
    method: 'POST',
    body: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }
  });
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

async function uploadReceipt({ token, rootId, filePath, rowObject }) {
  if (!filePath) return { skipped: true, link: rowObject['COMPROBANTE (LINK)'] || '' };
  if (!fs.existsSync(filePath)) throw new Error(`Comprobante no encontrado: ${filePath}`);
  const [day, month, year] = String(rowObject['FECHA DE PAGO']).split('/').map(Number);
  const date = new Date(year, month - 1, day);
  const yearFolder = await findOrCreateFolder({ token, parentId: rootId, name: String(year) });
  const monthFolder = await findOrCreateFolder({ token, parentId: yearFolder.id, name: monthFolderName(date) });
  const provider = String(rowObject.ANOTACIONES || '').replace(/^Proveedor:\s*/i, '') || 'Sin proveedor';
  const amount = rowObject.PESOS || rowObject.USD || rowObject['PRECIO UNITARIO'] || '';
  const filename = `${date.toISOString().slice(0, 10)} - ${safeName(provider)} - ${safeName(amount)}${path.extname(filePath)}`;
  const metadata = await googleJson(`${DRIVE_BASE}/files?fields=id,name,webViewLink&supportsAllDrives=true`, {
    token,
    method: 'POST',
    body: { name: filename, parents: [monthFolder.id] }
  });
  const response = await fetch(`${DRIVE_UPLOAD_BASE}/files/${metadata.id}?uploadType=media&supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeFor(filePath) },
    body: fs.readFileSync(filePath)
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(`Drive media upload ${response.status}: ${JSON.stringify(payload)}`);
  }
  return { skipped: false, folder: `${year}/${monthFolderName(date)}`, file: metadata.name, link: metadata.webViewLink || `https://drive.google.com/file/d/${metadata.id}/view` };
}

function sheetRange(sheetName, range) {
  return `'${String(sheetName).replace(/'/g, "''")}'!${range}`;
}

async function appendSheetRow({ token, spreadsheetId, sheetName, row }) {
  const range = encodeURIComponent(sheetRange(sheetName, 'A:W'));
  return googleJson(`${SHEETS_BASE}/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    token,
    method: 'POST',
    body: { values: [row] }
  });
}

function confirmation(rowObject, driveResult) {
  const ars = rowObject.PESOS ? `$${rowObject.PESOS} ARS` : '';
  const usd = rowObject.USD ? `$${rowObject.USD} USD` : '';
  const costCenter = rowObject['COST CENTER'] || rowObject.DEPTO || '—';
  const receipt = driveResult?.link || rowObject['COMPROBANTE (LINK)'] || 'Sin comprobante adjunto';
  return `✅ **Gasto cargado correctamente**\n- **Monto:** ${ars || '—'} / ${usd || '—'} (Dólar Blue: ${rowObject['TIPO DE CAMBIO'] || 'N/A'})\n- **Empresa:** ${rowObject.EMPRESA || '—'}\n- **Unidad/Depto:** ${costCenter}\n- **Comprobante:** ${receipt}`;
}

async function readInput(args) {
  if (args.text) return { text: args.text };
  if (args.json) return JSON.parse(args.json);
  if (args.file) return JSON.parse(fs.readFileSync(args.file, 'utf8'));
  if (!process.stdin.isTTY) {
    const raw = fs.readFileSync(0, 'utf8').trim();
    if (raw) return JSON.parse(raw);
  }
  throw new Error('Falta input. Usá --text, --json, --file o stdin.');
}

async function run(input, { dryRun = false } = {}) {
  const spreadsheetId = process.env.WISPY_FINANCE_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
  const sheetName = process.env.WISPY_FINANCE_SHEET_NAME || DEFAULT_SHEET_NAME;
  const driveRootId = process.env.WISPY_FINANCE_DRIVE_ROOT_ID || DEFAULT_DRIVE_ROOT_ID;
  const fx = await fetchBlueRate();
  const rowObject = validateStrictObject(deterministicParse(input, fx));
  let driveResult = { skipped: true, link: rowObject['COMPROBANTE (LINK)'] || '' };
  let sheetResult = null;

  const attachmentPath = input.attachmentPath || input.comprobantePath || input.receiptPath || input.filePath || '';
  if (dryRun) {
    return { ok: true, dryRun: true, structuredOutputSchema: STRICT_OUTPUT_SCHEMA, rowColumns: ROW_COLUMNS, rowObject, row: rowFromObject(rowObject), confirmationMessage: confirmation(rowObject, driveResult) };
  }

  const { credentials } = readCredentials();
  const token = await getAccessToken(credentials);

  try {
    driveResult = await uploadReceipt({ token, rootId: driveRootId, filePath: attachmentPath, rowObject });
    rowObject['COMPROBANTE (LINK)'] = driveResult.link || rowObject['COMPROBANTE (LINK)'] || '';
  } catch (error) {
    const quota = String(error.message || '').includes('storageQuotaExceeded') || String(error.message || '').includes('Service Accounts do not have storage quota');
    driveResult = {
      skipped: false,
      degraded: true,
      error: error.message,
      link: quota ? '⚠️ Error: Cuota Drive excedida' : `⚠️ Error Drive: ${error.message}`
    };
    rowObject['COMPROBANTE (LINK)'] = driveResult.link;
  }

  try {
    sheetResult = await appendSheetRow({ token, spreadsheetId, sheetName, row: rowFromObject(rowObject) });
  } catch (error) {
    return { ok: false, stage: 'sheets', errorMessage: `❌ Error crítico: No pude escribir en la planilla. Motivo: ${error.message}`, drive: driveResult };
  }

  return {
    ok: true,
    reaction: { emoji: '✅', messageId: input.messageId || input.message_id || '' },
    confirmationMessage: confirmation(rowObject, driveResult),
    rowObject,
    row: rowFromObject(rowObject),
    drive: driveResult,
    sheets: sheetResult.updates || sheetResult
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) return usage();
  if (args.schema) return console.log(JSON.stringify({ rowColumns: ROW_COLUMNS, structuredOutputSchema: STRICT_OUTPUT_SCHEMA }, null, 2));
  if (args.printEmail) {
    const { credentials, credentialsPath } = readCredentials();
    return console.log(JSON.stringify({ serviceAccountEmail: credentials.client_email, credentialsPath, spreadsheetId: DEFAULT_SPREADSHEET_ID, sheetName: DEFAULT_SHEET_NAME, driveRootId: DEFAULT_DRIVE_ROOT_ID }, null, 2));
  }
  const input = await readInput(args);
  const result = await run(input, { dryRun: args.dryRun });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(2);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, stage: 'agent', errorMessage: `❌ Error Wispy-CFO: ${error.message}` }, null, 2));
    process.exit(1);
  });
}

module.exports = { ROW_COLUMNS, STRICT_OUTPUT_SCHEMA, deterministicParse, rowFromObject, run };
