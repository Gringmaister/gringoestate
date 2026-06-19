/* S105 — Contrato de alquiler tradicional · front-only, reusable.
 * BORRADOR OPERATIVO — no valida legalmente, no persiste en CRM, no hardcodea ley/artículos como verdad final.
 * Montaje: ContratoAlq.open(prefill?) abre un modal. prefill opcional (desde una operación).
 */
(function () {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var T = function (m, k) { if (window.toast) return window.toast(m, k || 'ok'); console.log('[Contrato]', m); };
  var LS_KEY = 'gringo_contrato_alq_v1';

  var SEC = {
    operacion: { t: '📋 Datos de la operación', f: [
      ['inmueble', 'Inmueble (dirección completa)', 'text'], ['destino', 'Destino', 'select', ['Vivienda', 'Comercial', 'Oficina']],
      ['fechaFirma', 'Fecha de firma', 'date'], ['fechaInicio', 'Fecha de inicio', 'date'], ['fechaFin', 'Fecha de finalización', 'date'],
      ['plazo', 'Plazo (ej. 36 meses)', 'text'], ['moneda', 'Moneda', 'select', ['ARS', 'USD']], ['canon', 'Canon inicial', 'text'],
      ['periodicidad', 'Periodicidad', 'select', ['Mensual', 'Bimestral', 'Otro']], ['ajuste', '¿Ajuste?', 'select', ['Sí', 'No']],
      ['indice', 'Índice / criterio de ajuste', 'text'], ['deposito', 'Depósito', 'text'], ['honorarios', 'Honorarios / gastos', 'text'],
      ['garantia', 'Garantía (tipo)', 'text'], ['jurisdiccion', 'Jurisdicción', 'text'], ['llaves', 'Entrega de llaves', 'text'],
      ['inventario', 'Inventario', 'select', ['Sí (anexo)', 'No']], ['conservacion', 'Estado de conservación', 'text'],
      ['servicios', 'Servicios', 'text'], ['expensas', 'Expensas', 'text'], ['impuestos', 'Impuestos / tasas', 'text'],
      ['domicilioNotif', 'Domicilio de notificación', 'text']
    ] },
    locador: { t: '👤 Locador / propietario', f: [
      ['loc_nombre', 'Nombre completo', 'text'], ['loc_doc', 'DNI / CUIT', 'text'], ['loc_domicilio', 'Domicilio', 'text'],
      ['loc_civil', 'Estado civil', 'text'], ['loc_caracter', 'Carácter', 'select', ['Titular', 'Apoderado', 'Administrador', 'Usufructuario']],
      ['loc_poder', 'Datos de poder (si aplica)', 'text']
    ] },
    locatario: { t: '👤 Locatario / inquilino', f: [
      ['lt_nombre', 'Nombre completo', 'text'], ['lt_doc', 'DNI / CUIT', 'text'], ['lt_domicilio', 'Domicilio', 'text'],
      ['lt_tel', 'Teléfono / email', 'text'], ['lt_ocupantes', 'Ocupantes autorizados (si vivienda)', 'text']
    ] },
    garante: { t: '🛡️ Garante / fiador', f: [
      ['gar_nombre', 'Nombre', 'text'], ['gar_doc', 'DNI / CUIT', 'text'], ['gar_domicilio', 'Domicilio', 'text'],
      ['gar_tipo', 'Tipo de garantía', 'select', ['Propietaria', 'Recibos de sueldo', 'Seguro de caución', 'Otra']],
      ['gar_inmueble', 'Inmueble en garantía (si aplica)', 'text'], ['gar_conyuge', 'Cónyuge (si corresponde)', 'text']
    ] }
  };
  var CHECK = {
    'Propiedad': ['Título / escritura', 'Informe de dominio', 'Reglamento (si PH)', 'Expensas', 'Servicios', 'ABL / tasas', 'Inventario', 'Fotos de estado', 'Llaves / accesos', 'Autorización de alquiler (si no es titular)'],
    'Locador': ['DNI / CUIT', 'Constancia fiscal', 'Poder / autorización', 'CBU / datos de cobro'],
    'Locatario': ['DNI / CUIT', 'Constancia de ingresos', 'Recibos / monotributo', 'Domicilio', 'Teléfono / email'],
    'Garantía': ['DNI garante', 'Escritura garantía / seguro caución', 'Informe dominio / inhibición', 'Consentimiento cónyuge', 'Comprobantes de ingresos']
  };
  var ESTADOS = ['pendiente', 'recibido', 'observado / revisar', 'validado', 'no aplica'];
  var CRITICOS = [['fechaInicio', 'fecha de inicio'], ['fechaFin', 'fecha de fin'], ['canon', 'canon'], ['plazo', 'plazo'], ['loc_nombre', 'nombre locador'], ['loc_doc', 'DNI/CUIT locador'], ['lt_nombre', 'nombre locatario'], ['lt_doc', 'DNI/CUIT locatario'], ['garantia', 'garantía'], ['inmueble', 'inmueble']];
  var REVISAR = [['indice', 'ajuste / índice'], ['jurisdiccion', 'jurisdicción'], ['deposito', 'depósito']];

  function val(d, k) { var v = d ? d[k] : null; return (v != null && String(v).trim() !== '') ? String(v).trim() : null; }
  function ph(d, k, l) { var v = val(d, k); return v ? esc(v) : '<span style="color:#c0392b;">[FALTA: ' + esc(l || k) + ']</span>'; }

  function faltantes(d) {
    var falta = [], revisar = [];
    CRITICOS.forEach(function (x) { if (!val(d, x[0])) falta.push(x[1]); });
    REVISAR.forEach(function (x) { if (!val(d, x[0])) revisar.push(x[1]); });
    if (val(d, 'ajuste') === 'Sí' && !val(d, 'indice')) revisar.push('definir índice de ajuste');
    return { falta: falta, revisar: revisar };
  }

  // PURE: data → contract HTML string (node-testeable, sin DOM)
  function previewHTML(d) {
    d = d || {};
    var P = function (k, l) { return ph(d, k, l); };
    var banner = '<div class="cn-banner">⚠️ BORRADOR OPERATIVO — sujeto a revisión legal / escribanía / gestor. No es un contrato validado ni listo para firmar.</div>';
    var S = function (n, t, body) { return '<div class="cn-cl"><b>' + n + '. ' + t + '.</b> ' + body + '</div>'; };
    var c = ['<h2 style="text-align:center;margin:0 0 2px;">CONTRATO DE LOCACIÓN</h2><div style="text-align:center;color:#888;font-size:.8rem;margin-bottom:12px;">(alquiler tradicional · borrador)</div>'];
    c.push(S(1, 'LUGAR Y FECHA', 'En ' + P('jurisdiccion', 'jurisdicción') + ', a la fecha de firma ' + P('fechaFirma', 'fecha de firma') + '.'));
    c.push(S(2, 'PARTES', 'Entre <b>' + P('loc_nombre', 'nombre locador') + '</b>, DNI/CUIT ' + P('loc_doc', 'DNI locador') + ', domicilio ' + P('loc_domicilio', 'domicilio locador') + ' (el <b>LOCADOR</b>); y <b>' + P('lt_nombre', 'nombre locatario') + '</b>, DNI/CUIT ' + P('lt_doc', 'DNI locatario') + ', domicilio ' + P('lt_domicilio', 'domicilio locatario') + ' (el <b>LOCATARIO</b>).'));
    c.push(S(3, 'REPRESENTACIÓN / PERSONERÍA', 'El LOCADOR comparece en carácter de ' + P('loc_caracter', 'carácter') + (val(d, 'loc_poder') ? ', según ' + esc(val(d, 'loc_poder')) : '') + '. <i>[Acreditación de personería sujeta a revisión.]</i>'));
    c.push(S(4, 'INMUEBLE', 'El LOCADOR da en locación el inmueble sito en ' + P('inmueble', 'inmueble') + '.'));
    c.push(S(5, 'DESTINO', 'Destino exclusivo: <b>' + P('destino', 'destino') + '</b>; no podrá dársele otro sin autorización escrita del LOCADOR.'));
    c.push(S(6, 'PLAZO', 'Plazo de ' + P('plazo', 'plazo') + ', con inicio el ' + P('fechaInicio', 'fecha de inicio') + ' y finalización el ' + P('fechaFin', 'fecha de fin') + '.'));
    c.push(S(7, 'CANON LOCATIVO', 'Canon inicial: ' + (val(d, 'moneda') || '') + ' ' + P('canon', 'canon') + ', periodicidad ' + P('periodicidad', 'periodicidad') + '.'));
    c.push(S(8, 'FORMA DE PAGO', 'Por período adelantado, en el domicilio o medio que indique el LOCADOR. ' + (val(d, 'honorarios') ? 'Honorarios/gastos: ' + esc(val(d, 'honorarios')) + '.' : '')));
    c.push(S(9, 'ACTUALIZACIÓN / AJUSTE', (val(d, 'ajuste') === 'Sí' ? 'Se actualizará conforme el criterio/índice: <b>' + P('indice', 'índice de ajuste') + '</b>, en los períodos y condiciones que acuerden las partes, conforme la normativa vigente aplicable.' : 'Las partes definirán el criterio de actualización conforme la normativa vigente aplicable. <span style="color:#c0392b;">[Definir ajuste/índice]</span>') + ' <i>[Sujeto a revisión legal de la normativa vigente.]</i>'));
    c.push(S(10, 'DEPÓSITO EN GARANTÍA', 'El LOCATARIO entrega en depósito: ' + P('deposito', 'depósito') + ', reintegrable según lo pactado y la normativa aplicable.'));
    c.push(S(11, 'EXPENSAS / IMPUESTOS / SERVICIOS', 'Expensas: ' + (val(d, 'expensas') ? esc(val(d, 'expensas')) : '[a definir]') + '. Impuestos/tasas: ' + (val(d, 'impuestos') ? esc(val(d, 'impuestos')) : '[a definir]') + '. Servicios: ' + (val(d, 'servicios') ? esc(val(d, 'servicios')) : '[a definir]') + '.'));
    c.push(S(12, 'ESTADO DEL INMUEBLE', 'Se recibe en estado: ' + (val(d, 'conservacion') ? esc(val(d, 'conservacion')) : '[según acta/inventario adjunto]') + '; se restituirá en igual estado salvo deterioro por uso normal.'));
    c.push(S(13, 'INVENTARIO / ANEXOS', 'Inventario: ' + (val(d, 'inventario') || '[a definir]') + '. Forma parte como anexo el detalle de bienes, fotos y acta de entrega.'));
    c.push(S(14, 'PROHIBICIONES / USO', 'No podrá ceder, sublocar ni cambiar el destino sin autorización escrita del LOCADOR, ni afectar la convivencia o el reglamento de copropiedad.'));
    c.push(S(15, 'MANTENIMIENTO / REPARACIONES', 'Reparaciones locativas y mantenimiento de uso a cargo del LOCATARIO; las estructurales a cargo del LOCADOR, conforme la normativa aplicable.'));
    c.push(S(16, 'MORA', 'La mora se producirá de pleno derecho por el solo vencimiento de los plazos, sin interpelación previa.'));
    c.push(S(17, 'RESCISIÓN ANTICIPADA', 'Conforme las condiciones, plazos, preaviso e indemnización previstos por la normativa vigente aplicable. <i>[Sujeto a revisión legal.]</i>'));
    c.push(S(18, 'GARANTÍAS / FIADORES', 'Garantía: <b>' + P('garantia', 'garantía') + '</b>' + (val(d, 'gar_nombre') ? ', otorgada por <b>' + esc(val(d, 'gar_nombre')) + '</b>, DNI/CUIT ' + (val(d, 'gar_doc') || '[falta]') + ', domicilio ' + (val(d, 'gar_domicilio') || '[falta]') + ', tipo ' + (val(d, 'gar_tipo') || '[a definir]') + (val(d, 'gar_inmueble') ? ', inmueble en garantía: ' + esc(val(d, 'gar_inmueble')) : '') + (val(d, 'gar_conyuge') ? ', consentimiento del cónyuge: ' + esc(val(d, 'gar_conyuge')) : '') + '.' : '. <span style="color:#c0392b;">[Faltan datos del garante]</span>')));
    c.push(S(19, 'ENTREGA DE LLAVES', (val(d, 'llaves') ? esc(val(d, 'llaves')) : 'Se documentará en acta al inicio de la locación.')));
    c.push(S(20, 'DOMICILIOS Y NOTIFICACIONES', 'Las partes constituyen domicilios especiales en los indicados' + (val(d, 'domicilioNotif') ? ', y a fines de notificación: ' + esc(val(d, 'domicilioNotif')) : '') + ', donde serán válidas las notificaciones.'));
    c.push(S(21, 'JURISDICCIÓN', 'Para toda controversia, las partes se someten a los tribunales de ' + P('jurisdiccion', 'jurisdicción') + ', renunciando a otro fuero.'));
    c.push(S(22, 'FIRMAS', 'Se firman ejemplares de un mismo tenor y a un solo efecto.<br><br><table style="width:100%;"><tr><td style="text-align:center;border-top:1px solid #999;padding-top:6px;width:45%;">LOCADOR<br>' + (val(d, 'loc_nombre') || '') + '</td><td></td><td style="text-align:center;border-top:1px solid #999;padding-top:6px;width:45%;">LOCATARIO<br>' + (val(d, 'lt_nombre') || '') + '</td></tr></table>'));
    c.push(S(23, 'ANEXOS', 'Inventario · Fotos del estado · Acta de entrega · Comprobantes · Documentación de garantía.'));
    return banner + c.join('') + banner;
  }

  // ── DOM ──
  function ensureStyle() {
    if (document.getElementById('cn-style')) return;
    var st = document.createElement('style'); st.id = 'cn-style';
    st.textContent =
      '#cn-modal{position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:18px;}' +
      '#cn-modal .cn-box{width:100%;max-width:1320px;background:var(--bg,#0c0c0e);border:1px solid var(--border,#333);border-radius:14px;padding:16px 18px;}' +
      '#cn-modal .cn-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;}' +
      '#cn-modal h3{margin:0;font-size:1.05rem;color:var(--gold,#d4af37);}' +
      '#cn-modal .cn-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:14px;align-items:start;}' +
      '@media(max-width:1000px){#cn-modal .cn-cols{grid-template-columns:1fr;}}' +
      '#cn-modal .cn-warn{background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.4);border-radius:9px;padding:8px 11px;font-size:.72rem;color:var(--warn,#f59e0b);margin-bottom:10px;}' +
      '#cn-modal details{border:1px solid var(--border,#333);border-radius:10px;padding:8px 11px;margin-bottom:8px;background:rgba(255,255,255,.012);}' +
      '#cn-modal summary{font-size:.8rem;font-weight:700;color:var(--text,#eee);cursor:pointer;}' +
      '#cn-modal .cn-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px;}' +
      '@media(max-width:560px){#cn-modal .cn-grid{grid-template-columns:1fr;}}' +
      '#cn-modal .cn-f label{font-size:.58rem;color:var(--muted,#999);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:2px;}' +
      '#cn-modal .cn-f input,#cn-modal .cn-f select{width:100%;padding:5px 8px;font-size:.76rem;background:var(--panel,#161618);color:var(--text,#eee);border:1px solid var(--border,#333);border-radius:7px;}' +
      '#cn-modal .cn-chk{display:flex;align-items:center;gap:7px;font-size:.72rem;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04);}' +
      '#cn-modal .cn-chk span{flex:1;}' +
      '#cn-modal .cn-chk select{padding:2px 6px;font-size:.68rem;background:var(--panel,#161618);color:var(--text,#eee);border:1px solid var(--border,#333);border-radius:6px;}' +
      '#cn-modal .cn-prev{background:#fff;color:#1a1a1a;border-radius:10px;padding:20px 24px;font-size:.78rem;line-height:1.5;font-family:Georgia,serif;max-height:72vh;overflow-y:auto;}' +
      '#cn-modal .cn-prev .cn-cl{margin-bottom:10px;text-align:justify;}' +
      '#cn-modal .cn-prev .cn-banner{background:#fdecea;color:#7b241c;border:1px solid #e6b0aa;border-radius:8px;padding:8px 12px;font-weight:700;font-size:.78rem;margin-bottom:12px;text-align:center;}' +
      '#cn-modal .cn-falt{font-size:.72rem;margin-bottom:10px;}' +
      '#cn-modal .cn-pill{display:inline-block;font-size:.66rem;border-radius:7px;padding:2px 8px;margin:2px 3px 2px 0;}' +
      '#cn-modal .cn-btns{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0;}';
    document.head.appendChild(st);
  }
  function fieldHTML(f) {
    var id = 'c-' + f[0], lbl = f[1], type = f[2], opts = f[3];
    var inner = type === 'select'
      ? '<select id="' + id + '"><option value=""></option>' + opts.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>'
      : '<input id="' + id + '" type="' + (type === 'date' ? 'date' : 'text') + '">';
    return '<div class="cn-f"><label>' + esc(lbl) + '</label>' + inner + '</div>';
  }
  function checklistHTML() {
    var h = '<details><summary>📑 Checklist documental</summary>' +
      '<div class="cn-warn">Estados <b>locales</b> — sin documento vinculado, "recibido/validado" se tratan como <b>observado / revisar</b> hasta adjuntar el doc real. No es validación documental final.</div>';
    Object.keys(CHECK).forEach(function (grp) {
      h += '<div style="font-size:.62rem;color:var(--gold,#d4af37);text-transform:uppercase;margin:8px 0 3px;">' + grp + '</div>';
      CHECK[grp].forEach(function (item, i) {
        var id = 'k-' + grp.toLowerCase().slice(0, 3) + '-' + i;
        h += '<div class="cn-chk"><span>' + esc(item) + '</span><select id="' + id + '" data-item="' + esc(grp + ': ' + item) + '">' + ESTADOS.map(function (e) { return '<option' + (e === 'pendiente' ? ' selected' : '') + '>' + e + '</option>'; }).join('') + '</select></div>';
      });
    });
    return h + '</details>';
  }

  var ContratoAlq = {};
  ContratoAlq.previewHTML = previewHTML;
  ContratoAlq.faltantes = faltantes;

  ContratoAlq.prefillFromOp = function (op) {
    op = op || {};
    var d = {};
    if (op.tipo) d.destino = 'Vivienda';
    if (op.proximoPaso) {/* noop */ }
    d.canon = op.valorAlquiler != null ? String(op.valorAlquiler) : '';
    d.moneda = 'USD';
    d.inmueble = op.propiedad || op.inmueble || '';
    d.loc_nombre = op.vendedor || op.propietario || '';
    d.lt_nombre = op.comprador || op.inquilino || '';
    d.jurisdiccion = 'C.A.B.A.';
    return d;
  };

  ContratoAlq.collect = function () {
    var d = {};
    Object.keys(SEC).forEach(function (s) { SEC[s].f.forEach(function (f) { var e = document.getElementById('c-' + f[0]); if (e) d[f[0]] = e.value; }); });
    return d;
  };
  ContratoAlq.setData = function (d) {
    if (!d) return;
    Object.keys(d).forEach(function (k) { var e = document.getElementById('c-' + k); if (e && d[k] != null) e.value = d[k]; });
  };
  ContratoAlq.generar = function () {
    var d = ContratoAlq.collect();
    var pv = document.getElementById('cn-prev'); if (pv) pv.innerHTML = previewHTML(d);
    var ft = faltantes(d), fe = document.getElementById('cn-falt');
    if (fe) fe.innerHTML = (ft.falta.length ? ft.falta.map(function (x) { return '<span class="cn-pill" style="background:rgba(192,57,43,.15);color:#e74c3c;border:1px solid rgba(192,57,43,.4);">Falta: ' + esc(x) + '</span>'; }).join('') : '<span class="cn-pill" style="background:rgba(74,222,128,.15);color:#4ade80;">✓ Datos críticos completos</span>') +
      ft.revisar.map(function (x) { return '<span class="cn-pill" style="background:rgba(245,158,11,.15);color:#f59e0b;border:1px solid rgba(245,158,11,.4);">Revisar: ' + esc(x) + '</span>'; }).join('') +
      '<span class="cn-pill" style="background:rgba(245,158,11,.12);color:#f59e0b;">⚠ Revisar legalmente antes de firmar</span>';
    T('Vista previa generada.');
  };
  ContratoAlq.copiar = function () {
    var pv = document.getElementById('cn-prev'); if (!pv) return;
    var txt = pv.innerText || pv.textContent || '';
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { T('Contrato copiado.'); }, function () { T('No pude copiar', 'err'); });
    else T('Clipboard no disponible', 'err');
  };
  ContratoAlq.copiarChecklist = function () {
    var lines = ['CHECKLIST DOCUMENTAL — CONTRATO ALQUILER (borrador, estados locales):'];
    Object.keys(CHECK).forEach(function (grp) { lines.push('\n' + grp + ':'); CHECK[grp].forEach(function (item, i) { var e = document.getElementById('k-' + grp.toLowerCase().slice(0, 3) + '-' + i); var v = e ? e.value : 'pendiente'; if (/recibido|validado/.test(v)) v += ' (⚠ sin doc vinculado → observar)'; lines.push('  [' + v + '] ' + item); }); });
    var txt = lines.join('\n');
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { T('Checklist copiado.'); }, function () { T('No pude copiar', 'err'); });
    else T('Clipboard no disponible', 'err');
  };
  ContratoAlq.limpiar = function () {
    Object.keys(SEC).forEach(function (s) { SEC[s].f.forEach(function (f) { var e = document.getElementById('c-' + f[0]); if (e) e.value = ''; }); });
    ContratoAlq.generar(); T('Formulario limpiado.');
  };
  ContratoAlq.guardarLocal = function () {
    try { localStorage.setItem(LS_KEY, JSON.stringify(ContratoAlq.collect())); T('Guardado local en este navegador. No queda persistido en CRM.'); }
    catch (e) { T('No pude guardar local', 'err'); }
  };
  ContratoAlq.cargarLocal = function () {
    try { var s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  };
  ContratoAlq.close = function () { var m = document.getElementById('cn-modal'); if (m) m.remove(); };

  ContratoAlq.open = function (prefill) {
    ensureStyle();
    ContratoAlq.close();
    var ov = document.createElement('div'); ov.id = 'cn-modal';
    var secs = Object.keys(SEC).map(function (s, i) {
      return '<details' + (i === 0 ? ' open' : '') + '><summary>' + SEC[s].t + '</summary><div class="cn-grid">' + SEC[s].f.map(fieldHTML).join('') + '</div></details>';
    }).join('');
    ov.innerHTML = '<div class="cn-box">' +
      '<div class="cn-head"><h3>📄 Contrato de alquiler tradicional</h3><span class="badge badge-muted" style="font-size:.6rem;">BORRADOR · front-only</span><span style="margin-left:auto;"></span><button class="btn btn-ghost btn-sm" onclick="ContratoAlq.close()">✕ Cerrar</button></div>' +
      '<div class="cn-warn">⚠️ <b>Borrador operativo.</b> No valida legalmente ni queda "listo para firmar". Completá los datos faltantes y <b>revisá con abogado / escribanía / gestor</b> antes de usarlo. Verificá la normativa aplicable.</div>' +
      '<div class="cn-btns">' +
        '<button class="btn btn-gold btn-sm" onclick="ContratoAlq.generar()">🔄 Generar vista previa</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="ContratoAlq.copiar()">📋 Copiar contrato</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="ContratoAlq.copiarChecklist()">📑 Copiar checklist</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="ContratoAlq.guardarLocal()">💾 Guardar borrador local</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="ContratoAlq.limpiar()">🧹 Limpiar formulario</button>' +
      '</div>' +
      '<div id="cn-falt" class="cn-falt"></div>' +
      '<div class="cn-cols"><div>' + secs + checklistHTML() + '</div>' +
      '<div><div style="font-size:.6rem;color:var(--muted,#999);text-transform:uppercase;margin-bottom:5px;">Vista previa del contrato</div><div id="cn-prev" class="cn-prev"></div></div></div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) ContratoAlq.close(); });
    var data = prefill || ContratoAlq.cargarLocal() || {};
    ContratoAlq.setData(data);
    ContratoAlq.generar();
  };

  if (typeof window !== 'undefined') window.ContratoAlq = ContratoAlq;
  if (typeof module !== 'undefined' && module.exports) module.exports = { previewHTML: previewHTML, faltantes: faltantes };
})();
