#!/usr/bin/env node
'use strict';

const fs = require('fs');
const crypto = require('crypto');

const DEFAULT_CREDENTIALS = '/home/franco/.openclaw/workspace/secrets/google-sa-credentials.json';
const SPREADSHEET_ID = process.env.WISPY_FINANCE_SPREADSHEET_ID || '1htz5jbM26ZnjTCC7rl43g46pPhjDoVjUAlmwMaDfGoE';
const SHEET_NAME = process.env.WISPY_FINANCE_SHEET_NAME || 'Burn ambbi';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

function b64(input) { return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function creds() { return JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || DEFAULT_CREDENTIALS, 'utf8')); }
function signJwt(c) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64(JSON.stringify({ iss: c.client_email, scope: SCOPES.join(' '), aud: TOKEN_URL, exp: now + 3600, iat: now }))}`;
  const signer = crypto.createSign('RSA-SHA256'); signer.update(unsigned); signer.end();
  return `${unsigned}.${signer.sign(c.private_key, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
}
async function token() {
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signJwt(creds()) }) });
  const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); return j.access_token;
}
function range(sheet, a1) { return `'${String(sheet).replace(/'/g, "''")}'!${a1}`; }
function parseMoney(v) {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  const raw = String(v).replace(/\s/g, '').replace(/\$/g, '');
  const decimalComma = raw.includes(',') && (!raw.includes('.') || raw.lastIndexOf(',') > raw.lastIndexOf('.'));
  const cleaned = decimalComma ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  const n = Number(cleaned.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function todayArgentinaParts() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { y: get('year'), m: get('month'), d: get('day') };
}
function matchesToday(value, t) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return raw === `${t.d}/${t.m}/${t.y}` || raw === `${Number(t.d)}/${Number(t.m)}/${t.y}` || raw.startsWith(`${t.y}-${t.m}-${t.d}`);
}
async function main() {
  const t = await token();
  const encoded = encodeURIComponent(range(SHEET_NAME, 'A:W'));
  const r = await fetch(`${SHEETS_BASE}/${SPREADSHEET_ID}/values/${encoded}`, { headers: { Authorization: `Bearer ${t}` } });
  const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j));
  const rows = j.values || [];
  const header = rows[0] || [];
  const idx = (name, fallback) => { const i = header.indexOf(name); return i >= 0 ? i : fallback; };
  const fechaIdx = idx('FECHA DE PAGO', 16);
  const pesosIdx = idx('PESOS', 13);
  const usdIdx = idx('USD', 14);
  const today = todayArgentinaParts();
  const todayRows = rows.slice(1).filter((row) => matchesToday(row[fechaIdx], today));
  const ars = todayRows.reduce((sum, row) => sum + parseMoney(row[pesosIdx]), 0);
  const usd = todayRows.reduce((sum, row) => sum + parseMoney(row[usdIdx]), 0);
  const money = (n) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n);
  console.log(`🔔 **Cierre de Caja Diario (17:00hs)**\n- **Gastos cargados hoy:** ${todayRows.length}\n- **Total ARS:** $${money(ars)}\n- **Total USD:** $${money(usd)}\n- *Recordatorio: Si quedó algún ticket pendiente del día, súbanlo ahora para cerrar el ledger.*`);
}
main().catch((err) => { console.error(`❌ Error cierre diario CFO: ${err.message}`); process.exit(1); });
