/* S106B — Modelos Documentales (biblioteca de borradores operativos) · front-only.
 * Patrón espejo de contrato.js: funciones puras (previewText/faltantes) testeables por node,
 * window.ModelosDoc para el panel, localStorage opcional. SIN fetch/bridge/Notion/PDF/WhatsApp.
 *
 * REGLA LEGAL (no negociable): todo lo que sale es BORRADOR OPERATIVO. No valida legalmente,
 * no dice "listo para firmar", no hardcodea ley/artículos como verdad cerrada. Los modelos de
 * venta pesados (boleto/cesión/escritura) salen ESQUELÉTICOS: estructura para preparar info
 * para abogado/escribanía/gestor, no contrato final.
 */
(function () {
  'use strict';

  var LS_KEY = 'gringo_modelos_doc_v1';

  var BANNER_TOP =
'================================================================================\n' +
'  BORRADOR OPERATIVO — sujeto a revisión legal / escribanía / gestor.\n' +
'  No es un documento validado ni listo para firmar. Completá los [COMPLETAR ...],\n' +
'  verificá la normativa vigente aplicable y revisalo con un profesional antes de usar.\n' +
'================================================================================';
  var BANNER_BOTTOM =
'================================================================================\n' +
'  BORRADOR OPERATIVO — revisar con abogado / escribanía / gestor antes de firmar.\n' +
'  Verificar la normativa vigente aplicable. No reemplaza asesoramiento profesional.\n' +
'================================================================================';

  // Hint del operador — NEUTRAL, editable, sin marca hardcodeada.
  var OPERADOR_HINT = 'Gringo · AMBBI · Metropolitan · Franco Garbini · otro';

  // helpers de placeholder
  function F(d, k, ph) { return (d && d[k] != null && String(d[k]).trim() !== '') ? String(d[k]).trim() : '[COMPLETAR ' + ph + ']'; }
  function money(d, kMonto, phMonto) { return F(d, 'moneda', 'MONEDA') + ' ' + F(d, kMonto, phMonto); }
  function opLine(d) { return 'Operador / intermediario interviniente: ' + F(d, 'operador', 'OPERADOR (' + OPERADOR_HINT + ')') + '.'; }
  function juris(d) { return F(d, 'jurisdiccion', 'JURISDICCIÓN'); }

  // Campos reutilizables
  var C_OP = { k: 'operador', label: 'Operador / inmobiliaria', type: 'text', hint: OPERADOR_HINT };
  var C_MON = { k: 'moneda', label: 'Moneda', type: 'select', opts: ['ARS', 'USD', 'otra'] };
  var C_JUR = { k: 'jurisdiccion', label: 'Jurisdicción', type: 'text', def: 'C.A.B.A.' };
  var C_FECHA = { k: 'fecha', label: 'Fecha', type: 'text', ph: 'DD/MM/AAAA' };

  // ── REGISTRO DE 16 MODELOS ──────────────────────────────────────────────────
  var MODELOS = [

    // ===== ALQUILER TRADICIONAL =====
    { id: 'contrato-alquiler', grupo: 'Alquiler', titulo: 'Contrato de alquiler tradicional',
      uso: 'Contrato de locación completo (23 cláusulas). Usa el generador dedicado.',
      delegate: 'ContratoAlq', campos: [],
      cuerpo: function () { return 'Este modelo usa el GENERADOR DEDICADO de contrato de alquiler (23 cláusulas,\nintake + checklist). Abrí "Generador de contrato" para el documento completo.'; },
      checklist: ['Ver checklist completo en el generador dedicado'], anexos: [] },

    { id: 'reserva-alquiler', grupo: 'Alquiler', titulo: 'Reserva / seña de alquiler',
      uso: 'Reserva ad referéndum del propietario antes del contrato.',
      campos: [ C_OP, { k: 'inmueble', label: 'Inmueble (dirección)', req: true },
        { k: 'locador', label: 'Locador / propietario' }, { k: 'locatario', label: 'Reservante / locatario', req: true },
        C_MON, { k: 'monto', label: 'Monto de la reserva', req: true },
        { k: 'plazoAcept', label: 'Plazo de aceptación', ph: 'p. ej. 5 días' },
        { k: 'imputacion', label: 'Se imputa a', ph: 'depósito / primer mes' }, C_FECHA ],
      cuerpo: function (d) { return (
'RESERVA / SEÑA DE ALQUILER (ad referéndum del propietario)\n\n' +
'Fecha: ' + F(d, 'fecha', 'FECHA') + '.  ' + opLine(d) + '\n\n' +
'1) El/la reservante ' + F(d, 'locatario', 'RESERVANTE') + ' entrega en concepto de reserva la suma de ' +
  money(d, 'monto', 'MONTO') + ' por el inmueble sito en ' + F(d, 'inmueble', 'INMUEBLE') + ',\n' +
'   ofrecido en locación por ' + F(d, 'locador', 'LOCADOR / PROPIETARIO') + '.\n' +
'2) La presente reserva queda sujeta a la ACEPTACIÓN del propietario dentro de ' + F(d, 'plazoAcept', 'PLAZO') + '.\n' +
'3) Aceptada, el monto se imputa a ' + F(d, 'imputacion', 'IMPUTACIÓN (depósito/1er mes)') + ' y las partes\n' +
'   suscribirán el contrato de locación con la documentación y garantías correspondientes.\n' +
'4) No aceptada en el plazo, la reserva se restituye al reservante sin penalidad.\n' +
'5) Condiciones particulares: ' + F(d, 'condiciones', 'CONDICIONES (si las hay)') + '.\n\n' +
'Firmas:  Reservante ____________________    Recibido por (operador) ____________________'); },
      checklist: ['DNI/CUIT del reservante', 'Datos del propietario', 'Comprobante de la reserva', 'Condiciones de aceptación por escrito'],
      anexos: ['Comprobante de pago', 'Datos de contacto de las partes'] },

    { id: 'acta-llaves', grupo: 'Alquiler', titulo: 'Acta de entrega de llaves',
      uso: 'Constancia de entrega/recepción de llaves y accesos.',
      campos: [ { k: 'inmueble', label: 'Inmueble', req: true }, { k: 'entrega', label: 'Entrega (nombre)', req: true },
        { k: 'recibe', label: 'Recibe (nombre)', req: true }, { k: 'juegos', label: 'Juegos de llaves', ph: 'cantidad' },
        { k: 'accesos', label: 'Otros accesos', ph: 'tags, control, portón' },
        { k: 'medidores', label: 'Lecturas de medidores', ph: 'luz/gas/agua' }, C_FECHA ],
      cuerpo: function (d) { return (
'ACTA DE ENTREGA DE LLAVES\n\n' +
'En ' + F(d, 'fecha', 'FECHA') + ', respecto del inmueble ' + F(d, 'inmueble', 'INMUEBLE') + '.\n\n' +
F(d, 'entrega', 'QUIEN ENTREGA') + ' hace entrega a ' + F(d, 'recibe', 'QUIEN RECIBE') + ' de:\n' +
'  - Juegos de llaves: ' + F(d, 'juegos', 'CANTIDAD') + '\n' +
'  - Otros accesos (tags / control / portón): ' + F(d, 'accesos', 'DETALLE') + '\n' +
'  - Lecturas de medidores al momento: ' + F(d, 'medidores', 'LUZ/GAS/AGUA') + '\n\n' +
'Quien recibe declara recibir de conformidad los accesos detallados.\n\n' +
'Entrega ____________________      Recibe ____________________'); },
      checklist: ['Cantidad de juegos verificada', 'Accesos electrónicos probados', 'Lecturas de medidores registradas', 'Fotos de medidores'],
      anexos: ['Fotos de llaves/medidores'] },

    { id: 'inventario', grupo: 'Alquiler', titulo: 'Inventario y estado del inmueble',
      uso: 'Detalle de bienes y estado de conservación al inicio/fin.',
      campos: [ { k: 'inmueble', label: 'Inmueble', req: true }, { k: 'partes', label: 'Partes presentes' },
        { k: 'ambientes', label: 'Ambientes / ítems', type: 'textarea', ph: 'detalle por ambiente' },
        { k: 'estado', label: 'Estado general', ph: 'bueno / a revisar' },
        { k: 'observaciones', label: 'Observaciones', type: 'textarea' }, C_FECHA ],
      cuerpo: function (d) { return (
'INVENTARIO Y ESTADO DEL INMUEBLE\n\n' +
'Inmueble: ' + F(d, 'inmueble', 'INMUEBLE') + '.   Fecha: ' + F(d, 'fecha', 'FECHA') + '.\n' +
'Partes presentes: ' + F(d, 'partes', 'PARTES') + '.\n\n' +
'Detalle por ambiente / ítems:\n' + F(d, 'ambientes', 'DETALLE POR AMBIENTE (cocina, baño, living, dormitorios, artefactos…)') + '\n\n' +
'Estado general de conservación: ' + F(d, 'estado', 'ESTADO') + '.\n' +
'Observaciones: ' + F(d, 'observaciones', 'OBSERVACIONES') + '.\n\n' +
'El locatario recibe en el estado descripto y se obliga a restituir en igual estado,\n' +
'salvo el deterioro por uso normal. Forma parte como anexo el registro fotográfico.\n\n' +
'Conformidad: Locador ____________________    Locatario ____________________'); },
      checklist: ['Recorrida ambiente por ambiente', 'Artefactos y llaves de paso probados', 'Registro fotográfico', 'Firma de ambas partes'],
      anexos: ['Anexo fotográfico', 'Lista de artefactos/muebles'] },

    { id: 'recibo', grupo: 'Alquiler', titulo: 'Recibo de pago / depósito / reserva',
      uso: 'Recibo simple (alquiler o venta). Honorarios opcional.',
      campos: [ C_OP, { k: 'recibiDe', label: 'Recibí de', req: true }, { k: 'concepto', label: 'Concepto', req: true, ph: 'depósito / reserva / mes' },
        C_MON, { k: 'monto', label: 'Monto', req: true }, { k: 'inmueble', label: 'Inmueble (si aplica)' },
        { k: 'imputacion', label: 'Imputación' }, { k: 'medioPago', label: 'Medio de pago', ph: 'efectivo / transferencia' },
        { k: 'honorarios', label: 'Honorarios (opcional)', ph: 'solo si corresponde' }, C_FECHA ],
      cuerpo: function (d) { return (
'RECIBO\n\n' +
'Fecha: ' + F(d, 'fecha', 'FECHA') + '.   ' + opLine(d) + '\n\n' +
'Recibí de ' + F(d, 'recibiDe', 'QUIÉN PAGA') + ' la suma de ' + money(d, 'monto', 'MONTO') + '\n' +
'en concepto de ' + F(d, 'concepto', 'CONCEPTO') + '\n' +
'respecto del inmueble ' + F(d, 'inmueble', 'INMUEBLE (si aplica)') + '.\n' +
'Imputación: ' + F(d, 'imputacion', 'IMPUTACIÓN') + '.   Medio de pago: ' + F(d, 'medioPago', 'MEDIO') + '.\n' +
(d && d.honorarios ? 'Honorarios / comisión: ' + d.honorarios + '.\n' : '') +
'\nRecibí conforme ____________________'); },
      checklist: ['Identidad de quien paga', 'Concepto e imputación claros', 'Comprobante del medio de pago'],
      anexos: ['Comprobante de transferencia (si aplica)'] },

    { id: 'autoriz-alquiler', grupo: 'Alquiler', titulo: 'Autorización para alquilar (no titular)',
      uso: 'Autorización del titular para gestionar/ofrecer en alquiler.',
      campos: [ { k: 'titular', label: 'Titular / propietario', req: true }, C_OP,
        { k: 'inmueble', label: 'Inmueble', req: true }, { k: 'alcance', label: 'Alcance', ph: 'ofrecer, mostrar, reservar' },
        { k: 'vigencia', label: 'Vigencia' }, C_FECHA ],
      cuerpo: function (d) { return (
'AUTORIZACIÓN PARA GESTIONAR EL ALQUILER\n\n' +
'En ' + F(d, 'fecha', 'FECHA') + '. ' + F(d, 'titular', 'TITULAR') + ', en su carácter de titular/propietario\n' +
'del inmueble ' + F(d, 'inmueble', 'INMUEBLE') + ', autoriza a ' + F(d, 'operador', 'OPERADOR (' + OPERADOR_HINT + ')') + '\n' +
'a gestionar su locación con el siguiente alcance: ' + F(d, 'alcance', 'ALCANCE') + '.\n' +
'Vigencia de la autorización: ' + F(d, 'vigencia', 'VIGENCIA') + '.\n\n' +
'La presente queda sujeta a la acreditación de la titularidad y de las facultades\n' +
'para alquilar. No implica delegación de facultades no expresadas.\n\n' +
'Titular ____________________'); },
      checklist: ['Acreditación de titularidad', 'DNI/CUIT del titular', 'Alcance y vigencia por escrito'],
      anexos: ['Copia de título / constancia de dominio'] },

    // ===== VENTA =====
    { id: 'reserva-compra', grupo: 'Venta', titulo: 'Reserva de compra',
      uso: 'Oferta de compra + reserva ad referéndum del vendedor.',
      campos: [ C_OP, { k: 'comprador', label: 'Comprador / oferente', req: true }, { k: 'vendedor', label: 'Oferta dirigida a (vendedor)' },
        { k: 'inmueble', label: 'Inmueble', req: true }, C_MON, { k: 'precio', label: 'Precio ofertado', req: true },
        { k: 'monto', label: 'Monto de la reserva', req: true }, { k: 'plazoAcept', label: 'Plazo de aceptación' },
        { k: 'honorarios', label: 'Honorarios / comisión' }, { k: 'condiciones', label: 'Condiciones', type: 'textarea' }, C_FECHA ],
      cuerpo: function (d) { return (
'RESERVA DE COMPRA — OFERTA AD REFERÉNDUM DEL VENDEDOR\n\n' +
'Fecha: ' + F(d, 'fecha', 'FECHA') + '.   ' + opLine(d) + '\n\n' +
'1) ' + F(d, 'comprador', 'COMPRADOR/OFERENTE') + ' ofrece adquirir el inmueble ' + F(d, 'inmueble', 'INMUEBLE') + '\n' +
'   por el precio de ' + money(d, 'precio', 'PRECIO') + ', dirigida a ' + F(d, 'vendedor', 'VENDEDOR') + '.\n' +
'2) Entrega en concepto de reserva ' + money(d, 'monto', 'MONTO RESERVA') + ', ad referéndum de la aceptación del vendedor\n' +
'   dentro de ' + F(d, 'plazoAcept', 'PLAZO') + '.\n' +
'3) Aceptada, se imputa a la seña/precio y las partes instrumentarán boleto/cesión/escritura\n' +
'   con intervención profesional. No aceptada, se restituye sin penalidad.\n' +
'4) Honorarios / comisión: ' + F(d, 'honorarios', 'HONORARIOS') + '.\n' +
'5) Condiciones: ' + F(d, 'condiciones', 'CONDICIONES') + '.\n\n' +
'Comprador ____________________    Recibido por (operador) ____________________'); },
      checklist: ['DNI/CUIT del comprador', 'Datos del vendedor', 'Comprobante de la reserva', 'Condiciones de aceptación', 'Honorarios pactados'],
      anexos: ['Comprobante de pago', 'Detalle del inmueble'] },

    { id: 'autoriz-venta', grupo: 'Venta', titulo: 'Autorización de venta / comercialización',
      uso: 'Autorización del titular para comercializar en venta.',
      campos: [ { k: 'titular', label: 'Titular / propietario', req: true }, C_OP, { k: 'inmueble', label: 'Inmueble', req: true },
        C_MON, { k: 'precio', label: 'Precio pretendido' }, { k: 'exclusividad', label: 'Exclusividad', type: 'select', opts: ['no', 'sí'] },
        { k: 'vigencia', label: 'Vigencia' }, { k: 'honorarios', label: 'Honorarios / comisión' }, C_FECHA ],
      cuerpo: function (d) { return (
'AUTORIZACIÓN DE VENTA / COMERCIALIZACIÓN\n\n' +
'En ' + F(d, 'fecha', 'FECHA') + '. ' + F(d, 'titular', 'TITULAR') + ', titular del inmueble ' + F(d, 'inmueble', 'INMUEBLE') + ',\n' +
'autoriza a ' + F(d, 'operador', 'OPERADOR (' + OPERADOR_HINT + ')') + ' a comercializarlo en venta.\n' +
'Precio pretendido: ' + money(d, 'precio', 'PRECIO') + '.\n' +
'Exclusividad: ' + F(d, 'exclusividad', 'SÍ/NO') + '.   Vigencia: ' + F(d, 'vigencia', 'VIGENCIA') + '.\n' +
'Honorarios / comisión pactada: ' + F(d, 'honorarios', 'HONORARIOS') + '.\n\n' +
'Sujeta a la acreditación de titularidad y a la normativa aplicable a la intermediación.\n\n' +
'Titular ____________________'); },
      checklist: ['Acreditación de titularidad', 'Precio y honorarios por escrito', 'Exclusividad y vigencia definidas', 'Datos del inmueble'],
      anexos: ['Copia de título / dominio', 'Fotos del inmueble'] },

    { id: 'recibo-reserva-venta', grupo: 'Venta', titulo: 'Recibo de reserva (venta)',
      uso: 'Recibo específico de la reserva de compra. Honorarios opcional.',
      campos: [ C_OP, { k: 'recibiDe', label: 'Recibí de (comprador)', req: true }, { k: 'inmueble', label: 'Inmueble', req: true },
        C_MON, { k: 'monto', label: 'Monto', req: true }, { k: 'imputacion', label: 'Se imputa a', ph: 'seña / precio' },
        { k: 'honorarios', label: 'Honorarios / comisión' }, C_FECHA ],
      cuerpo: function (d) { return (
'RECIBO DE RESERVA DE COMPRA\n\n' +
'Fecha: ' + F(d, 'fecha', 'FECHA') + '.   ' + opLine(d) + '\n\n' +
'Recibí de ' + F(d, 'recibiDe', 'COMPRADOR') + ' la suma de ' + money(d, 'monto', 'MONTO') + '\n' +
'en concepto de RESERVA DE COMPRA del inmueble ' + F(d, 'inmueble', 'INMUEBLE') + ',\n' +
'a imputarse a ' + F(d, 'imputacion', 'SEÑA/PRECIO') + ', ad referéndum de la aceptación del vendedor.\n' +
'Honorarios / comisión: ' + F(d, 'honorarios', 'HONORARIOS') + '.\n\n' +
'Recibí conforme (operador) ____________________'); },
      checklist: ['Identidad del comprador', 'Imputación clara', 'Sujeción a aceptación del vendedor', 'Comprobante de pago'],
      anexos: ['Comprobante de pago'] },

    { id: 'checklist-boleto', grupo: 'Venta', titulo: 'Checklist boleto / cesión / escritura',
      uso: 'CHECKLIST de documentos y pasos (no es contrato).',
      campos: [ { k: 'inmueble', label: 'Inmueble' }, { k: 'partes', label: 'Partes' }, { k: 'escribania', label: 'Escribanía interviniente' } ],
      cuerpo: function (d) { return (
'CHECKLIST — BOLETO / CESIÓN / ESCRITURA  (preparación de información, NO es un contrato)\n\n' +
'Inmueble: ' + F(d, 'inmueble', 'INMUEBLE') + '.   Partes: ' + F(d, 'partes', 'PARTES') + '.\n' +
'Escribanía interviniente: ' + F(d, 'escribania', 'ESCRIBANÍA') + '.\n\n' +
'TÍTULO Y DOMINIO\n  [ ] Título de propiedad / antecedentes\n  [ ] Informe de dominio actualizado\n  [ ] Informe de inhibiciones de los vendedores\n  [ ] Planos / mensura (si corresponde)\n' +
'DEUDAS Y SERVICIOS\n  [ ] Libre deuda ABL / impuesto inmobiliario\n  [ ] Libre deuda de expensas (si PH) + reglamento\n  [ ] Servicios (aguas, gas, luz) al día\n' +
'PARTES\n  [ ] DNI/CUIT comprador y vendedor\n  [ ] Estado civil / cónyuge / asentimiento conyugal\n  [ ] Poderes (si actúan por apoderado)\n' +
'OPERACIÓN\n  [ ] Reserva / seña instrumentada\n  [ ] Forma y moneda de pago acordada\n  [ ] Fecha de posesión y de escritura\n  [ ] Distribución de gastos e impuestos de la operación\n' +
'PROFESIONALES\n  [ ] Escribanía designada\n  [ ] Asesoramiento legal de las partes\n\n' +
'Este checklist sirve para reunir la información para el/la profesional. NO sustituye el boleto/escritura.'); },
      checklist: ['Título y dominio', 'Inhibiciones', 'Libre deuda ABL/expensas', 'Asentimiento conyugal', 'Escribanía designada'],
      anexos: ['Carpeta de documentación de la operación'] },

    { id: 'boleto-esqueleto', grupo: 'Venta', titulo: 'Borrador base de boleto / cesión (esqueleto)',
      uso: 'ESTRUCTURA con secciones y placeholders. NO es un boleto válido.',
      campos: [ { k: 'inmueble', label: 'Inmueble' }, { k: 'vendedor', label: 'Vendedor' }, { k: 'comprador', label: 'Comprador' },
        C_MON, { k: 'precio', label: 'Precio' }, { k: 'escribania', label: 'Escribanía' } ],
      cuerpo: function (d) { return (
'BORRADOR BASE — BOLETO / CESIÓN  (ESQUELETO · estructura para escribanía/abogado)\n' +
'>> Esto NO es un boleto ni una cesión válida. Es una estructura para ordenar la información.\n' +
'>> El instrumento definitivo lo redacta y valida el/la profesional. No firmar como está.\n\n' +
'1. PARTES — Vendedor: ' + F(d, 'vendedor', 'VENDEDOR') + ' · Comprador: ' + F(d, 'comprador', 'COMPRADOR') + '.\n' +
'   [estado civil / cónyuge / personería — a completar y acreditar]\n' +
'2. INMUEBLE — ' + F(d, 'inmueble', 'INMUEBLE') + '. [nomenclatura, superficie, antecedentes de dominio]\n' +
'3. PRECIO Y FORMA DE PAGO — ' + money(d, 'precio', 'PRECIO') + '. [seña, saldo, moneda, lugar y fecha de pago]\n' +
'4. SEÑA / POSESIÓN — [monto de seña, momento de la posesión]\n' +
'5. PLAZOS — [plazo a escritura, condiciones suspensivas]\n' +
'6. ESCRITURA — Escribanía: ' + F(d, 'escribania', 'ESCRIBANÍA') + '. [designación, fecha estimada]\n' +
'7. GASTOS E IMPUESTOS — [distribución entre partes, sellos, honorarios]\n' +
'8. CONDICIONES / DECLARACIONES — [libre de gravámenes, ocupación, deudas — a verificar]\n' +
'9. FIRMAS — [se instrumenta con el/la profesional interviniente]\n\n' +
'Completar cada sección con asesoramiento. Verificar normativa vigente aplicable.'); },
      checklist: ['Personería y estado civil acreditados', 'Antecedentes de dominio', 'Forma de pago definida', 'Distribución de gastos', 'Escribanía designada', 'Revisión profesional OBLIGATORIA'],
      anexos: ['Toda la carpeta de la operación'] },

    // ===== GENERAL =====
    { id: 'checklist-operacion', grupo: 'General', titulo: 'Checklist documental por operación',
      uso: 'Checklist de documentación según tipo de operación.',
      campos: [ { k: 'tipo', label: 'Tipo de operación', type: 'select', opts: ['alquiler tradicional', 'venta', 'otro'] },
        { k: 'inmueble', label: 'Inmueble' }, { k: 'partes', label: 'Partes' } ],
      cuerpo: function (d) { return (
'CHECKLIST DOCUMENTAL POR OPERACIÓN\n\n' +
'Tipo: ' + F(d, 'tipo', 'TIPO') + '.   Inmueble: ' + F(d, 'inmueble', 'INMUEBLE') + '.   Partes: ' + F(d, 'partes', 'PARTES') + '.\n\n' +
'PROPIEDAD\n  [ ] Título / escritura\n  [ ] Informe de dominio\n  [ ] Reglamento (si PH)\n  [ ] Libre deuda expensas / ABL / servicios\n  [ ] Planos (si corresponde)\n  [ ] Fotos y estado\n  [ ] Autorización (si no es titular)\n' +
'TITULAR / VENDEDOR\n  [ ] DNI / CUIT\n  [ ] Constancia fiscal\n  [ ] Estado civil / asentimiento conyugal\n  [ ] Datos de cobro\n' +
'LOCATARIO / COMPRADOR\n  [ ] DNI / CUIT\n  [ ] Constancia de ingresos\n  [ ] Domicilio / contacto\n' +
'GARANTÍA (alquiler)\n  [ ] DNI garante\n  [ ] Garantía propietaria / recibos / seguro de caución\n  [ ] Informe de dominio / inhibición del garante\n\n' +
'Estados sugeridos: pendiente / recibido / observado-revisar / validado / no aplica.'); },
      checklist: ['Definir tipo de operación', 'Reunir docs de propiedad', 'Reunir docs de las partes', 'Garantía (si alquiler)'],
      anexos: ['Carpeta de la operación'] },

    { id: 'solicitud-propietario', grupo: 'General', titulo: 'Solicitud de documentación al propietario',
      uso: 'Nota pidiendo la documentación al propietario.',
      campos: [ C_OP, { k: 'propietario', label: 'Propietario', req: true }, { k: 'inmueble', label: 'Inmueble', req: true },
        { k: 'limite', label: 'Fecha límite' }, C_FECHA ],
      cuerpo: function (d) { return (
'SOLICITUD DE DOCUMENTACIÓN — PROPIETARIO\n\n' +
'Fecha: ' + F(d, 'fecha', 'FECHA') + '.   ' + opLine(d) + '\n\n' +
'Estimado/a ' + F(d, 'propietario', 'PROPIETARIO') + ', para avanzar con el inmueble ' + F(d, 'inmueble', 'INMUEBLE') + '\n' +
'solicitamos la siguiente documentación:\n' +
'  [ ] DNI / CUIT\n  [ ] Título de propiedad / escritura\n  [ ] Informe de dominio (o autorización para gestionarlo)\n' +
'  [ ] Libre deuda de expensas / reglamento (si PH)\n  [ ] Libre deuda ABL / servicios\n  [ ] Datos de cobro (CBU/alias)\n' +
'  [ ] Autorización para alquilar/vender (si corresponde)\n\n' +
'Fecha límite sugerida: ' + F(d, 'limite', 'FECHA LÍMITE') + '. Quedamos a disposición.'); },
      checklist: ['Lista enviada', 'Fecha límite comunicada', 'Seguimiento agendado'],
      anexos: [] },

    { id: 'solicitud-inquilino', grupo: 'General', titulo: 'Solicitud de documentación a inquilino / comprador',
      uso: 'Nota pidiendo documentación al inquilino o comprador.',
      campos: [ C_OP, { k: 'persona', label: 'Inquilino / comprador', req: true },
        { k: 'tipo', label: 'Tipo', type: 'select', opts: ['inquilino', 'comprador'] }, { k: 'limite', label: 'Fecha límite' }, C_FECHA ],
      cuerpo: function (d) { return (
'SOLICITUD DE DOCUMENTACIÓN — ' + (d && d.tipo ? String(d.tipo).toUpperCase() : 'INQUILINO / COMPRADOR') + '\n\n' +
'Fecha: ' + F(d, 'fecha', 'FECHA') + '.   ' + opLine(d) + '\n\n' +
'Estimado/a ' + F(d, 'persona', 'PERSONA') + ', solicitamos la siguiente documentación:\n' +
'  [ ] DNI / CUIT\n  [ ] Constancia de ingresos / recibos / monotributo\n  [ ] Domicilio actual\n  [ ] Teléfono / email\n' +
'  [ ] (Alquiler) Datos de la garantía propuesta\n  [ ] (Compra) Origen de fondos / forma de pago\n\n' +
'Fecha límite sugerida: ' + F(d, 'limite', 'FECHA LÍMITE') + '. Quedamos a disposición.'); },
      checklist: ['Lista enviada', 'Garantía/forma de pago consultada', 'Seguimiento agendado'],
      anexos: [] },

    { id: 'solicitud-garante', grupo: 'General', titulo: 'Solicitud de documentación al garante',
      uso: 'Nota pidiendo documentación al garante.',
      campos: [ C_OP, { k: 'garante', label: 'Garante', req: true },
        { k: 'tipoGar', label: 'Tipo de garantía', ph: 'propietaria / recibos / caución' }, { k: 'limite', label: 'Fecha límite' }, C_FECHA ],
      cuerpo: function (d) { return (
'SOLICITUD DE DOCUMENTACIÓN — GARANTE\n\n' +
'Fecha: ' + F(d, 'fecha', 'FECHA') + '.   ' + opLine(d) + '\n\n' +
'Estimado/a ' + F(d, 'garante', 'GARANTE') + ', tipo de garantía: ' + F(d, 'tipoGar', 'TIPO') + '.\n' +
'Solicitamos:\n' +
'  [ ] DNI / CUIT del garante\n  [ ] (Propietaria) Título + informe de dominio + inhibición\n  [ ] (Propietaria) Asentimiento conyugal si corresponde\n' +
'  [ ] (Recibos) Últimos recibos de sueldo / constancia laboral\n  [ ] (Caución) Póliza de seguro de caución\n  [ ] Comprobantes de ingresos\n\n' +
'Fecha límite sugerida: ' + F(d, 'limite', 'FECHA LÍMITE') + '. Quedamos a disposición.'); },
      checklist: ['Tipo de garantía definido', 'Lista enviada', 'Informe de dominio del garante (si propietaria)'],
      anexos: [] },

    { id: 'acta-recepcion-doc', grupo: 'General', titulo: 'Acta de entrega / recepción de documentación',
      uso: 'Constancia simple de qué documentación se entregó/recibió.',
      campos: [ C_OP, { k: 'entrega', label: 'Entrega (nombre)', req: true }, { k: 'recibe', label: 'Recibe (nombre)', req: true },
        { k: 'detalle', label: 'Documentación', type: 'textarea', req: true, ph: 'listado de documentos' }, C_FECHA ],
      cuerpo: function (d) { return (
'ACTA DE ENTREGA / RECEPCIÓN DE DOCUMENTACIÓN\n\n' +
'En ' + F(d, 'fecha', 'FECHA') + '.   ' + opLine(d) + '\n\n' +
F(d, 'entrega', 'QUIEN ENTREGA') + ' entrega a ' + F(d, 'recibe', 'QUIEN RECIBE') + ' la siguiente documentación:\n' +
F(d, 'detalle', 'LISTADO DE DOCUMENTOS') + '\n\n' +
'Quien recibe declara recibirla de conformidad, sin que ello implique validación de su contenido.\n\n' +
'Entrega ____________________      Recibe ____________________'); },
      checklist: ['Detalle de documentos listado', 'Copias/originales aclarado', 'Firma de ambas partes'],
      anexos: ['Copia del listado'] }
  ];

  // ── NÚCLEO PURO (testeable por node) ────────────────────────────────────────
  function getModelo(id) { for (var i = 0; i < MODELOS.length; i++) if (MODELOS[i].id === id) return MODELOS[i]; return null; }

  function faltantes(model, d) {
    if (!model) return [];
    d = d || {};
    var out = [];
    (model.campos || []).forEach(function (c) {
      if (c.req && (d[c.k] == null || String(d[c.k]).trim() === '')) out.push(c.label);
    });
    return out;
  }

  function previewText(model, d) {
    if (typeof model === 'string') model = getModelo(model);
    if (!model) return '';
    d = d || {};
    var body = model.cuerpo ? model.cuerpo(d) : '';
    var extra = model.delegate ? '\n\n[Este modelo delega en el generador dedicado: ' + model.delegate + '.open()]' : '';
    var anex = (model.anexos && model.anexos.length) ? '\n\nANEXOS SUGERIDOS:\n  - ' + model.anexos.join('\n  - ') : '';
    return BANNER_TOP + '\n\n' + body + extra + anex + '\n\n' + BANNER_BOTTOM;
  }

  // ── API pública ─────────────────────────────────────────────────────────────
  var ModelosDoc = {
    MODELOS: MODELOS, previewText: previewText, faltantes: faltantes, getModelo: getModelo,
    BANNER_TOP: BANNER_TOP
  };

  // localStorage opcional (por modelo)
  function loadStore() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; } }
  function saveStore(s) { try { localStorage.setItem(LS_KEY, JSON.stringify(s)); return true; } catch (e) { return false; } }

  // ── UI (modal) — solo si hay DOM ────────────────────────────────────────────
  var GOLD = '#d4af37', GOLD2 = '#e8c766', BG = '#15151a', BG2 = '#0e0e12', BR = '#3a3a44', TXT = '#e8e8ee', MUT = '#9a9aa2';
  var current = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function fieldHTML(c) {
    var id = 'md-f-' + c.k, lab = '<label for="' + id + '" style="display:block;color:' + MUT + ';font-size:11px;margin:8px 0 3px">' + esc(c.label) + (c.req ? ' *' : '') + '</label>';
    var base = 'id="' + id + '" data-k="' + c.k + '" style="width:100%;box-sizing:border-box;padding:8px 9px;border-radius:7px;border:1px solid ' + BR + ';background:' + BG2 + ';color:#fff;font-size:13px;outline:none"';
    if (c.type === 'select') {
      var o = (c.opts || []).map(function (v) { return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; }).join('');
      return lab + '<select ' + base + '>' + o + '</select>';
    }
    if (c.type === 'textarea') return lab + '<textarea ' + base + ' rows="3" placeholder="' + esc(c.ph || c.hint || '') + '"></textarea>';
    return lab + '<input ' + base + ' type="text" value="' + esc(c.def || '') + '" placeholder="' + esc(c.ph || c.hint || '') + '" autocomplete="off">';
  }

  function collect() {
    var d = {};
    var form = document.getElementById('md-form'); if (!form) return d;
    form.querySelectorAll('[data-k]').forEach(function (el) { var v = el.value; if (v != null && String(v).trim() !== '') d[el.getAttribute('data-k')] = v; });
    return d;
  }

  function render() {
    if (!current) return;
    var d = collect();
    var pv = document.getElementById('md-prev'); if (pv) pv.textContent = previewText(current, d);
    var ft = faltantes(current, d), fe = document.getElementById('md-falt');
    if (fe) fe.innerHTML = ft.length ? '⚠️ Faltan: ' + ft.map(esc).join(' · ') : '✓ Datos mínimos completos';
    var ch = document.getElementById('md-check');
    if (ch) ch.innerHTML = (current.checklist || []).map(function (x) { return '<div>☐ ' + esc(x) + '</div>'; }).join('');
  }

  function setModel(id, keepData) {
    current = getModelo(id); if (!current) return;
    var form = document.getElementById('md-form');
    var del = document.getElementById('md-delegate');
    if (current.delegate) {
      if (form) form.innerHTML = '<div style="color:' + MUT + ';font-size:13px;line-height:1.6">Este modelo usa el <b>generador dedicado</b> (23 cláusulas).</div>';
      if (del) del.style.display = '';
    } else {
      if (del) del.style.display = 'none';
      if (form) {
        form.innerHTML = (current.campos || []).map(fieldHTML).join('');
        if (!keepData) { var st = loadStore()[id]; if (st) Object.keys(st).forEach(function (k) { var el = document.getElementById('md-f-' + k); if (el) el.value = st[k]; }); }
        form.querySelectorAll('[data-k]').forEach(function (el) { el.addEventListener('input', render); el.addEventListener('change', render); });
      }
    }
    var usoEl = document.getElementById('md-uso'); if (usoEl) usoEl.textContent = current.uso || '';
    render();
  }

  function toast(msg) {
    var t = document.getElementById('md-toast'); if (!t) return; t.textContent = msg; t.style.opacity = '1';
    setTimeout(function () { t.style.opacity = '0'; }, 2200);
  }

  ModelosDoc.open = function (preId) {
    if (document.getElementById('md-ov')) return;
    var groups = {}; MODELOS.forEach(function (m) { (groups[m.grupo] = groups[m.grupo] || []).push(m); });
    var optgroups = Object.keys(groups).map(function (g) {
      return '<optgroup label="' + esc(g) + '">' + groups[g].map(function (m) { return '<option value="' + m.id + '">' + esc(m.titulo) + '</option>'; }).join('') + '</optgroup>';
    }).join('');
    var ov = document.createElement('div'); ov.id = 'md-ov';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;background:rgba(8,8,10,.9);backdrop-filter:blur(3px);font-family:system-ui,sans-serif';
    ov.innerHTML =
      '<div style="background:' + BG + ';border:1px solid ' + GOLD + ';border-radius:14px;width:min(96vw,920px);max-height:92vh;display:flex;flex-direction:column;box-shadow:0 18px 60px rgba(0,0,0,.6)">' +
        '<div style="display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid ' + BR + '">' +
          '<h2 style="margin:0;color:' + GOLD2 + ';font-size:18px;flex:1">📚 Modelos documentales</h2>' +
          '<select id="md-sel" style="padding:8px 9px;border-radius:7px;border:1px solid ' + BR + ';background:' + BG2 + ';color:#fff;font-size:13px;max-width:50%">' + optgroups + '</select>' +
          '<button id="md-x" style="background:none;border:0;color:' + MUT + ';font-size:22px;cursor:pointer;line-height:1">×</button>' +
        '</div>' +
        '<div style="padding:10px 18px 0"><div style="background:rgba(212,175,55,.12);border:1px solid ' + GOLD + ';border-radius:8px;padding:8px 11px;color:' + GOLD2 + ';font-size:12px">⚠️ <b>BORRADOR OPERATIVO</b> — sujeto a revisión legal / escribanía / gestor. No valida legalmente ni es "listo para firmar".</div>' +
          '<div id="md-uso" style="color:' + MUT + ';font-size:12px;margin:7px 2px 0"></div></div>' +
        '<div style="display:flex;gap:14px;padding:12px 18px;overflow:auto;flex:1">' +
          '<div style="flex:0 0 38%;min-width:240px"><div id="md-form"></div>' +
            '<div id="md-delegate" style="display:none;margin-top:10px"><button id="md-godeleg" style="width:100%;padding:10px;border:0;border-radius:8px;background:' + GOLD + ';color:#101013;font-weight:700;cursor:pointer">📄 Abrir generador dedicado</button></div>' +
            '<div style="margin-top:12px;display:flex;gap:7px;flex-wrap:wrap">' +
              '<button id="md-copy" style="flex:1;padding:9px;border:0;border-radius:7px;background:' + GOLD + ';color:#101013;font-weight:700;cursor:pointer">Copiar</button>' +
              '<button id="md-clear" style="padding:9px 12px;border:1px solid ' + BR + ';border-radius:7px;background:transparent;color:' + TXT + ';cursor:pointer">Limpiar</button>' +
              '<button id="md-save" style="padding:9px 12px;border:1px solid ' + BR + ';border-radius:7px;background:transparent;color:' + TXT + ';cursor:pointer">Guardar local</button>' +
            '</div>' +
            '<div id="md-falt" style="margin-top:9px;font-size:12px;color:' + MUT + '"></div>' +
            '<div style="margin-top:9px;font-size:12px;color:' + MUT + '"><b style="color:' + TXT + '">Checklist</b><div id="md-check" style="margin-top:3px;line-height:1.5"></div></div>' +
          '</div>' +
          '<div style="flex:1;min-width:0"><pre id="md-prev" style="margin:0;white-space:pre-wrap;word-break:break-word;background:' + BG2 + ';border:1px solid ' + BR + ';border-radius:8px;padding:12px;color:' + TXT + ';font-size:12px;line-height:1.5;max-height:100%;overflow:auto"></pre></div>' +
        '</div>' +
        '<div id="md-toast" style="opacity:0;transition:opacity .2s;text-align:center;padding:6px;color:' + GOLD2 + ';font-size:12px">·</div>' +
      '</div>';
    document.body.appendChild(ov);
    function close() { var n = document.getElementById('md-ov'); if (n) n.remove(); current = null; }
    document.getElementById('md-x').onclick = close;
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.getElementById('md-sel').addEventListener('change', function () { setModel(this.value); });
    document.getElementById('md-godeleg').onclick = function () { if (window.ContratoAlq && current && current.delegate === 'ContratoAlq') { close(); window.ContratoAlq.open(); } };
    document.getElementById('md-copy').onclick = function () {
      if (current && current.delegate) { toast('Usá el generador dedicado.'); return; }
      var txt = previewText(current, collect());
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { toast('Copiado al portapapeles.'); }, function () { toast('No se pudo copiar.'); });
      else toast('Portapapeles no disponible.');
    };
    document.getElementById('md-clear').onclick = function () { if (current && !current.delegate) { setModel(current.id, true); document.querySelectorAll('#md-form [data-k]').forEach(function (el) { if (el.tagName !== 'SELECT') el.value = (current.campos.filter(function (c) { return c.k === el.getAttribute('data-k'); })[0] || {}).def || ''; }); render(); toast('Formulario limpio.'); } };
    document.getElementById('md-save').onclick = function () { if (current && !current.delegate) { var s = loadStore(); s[current.id] = collect(); saveStore(s) ? toast('Guardado local (este navegador). No persiste en CRM.') : toast('No se pudo guardar.'); } };
    setModel(preId && getModelo(preId) ? preId : MODELOS[0].id);
    document.getElementById('md-sel').value = current.id;
  };

  if (typeof window !== 'undefined') window.ModelosDoc = ModelosDoc;
  if (typeof module !== 'undefined' && module.exports) module.exports = { MODELOS: MODELOS, previewText: previewText, faltantes: faltantes, getModelo: getModelo, BANNER_TOP: BANNER_TOP };
})();
