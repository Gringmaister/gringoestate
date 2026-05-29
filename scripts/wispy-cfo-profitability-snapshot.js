#!/usr/bin/env node
'use strict';
/**
 * wispy-cfo-profitability-snapshot.js
 *
 * Genera /tmp/cfo-profitability.json con el último cierre por empresa (CIERRES)
 * + detalle por unidad (CIERRE_UNIDAD), para que el bridge lo sirva al Gringo
 * Office Pixel (endpoint /api/business/profitability) SIN tener que tocar el
 * Sheet ni los secrets en vivo. Patrón idéntico a /tmp/ai-telemetry.json.
 *
 * Corre en el HOST (cron), reusa el auth readonly del CFO (_wispy-cfo-period-helpers.js).
 * Uso: node wispy-cfo-profitability-snapshot.js [--out /tmp/cfo-profitability.json] [--print]
 *
 * Confidencialidad: incluye Ambbi + Metropolitan (office solo de Franco). NO incluye Canarian.
 */

const fs = require('fs');
const h = require('./_wispy-cfo-period-helpers.js');

const OUT = (() => {
  const i = process.argv.indexOf('--out');
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : '/tmp/cfo-profitability.json';
})();
const PRINT = process.argv.includes('--print');

const CIERRES_SHEET = process.env.WISPY_FINANCE_CIERRES_SHEET || 'CIERRES';
const UNIDAD_SHEET = process.env.WISPY_FINANCE_CIERRE_UNIDAD_SHEET || 'CIERRE_UNIDAD';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

function num(v) {
  if (typeof v === 'number') return v;
  if (v === undefined || v === null || v === '') return 0;
  const n = h.parseMoney(v);
  return Number.isFinite(n) ? n : 0;
}

async function readSheet(token, sheetName) {
  const enc = encodeURIComponent(`'${String(sheetName).replace(/'/g, "''")}'!A:AC`);
  const r = await fetch(`${SHEETS_BASE}/${h.SPREADSHEET_ID}/values/${enc}?valueRenderOption=UNFORMATTED_VALUE`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  return j.values || [];
}

// Convierte filas+header en objetos {HEADER: valor}
function rowsToObjects(values) {
  if (!values.length) return [];
  const header = values[0].map((x) => String(x).trim());
  return values.slice(1).filter((r) => r.length).map((row) => {
    const o = {};
    header.forEach((hd, i) => { o[hd] = row[i]; });
    return o;
  });
}

// Elige la fila más reciente por EMPRESA (AÑO*100 + MES_NUM)
function latestByEmpresa(objs) {
  const best = {};
  for (const o of objs) {
    const emp = String(o.EMPRESA || '').trim();
    if (!emp) continue;
    const key = num(o['AÑO']) * 100 + num(o.MES_NUM);
    if (!best[emp] || key > best[emp]._k) best[emp] = { ...o, _k: key };
  }
  return best;
}

(async () => {
  try {
    const token = await h.token();
    const [cierresVals, unidadVals] = await Promise.all([
      readSheet(token, CIERRES_SHEET),
      readSheet(token, UNIDAD_SHEET).catch(() => [])
    ]);

    const cierres = rowsToObjects(cierresVals);
    const latest = latestByEmpresa(cierres);

    const companies = {};
    for (const [emp, o] of Object.entries(latest)) {
      companies[emp] = {
        clave: o.CLAVE || null,
        anio: num(o['AÑO']),
        mesNum: num(o.MES_NUM),
        mes: o.MES || null,
        ingresosUSD: num(o.INGRESOS_USD),
        gananciaBrutaUSD: num(o.GANANCIA_BRUTA_USD),
        gastosOperativosUSD: num(o.GASTOS_OPERATIVOS_USD),
        ebitdaUSD: num(o.EBITDA_USD),
        margenPct: num(o.MARGEN_PCT),
        nReservas: num(o.N_RESERVAS),
        nochesVendidas: num(o.NOCHES_VENDIDAS),
        nochesDisp: num(o.NOCHES_DISP),
        ocupacionPct: num(o.OCUPACION_PCT),
        adrUSD: num(o.ADR_USD),
        revparUSD: num(o.REVPAR_USD),
        nUnidActivas: num(o.N_UNID_ACTIVAS),
        estado: o.ESTADO || null,
        tsCierre: o.TS_CIERRE || null
      };
    }

    // CIERRE_UNIDAD: del período (clave) más reciente de cada empresa
    const unidades = rowsToObjects(unidadVals);
    const byUnit = {};
    for (const emp of Object.keys(companies)) {
      const { anio, mesNum } = companies[emp];
      // CIERRE_UNIDAD.CLAVE trae sufijo de unidad (ej "2026-05-Metropolitan-MIGUELETES"),
      // por eso se matchea por EMPRESA + AÑO + MES_NUM, no por CLAVE exacta.
      const rows = unidades.filter((u) => String(u.EMPRESA || '').trim() === emp && num(u['AÑO']) === anio && num(u.MES_NUM) === mesNum);
      byUnit[emp] = rows.map((u) => ({
        unidad: u.UNIDAD || null,        // = unit_id (join con apartments_master / ocupación)
        nombre: u.NOMBRE || null,
        propietario: u.PROPIETARIO || null,
        ingresosUSD: num(u.INGRESOS_USD),
        resultadoUSD: num(u.RESULTADO_USD),
        nReservas: num(u.N_RESERVAS),
        noches: num(u.NOCHES),
        ocupacionPct: num(u.OCUPACION_PCT),
        adrUSD: num(u.ADR_USD)
      }));
    }

    // GASTOS del mes en curso por categoría (GASTOS BURN) — para el Home (sección Negocio)
    let expenses = null;
    try {
      const burnRows = await h.readAllRows(token);          // 'GASTOS BURN' A:X
      const ix = h.buildIndex(burnRows[0] || []);
      const today = new Date();
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      const to = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
      const monthRows = h.rowsInRange(burnRows, ix, from, to).filter((r) => {
        const e = String(r[ix.estado] || '').toUpperCase().trim();
        return e !== 'PENDIENTE' && e !== 'CANCELADO';
      });
      const byCat = {};
      let totalUSD = 0;
      for (const r of monthRows) {
        const cat = String(r[ix.categoria] || '').trim() || 'Otros';
        const usd = h.parseMoney(r[ix.usd]);
        if (!usd) continue;
        byCat[cat] = (byCat[cat] || 0) + usd;
        totalUSD += usd;
      }
      const byCategory = Object.entries(byCat)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, usd]) => ({ cat, usd: Math.round(usd) }));
      const pad2 = (n) => String(n).padStart(2, '0');
      expenses = {
        mes: `${from.getFullYear()}-${pad2(from.getMonth() + 1)}`,
        totalUSD: Math.round(totalUSD),
        count: monthRows.length,
        byCategory
      };
    } catch (e) {
      expenses = { error: e.message };
    }

    const out = {
      ok: true,
      updatedAt: new Date().toISOString(),
      source: `${CIERRES_SHEET}+${UNIDAD_SHEET}+GASTOS BURN`,
      companies,
      byUnit,
      expenses
    };

    fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
    const empresas = Object.keys(companies);
    console.log(`✅ snapshot escrito en ${OUT} | empresas: ${empresas.join(', ') || '(ninguna)'}`);
    for (const e of empresas) {
      const c = companies[e];
      console.log(`   ${e}: ${c.mes} ${c.anio} | EBITDA ${c.ebitdaUSD} USD | margen ${c.margenPct} | ocup ${c.ocupacionPct} | ${byUnit[e].length} unidades`);
    }
    if (expenses && !expenses.error) console.log(`   Gastos mes: $${expenses.totalUSD} USD en ${expenses.count} mov · top: ${expenses.byCategory.slice(0,3).map(c=>c.cat+' $'+c.usd).join(' · ')}`);
    else if (expenses && expenses.error) console.log(`   ⚠️ Gastos: ${expenses.error}`);
    if (PRINT) console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error('❌ snapshot falló:', e.message);
    process.exit(1);
  }
})();
