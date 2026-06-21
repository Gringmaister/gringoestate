/* S106B/C — Modelos Documentales (biblioteca de borradores operativos) · front-only.
 * Patrón espejo de contrato.js: funciones puras (previewText/faltantes) testeables por node,
 * window.ModelosDoc para el panel, localStorage opcional. SIN fetch/bridge/Notion/PDF/WhatsApp.
 *
 * REGLA LEGAL (no negociable): todo lo que sale es BORRADOR OPERATIVO. No valida legalmente,
 * no dice "listo para firmar", no hardcodea ley/artículos como verdad cerrada. Los modelos de
 * venta pesados (boleto/cesión/escritura) salen ESQUELÉTICOS: estructura para preparar info
 * para abogado/escribanía/gestor, no contrato final.
 *
 * S106C — hardening: DNI/CUIT transversal, campos operativos ampliados (canon/plazo/destino/
 * garantía/desistimiento/forma de pago/escritura/comisión/publicación), inventario guiado por
 * categorías, boleto-esqueleto con advertencia reforzada. Operador neutral (sin default fijo).
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

  // Hint del operador — NEUTRAL, editable, sin marca hardcodeada como default obligatorio.
  var OPERADOR_HINT = 'Baigun · Gringo · AMBBI · Metropolitan · Franco Garbini · otro';
  var CARACTER_OPTS = ['propietario', 'apoderado', 'administrador', 'usufructuario', 'otro'];

  // helpers de placeholder
  function F(d, k, ph) { return (d && d[k] != null && String(d[k]).trim() !== '') ? String(d[k]).trim() : '[COMPLETAR ' + ph + ']'; }
  function money(d, kMonto, phMonto) { return F(d, 'moneda', 'MONEDA') + ' ' + F(d, kMonto, phMonto); }
  function opLine(d) { return 'Operador / intermediario interviniente: ' + F(d, 'operador', 'OPERADOR (' + OPERADOR_HINT + ')') + '.'; }
  // Parte con identificación fiscal (DNI/CUIT transversal — S106C)
  function parte(d, kN, kDni, phN) { return F(d, kN, phN) + ' (DNI/CUIT ' + F(d, kDni, 'DNI/CUIT') + ')'; }

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
        { k: 'locatario', label: 'Reservante / locatario', req: true }, { k: 'locatarioDni', label: 'DNI/CUIT del reservante' },
        { k: 'locador', label: 'Locador / propietario' }, { k: 'locadorDni', label: 'DNI/CUIT del locador' },
        C_MON, { k: 'monto', label: 'Monto de la reserva', req: true },
        { k: 'canon', label: 'Canon mensual pretendido' }, { k: 'plazoLoc', label: 'Plazo de locación pretendido', ph: 'p. ej. 36 meses' },
        { k: 'destino', label: 'Destino', type: 'select', opts: ['vivienda', 'comercial', 'oficina', 'otro'] },
        { k: 'garantia', label: 'Garantía propuesta', ph: 'propietaria / recibos / caución' },
        { k: 'plazoAcept', label: 'Plazo de aceptación', ph: 'p. ej. 5 días' }, { k: 'vigencia', label: 'Vigencia de la oferta' },
        { k: 'imputacion', label: 'Se imputa a', ph: 'depósito / primer mes' },
        { k: 'desistimiento', label: 'Desistimiento del reservante', ph: 'efecto si el reservante desiste' },
        { k: 'condiciones', label: 'Condiciones particulares', type: 'textarea' }, C_FECHA ],
      cuerpo: function (d) { return (
'RESERVA / SEÑA DE ALQUILER (ad referéndum del propietario)\n\n' +
'Fecha: ' + F(d, 'fecha', 'FECHA') + '.  ' + opLine(d) + '\n\n' +
'1) El/la reservante ' + parte(d, 'locatario', 'locatarioDni', 'RESERVANTE') + ' entrega en concepto de\n' +
'   reserva la suma de ' + money(d, 'monto', 'MONTO') + ' por el inmueble sito en ' + F(d, 'inmueble', 'INMUEBLE') + ',\n' +
'   ofrecido en locación por ' + parte(d, 'locador', 'locadorDni', 'LOCADOR / PROPIETARIO') + '.\n' +
'2) Condiciones pretendidas de la locación: canon mensual ' + F(d, 'canon', 'CANON') + ', plazo ' + F(d, 'plazoLoc', 'PLAZO') +
   ', destino ' + F(d, 'destino', 'DESTINO') + ', garantía propuesta ' + F(d, 'garantia', 'GARANTÍA') + '.\n' +
'3) La presente queda sujeta a la ACEPTACIÓN del propietario dentro de ' + F(d, 'plazoAcept', 'PLAZO DE ACEPTACIÓN') +
   '. Vigencia de la oferta: ' + F(d, 'vigencia', 'VIGENCIA') + '.\n' +
'4) ACEPTADA: el monto se imputa a ' + F(d, 'imputacion', 'IMPUTACIÓN (depósito/1er mes)') + ' y las partes suscribirán el\n' +
'   contrato de locación con la documentación y garantías correspondientes.\n' +
'5) RECHAZADA o no respondida en el plazo: la reserva se restituye al reservante sin penalidad.\n' +
'6) Desistimiento del reservante: ' + F(d, 'desistimiento', 'EFECTO (a acordar con asesoramiento)') + '.\n' +
'7) Condiciones particulares: ' + F(d, 'condiciones', 'CONDICIONES (si las hay)') + '.\n\n' +
'Firmas:  Reservante ____________________    Recibido por (operador) ____________________'); },
      checklist: ['DNI/CUIT del reservante', 'Datos del propietario', 'Canon/plazo/destino pretendidos', 'Garantía propuesta', 'Efecto del desistimiento por escrito', 'Comprobante de la reserva'],
      anexos: ['Comprobante de pago', 'Datos de contacto de las partes'] },

    { id: 'acta-llaves', grupo: 'Alquiler', titulo: 'Acta de entrega de llaves',
      uso: 'Constancia de entrega/recepción de llaves y accesos.',
      campos: [ { k: 'inmueble', label: 'Inmueble', req: true },
        { k: 'entrega', label: 'Entrega (nombre)', req: true }, { k: 'entregaDni', label: 'DNI/CUIT de quien entrega' },
        { k: 'recibe', label: 'Recibe (nombre)', req: true }, { k: 'recibeDni', label: 'DNI/CUIT de quien recibe' },
        { k: 'refContrato', label: 'Referencia al contrato / reserva', ph: 'contrato de fecha…' },
        { k: 'juegos', label: 'Juegos de llaves', ph: 'cantidad' },
        { k: 'accesos', label: 'Accesos digitales / QR / claves / controles', ph: 'tags, control, portón, app' },
        { k: 'medLuz', label: 'Medidor luz (nº + lectura)' }, { k: 'medGas', label: 'Medidor gas (nº + lectura)' },
        { k: 'medAgua', label: 'Medidor agua (nº + lectura)' },
        { k: 'observaciones', label: 'Observaciones de estado', type: 'textarea' }, C_FECHA, { k: 'hora', label: 'Hora' } ],
      cuerpo: function (d) { return (
'ACTA DE ENTREGA DE LLAVES\n\n' +
'En ' + F(d, 'fecha', 'FECHA') + ' ' + F(d, 'hora', 'HORA') + ', respecto del inmueble ' + F(d, 'inmueble', 'INMUEBLE') + '.\n' +
'Referencia: ' + F(d, 'refContrato', 'CONTRATO / RESERVA') + '.\n\n' +
parte(d, 'entrega', 'entregaDni', 'QUIEN ENTREGA') + ' hace entrega a ' + parte(d, 'recibe', 'recibeDni', 'QUIEN RECIBE') + ' de:\n' +
'  - Juegos de llaves: ' + F(d, 'juegos', 'CANTIDAD') + '\n' +
'  - Accesos digitales / QR / claves / controles: ' + F(d, 'accesos', 'DETALLE') + '\n' +
'  - Medidor luz: ' + F(d, 'medLuz', 'Nº + LECTURA') + '\n' +
'  - Medidor gas: ' + F(d, 'medGas', 'Nº + LECTURA') + '\n' +
'  - Medidor agua: ' + F(d, 'medAgua', 'Nº + LECTURA') + '\n' +
'  - Observaciones de estado: ' + F(d, 'observaciones', 'OBSERVACIONES') + '\n\n' +
'Quien recibe declara recibir de conformidad los accesos detallados.\n\n' +
'Entrega ____________________      Recibe ____________________'); },
      checklist: ['DNI de ambas partes', 'Referencia al contrato/reserva', 'Cantidad de juegos verificada', 'Accesos digitales probados', 'Nº y lectura de medidores', 'Fotos de medidores'],
      anexos: ['Fotos de llaves/medidores'] },

    { id: 'inventario', grupo: 'Alquiler', titulo: 'Inventario y estado del inmueble',
      uso: 'Estado guiado por categorías (pintura, pisos, muebles, artefactos, sanitarios…).',
      campos: [ { k: 'inmueble', label: 'Inmueble', req: true }, { k: 'partes', label: 'Partes presentes' }, C_FECHA,
        { k: 'estado', label: 'Estado general', ph: 'bueno / a revisar' },
        { k: 'pintura', label: 'Pintura / paredes / cielorrasos', type: 'textarea' },
        { k: 'pisos', label: 'Pisos / aberturas / vidrios', type: 'textarea' },
        { k: 'muebles', label: 'Muebles', type: 'textarea' },
        { k: 'artefactos', label: 'Artefactos / electrodomésticos', type: 'textarea' },
        { k: 'sanitarios', label: 'Sanitarios / griferías', type: 'textarea' },
        { k: 'cerraduras', label: 'Cerraduras / accesos', type: 'textarea' },
        { k: 'instalaciones', label: 'Instalaciones (luz/gas/agua/clima)', type: 'textarea' },
        { k: 'danos', label: 'Daños / preexistencias', type: 'textarea' },
        { k: 'ambientes', label: 'Detalle libre por ambiente', type: 'textarea', ph: 'cocina, baño, living, dormitorios…' },
        { k: 'fotosRef', label: 'Referencia de fotos', ph: 'nº/álbum del anexo fotográfico' },
        { k: 'observaciones', label: 'Observaciones', type: 'textarea' } ],
      cuerpo: function (d) { return (
'INVENTARIO Y ESTADO DEL INMUEBLE\n\n' +
'Inmueble: ' + F(d, 'inmueble', 'INMUEBLE') + '.   Fecha: ' + F(d, 'fecha', 'FECHA') + '.   Partes: ' + F(d, 'partes', 'PARTES') + '.\n' +
'Estado general de conservación: ' + F(d, 'estado', 'ESTADO') + '.\n\n' +
'POR CATEGORÍA (estado / cantidad / observaciones):\n' +
'  - Pintura / paredes / cielorrasos: ' + F(d, 'pintura', 'DETALLE') + '\n' +
'  - Pisos / aberturas / vidrios: ' + F(d, 'pisos', 'DETALLE') + '\n' +
'  - Muebles: ' + F(d, 'muebles', 'DETALLE') + '\n' +
'  - Artefactos / electrodomésticos: ' + F(d, 'artefactos', 'DETALLE') + '\n' +
'  - Sanitarios / griferías: ' + F(d, 'sanitarios', 'DETALLE') + '\n' +
'  - Cerraduras / accesos: ' + F(d, 'cerraduras', 'DETALLE') + '\n' +
'  - Instalaciones (luz/gas/agua/clima): ' + F(d, 'instalaciones', 'DETALLE') + '\n' +
'  - Daños / preexistencias: ' + F(d, 'danos', 'DETALLE') + '\n\n' +
'Detalle libre por ambiente:\n' + F(d, 'ambientes', 'COCINA / BAÑO / LIVING / DORMITORIOS…') + '\n\n' +
'Referencia fotográfica: ' + F(d, 'fotosRef', 'Nº/ÁLBUM') + '.   Observaciones: ' + F(d, 'observaciones', 'OBSERVACIONES') + '.\n\n' +
'El locatario recibe en el estado descripto y se obliga a restituir en igual estado,\n' +
'salvo el deterioro por uso normal. El anexo fotográfico forma parte del presente.\n\n' +
'Conformidad: Locador ____________________    Locatario ____________________'); },
      checklist: ['Recorrida por categoría e ítems', 'Daños/preexistencias registrados', 'Artefactos y llaves de paso probados', 'Registro fotográfico numerado', 'Firma de ambas partes'],
      anexos: ['Anexo fotográfico numerado', 'Lista de artefactos/muebles'] },

    { id: 'recibo', grupo: 'Alquiler', titulo: 'Recibo de pago / depósito / reserva',
      uso: 'Recibo simple (alquiler o venta). Honorarios opcional.',
      campos: [ C_OP, { k: 'recibiDe', label: 'Recibí de', req: true }, { k: 'recibiDeDni', label: 'DNI/CUIT de quien paga' },
        { k: 'concepto', label: 'Concepto', req: true, ph: 'depósito / reserva / mes' },
        C_MON, { k: 'monto', label: 'Monto', req: true }, { k: 'inmueble', label: 'Inmueble (si aplica)' },
        { k: 'imputacion', label: 'Imputación' }, { k: 'medioPago', label: 'Medio de pago', ph: 'efectivo / transferencia' },
        { k: 'nroRecibo', label: 'Nº de recibo / referencia' },
        { k: 'honorarios', label: 'Honorarios (opcional)', ph: 'solo si corresponde' }, C_FECHA ],
      cuerpo: function (d) { return (
'RECIBO  Nº ' + F(d, 'nroRecibo', 'Nº/REF') + '\n\n' +
'Fecha: ' + F(d, 'fecha', 'FECHA') + '.   ' + opLine(d) + '\n\n' +
'Recibí de ' + parte(d, 'recibiDe', 'recibiDeDni', 'QUIÉN PAGA') + ' la suma de ' + money(d, 'monto', 'MONTO') + '\n' +
'en concepto de ' + F(d, 'concepto', 'CONCEPTO') + '\n' +
'respecto del inmueble ' + F(d, 'inmueble', 'INMUEBLE (si aplica)') + '.\n' +
'Imputación: ' + F(d, 'imputacion', 'IMPUTACIÓN') + '.   Medio de pago: ' + F(d, 'medioPago', 'MEDIO') + '.\n' +
(d && d.honorarios ? 'Honorarios / comisión: ' + d.honorarios + '.\n' : '') +
'\nRecibí conforme ____________________'); },
      checklist: ['Identidad y DNI de quien paga', 'Concepto e imputación claros', 'Medio de pago y nº de recibo', 'Comprobante del pago'],
      anexos: ['Comprobante de transferencia (si aplica)'] },

    { id: 'autoriz-alquiler', grupo: 'Alquiler', titulo: 'Autorización para alquilar (no titular)',
      uso: 'Autorización del titular para gestionar/ofrecer en alquiler.',
      campos: [ { k: 'titular', label: 'Titular / propietario', req: true }, { k: 'titularDni', label: 'DNI/CUIT del titular' },
        { k: 'caracter', label: 'Carácter del firmante', type: 'select', opts: CARACTER_OPTS },
        { k: 'contacto', label: 'Datos de contacto' }, C_OP,
        { k: 'inmueble', label: 'Inmueble', req: true }, C_MON, { k: 'canon', label: 'Canon pretendido' },
        { k: 'plazo', label: 'Plazo pretendido' },
        { k: 'autorizPublicacion', label: 'Autoriza publicación', type: 'select', opts: ['sí', 'no'] },
        { k: 'autorizFotos', label: 'Autoriza fotos/videos', type: 'select', opts: ['sí', 'no'] },
        { k: 'alcance', label: 'Alcance del operador', ph: 'ofrecer, mostrar, reservar' }, { k: 'vigencia', label: 'Vigencia' },
        { k: 'condComercial', label: 'Condiciones comerciales internas (opcional)', ph: 'no es cláusula del documento' }, C_FECHA ],
      cuerpo: function (d) { return (
'AUTORIZACIÓN PARA GESTIONAR EL ALQUILER\n\n' +
'En ' + F(d, 'fecha', 'FECHA') + '. ' + parte(d, 'titular', 'titularDni', 'TITULAR') + ', en su carácter de ' +
   F(d, 'caracter', 'CARÁCTER') + ' del inmueble ' + F(d, 'inmueble', 'INMUEBLE') + ',\n' +
'autoriza a ' + F(d, 'operador', 'OPERADOR (' + OPERADOR_HINT + ')') + ' a gestionar su locación.\n' +
'Contacto del titular: ' + F(d, 'contacto', 'CONTACTO') + '.\n' +
'Condiciones pretendidas: canon ' + money(d, 'canon', 'CANON') + ', plazo ' + F(d, 'plazo', 'PLAZO') + '.\n' +
'Alcance del operador: ' + F(d, 'alcance', 'ALCANCE') + '.   Vigencia: ' + F(d, 'vigencia', 'VIGENCIA') + '.\n' +
'Autoriza publicación: ' + F(d, 'autorizPublicacion', 'SÍ/NO') + '.   Autoriza fotos/videos: ' + F(d, 'autorizFotos', 'SÍ/NO') + '.\n' +
(d && d.condComercial ? '\n(Nota interna, no es cláusula del documento) Condiciones comerciales: ' + d.condComercial + '.\n' : '') +
'\nLa presente queda sujeta a la acreditación de la titularidad y de las facultades para\n' +
'alquilar. No implica delegación de facultades no expresadas.\n\n' +
'Titular ____________________'); },
      checklist: ['Acreditación de titularidad', 'DNI/CUIT del titular', 'Carácter del firmante', 'Condiciones pretendidas', 'Autorización de publicación/fotos', 'Alcance y vigencia por escrito'],
      anexos: ['Copia de título / constancia de dominio'] },

    // ===== VENTA =====
    { id: 'reserva-compra', grupo: 'Venta', titulo: 'Reserva de compra',
      uso: 'Oferta de compra + reserva ad referéndum del vendedor.',
      campos: [ C_OP, { k: 'comprador', label: 'Comprador / oferente', req: true }, { k: 'compradorDni', label: 'DNI/CUIT del comprador' },
        { k: 'vendedor', label: 'Oferta dirigida a (vendedor)' }, { k: 'vendedorDni', label: 'DNI/CUIT del vendedor (si se conoce)' },
        { k: 'inmueble', label: 'Inmueble', req: true }, C_MON, { k: 'precio', label: 'Precio ofertado', req: true },
        { k: 'monto', label: 'Monto de la reserva', req: true }, { k: 'formaPago', label: 'Forma de pago del precio', ph: 'contado / financiado' },
        { k: 'plazoBoleto', label: 'Plazo a boleto' }, { k: 'plazoEscritura', label: 'Plazo a escritura' },
        { k: 'escribania', label: 'Escribanía propuesta' }, { k: 'plazoAcept', label: 'Plazo de aceptación' },
        { k: 'vigencia', label: 'Vigencia de la oferta' }, { k: 'desistimiento', label: 'Desistimiento del comprador' },
        { k: 'honorarios', label: 'Honorarios / comisión' }, { k: 'aCargoDe', label: 'Comisión a cargo de' },
        { k: 'condiciones', label: 'Condiciones', type: 'textarea' }, C_FECHA ],
      cuerpo: function (d) { return (
'RESERVA DE COMPRA — OFERTA AD REFERÉNDUM DEL VENDEDOR\n\n' +
'Fecha: ' + F(d, 'fecha', 'FECHA') + '.   ' + opLine(d) + '\n\n' +
'1) ' + parte(d, 'comprador', 'compradorDni', 'COMPRADOR/OFERENTE') + ' ofrece adquirir el inmueble\n' +
'   ' + F(d, 'inmueble', 'INMUEBLE') + ' por ' + money(d, 'precio', 'PRECIO') + ', dirigida a ' +
   parte(d, 'vendedor', 'vendedorDni', 'VENDEDOR') + '.\n' +
'2) Forma de pago del precio: ' + F(d, 'formaPago', 'CONTADO/FINANCIADO') + '. Entrega en concepto de reserva ' +
   money(d, 'monto', 'MONTO RESERVA') + '.\n' +
'3) Plazos: aceptación dentro de ' + F(d, 'plazoAcept', 'PLAZO') + '; a boleto ' + F(d, 'plazoBoleto', 'PLAZO') +
   '; a escritura ' + F(d, 'plazoEscritura', 'PLAZO') + '. Escribanía propuesta: ' + F(d, 'escribania', 'ESCRIBANÍA') + '.\n' +
'   Vigencia de la oferta: ' + F(d, 'vigencia', 'VIGENCIA') + '.\n' +
'4) ACEPTADA: se imputa a la seña/precio y las partes instrumentarán boleto/cesión/escritura con\n' +
'   intervención profesional. RECHAZADA: se restituye sin penalidad.\n' +
'5) Desistimiento del comprador: ' + F(d, 'desistimiento', 'EFECTO (a acordar con asesoramiento)') + '.\n' +
'6) Honorarios / comisión: ' + F(d, 'honorarios', 'HONORARIOS') + ' (a cargo de ' + F(d, 'aCargoDe', 'A CARGO DE') + ').\n' +
'7) Condiciones: ' + F(d, 'condiciones', 'CONDICIONES') + '.\n\n' +
'Comprador ____________________    Recibido por (operador) ____________________'); },
      checklist: ['DNI/CUIT comprador (y vendedor si se conoce)', 'Forma de pago del precio', 'Plazos a boleto y escritura', 'Escribanía propuesta', 'Efecto del desistimiento', 'Honorarios y a cargo de quién'],
      anexos: ['Comprobante de pago', 'Detalle del inmueble'] },

    { id: 'autoriz-venta', grupo: 'Venta', titulo: 'Autorización de venta / comercialización',
      uso: 'Autorización del titular para comercializar en venta.',
      campos: [ { k: 'titular', label: 'Titular / propietario', req: true }, { k: 'titularDni', label: 'DNI/CUIT del titular' },
        { k: 'caracter', label: 'Carácter del firmante', type: 'select', opts: CARACTER_OPTS }, C_OP,
        { k: 'matricula', label: 'Matrícula del operador (opcional)' }, { k: 'inmueble', label: 'Inmueble', req: true },
        C_MON, { k: 'precio', label: 'Precio pretendido' },
        { k: 'exclusividad', label: 'Exclusividad', type: 'select', opts: ['no', 'sí'] }, { k: 'vigencia', label: 'Vigencia' },
        { k: 'comisionPct', label: 'Comisión %' }, { k: 'comisionACargo', label: 'Comisión a cargo de' },
        { k: 'autorizPublicacion', label: 'Autoriza publicación', type: 'select', opts: ['sí', 'no'] },
        { k: 'autorizFotos', label: 'Autoriza fotos/videos', type: 'select', opts: ['sí', 'no'] },
        { k: 'condiciones', label: 'Condiciones aceptables', type: 'textarea' }, C_FECHA ],
      cuerpo: function (d) { return (
'AUTORIZACIÓN DE VENTA / COMERCIALIZACIÓN\n\n' +
'En ' + F(d, 'fecha', 'FECHA') + '. ' + parte(d, 'titular', 'titularDni', 'TITULAR') + ', en carácter de ' +
   F(d, 'caracter', 'CARÁCTER') + ' del inmueble ' + F(d, 'inmueble', 'INMUEBLE') + ',\n' +
'autoriza a ' + F(d, 'operador', 'OPERADOR (' + OPERADOR_HINT + ')') + ' (matrícula ' + F(d, 'matricula', 'MATRÍCULA si corresponde') +
   ') a comercializarlo en venta.\n' +
'Precio pretendido: ' + money(d, 'precio', 'PRECIO') + '.   Exclusividad: ' + F(d, 'exclusividad', 'SÍ/NO') +
   '.   Vigencia: ' + F(d, 'vigencia', 'VIGENCIA') + '.\n' +
'Comisión: ' + F(d, 'comisionPct', '%') + ', a cargo de ' + F(d, 'comisionACargo', 'A CARGO DE') + '.\n' +
'Autoriza publicación: ' + F(d, 'autorizPublicacion', 'SÍ/NO') + '.   Autoriza fotos/videos: ' + F(d, 'autorizFotos', 'SÍ/NO') + '.\n' +
'Condiciones aceptables: ' + F(d, 'condiciones', 'CONDICIONES') + '.\n\n' +
'Sujeta a la acreditación de titularidad y a la normativa aplicable a la intermediación.\n\n' +
'Titular ____________________'); },
      checklist: ['Acreditación de titularidad + DNI', 'Carácter del firmante', 'Comisión % y a cargo de quién', 'Matrícula del operador (si corresponde)', 'Autorización de publicación/fotos', 'Exclusividad y vigencia'],
      anexos: ['Copia de título / dominio', 'Fotos del inmueble'] },

    { id: 'recibo-reserva-venta', grupo: 'Venta', titulo: 'Recibo de reserva (venta)',
      uso: 'Recibo específico de la reserva de compra. Honorarios opcional.',
      campos: [ C_OP, { k: 'recibiDe', label: 'Recibí de (comprador)', req: true }, { k: 'compradorDni', label: 'DNI/CUIT del comprador' },
        { k: 'recibeDni', label: 'DNI/CUIT de quien recibe' }, { k: 'nroRecibo', label: 'Nº de recibo / referencia' },
        { k: 'concepto', label: 'Concepto', ph: 'reserva de compra' }, { k: 'inmueble', label: 'Inmueble', req: true },
        C_MON, { k: 'monto', label: 'Monto', req: true }, { k: 'imputacion', label: 'Se imputa a', ph: 'seña / precio' },
        { k: 'medioPago', label: 'Medio de pago', ph: 'efectivo / transferencia' },
        { k: 'honorarios', label: 'Honorarios / comisión' }, { k: 'observaciones', label: 'Observaciones', type: 'textarea' }, C_FECHA ],
      cuerpo: function (d) { return (
'RECIBO DE RESERVA DE COMPRA  Nº ' + F(d, 'nroRecibo', 'Nº/REF') + '\n\n' +
'Fecha: ' + F(d, 'fecha', 'FECHA') + '.   ' + opLine(d) + '\n\n' +
'Recibí de ' + parte(d, 'recibiDe', 'compradorDni', 'COMPRADOR') + ' la suma de ' + money(d, 'monto', 'MONTO') + '\n' +
'en concepto de ' + F(d, 'concepto', 'RESERVA DE COMPRA') + ' del inmueble ' + F(d, 'inmueble', 'INMUEBLE') + ',\n' +
'a imputarse a ' + F(d, 'imputacion', 'SEÑA/PRECIO') + ', ad referéndum de la aceptación del vendedor.\n' +
'Medio de pago: ' + F(d, 'medioPago', 'MEDIO') + '.   Honorarios / comisión: ' + F(d, 'honorarios', 'HONORARIOS') + '.\n' +
'Observaciones: ' + F(d, 'observaciones', 'OBSERVACIONES') + '.\n\n' +
'Recibí conforme (operador, DNI/CUIT ' + F(d, 'recibeDni', 'DNI/CUIT') + ') ____________________'); },
      checklist: ['Identidad y DNI del comprador', 'Medio de pago y nº de recibo', 'Imputación clara', 'Sujeción a aceptación del vendedor', 'Comprobante de pago'],
      anexos: ['Comprobante de pago'] },

    { id: 'checklist-boleto', grupo: 'Venta', titulo: 'Checklist boleto / cesión / escritura',
      uso: 'CHECKLIST de documentos y pasos (no es contrato).',
      campos: [ { k: 'inmueble', label: 'Inmueble' }, { k: 'partes', label: 'Partes' }, { k: 'escribania', label: 'Escribanía interviniente' },
        { k: 'ocupacion', label: 'Estado de ocupación', type: 'select', opts: ['libre', 'ocupado', 'alquilado', 'con ocupantes'] } ],
      cuerpo: function (d) { return (
'CHECKLIST — BOLETO / CESIÓN / ESCRITURA  (preparación de información, NO es un contrato)\n\n' +
'Inmueble: ' + F(d, 'inmueble', 'INMUEBLE') + '.   Partes: ' + F(d, 'partes', 'PARTES') + '.\n' +
'Escribanía interviniente: ' + F(d, 'escribania', 'ESCRIBANÍA') + '.   Ocupación: ' + F(d, 'ocupacion', 'LIBRE/OCUPADO/ALQUILADO') + '.\n\n' +
'TÍTULO Y DOMINIO\n  [ ] Título de propiedad / antecedentes\n  [ ] Informe de dominio actualizado\n  [ ] Hipotecas\n  [ ] Embargos\n  [ ] Inhibiciones de los vendedores\n  [ ] Certificado catastral (si corresponde)\n  [ ] Planos / mensura (si corresponde)\n' +
'DEUDAS Y SERVICIOS\n  [ ] Libre deuda ABL / impuesto inmobiliario / tasas\n  [ ] Libre deuda de expensas (si PH) + reglamento\n  [ ] Libre deuda AySA (si corresponde)\n  [ ] Servicios (gas, luz, agua) al día\n' +
'PARTES\n  [ ] DNI/CUIT comprador y vendedor\n  [ ] Estado civil / cónyuge / asentimiento conyugal\n  [ ] Documentación de representación / poder (si apoderado)\n' +
'OPERACIÓN\n  [ ] Reserva / seña instrumentada\n  [ ] Forma y moneda de pago acordada\n  [ ] Fecha de posesión y entrega de llaves\n  [ ] Fecha de escritura\n  [ ] Distribución de gastos e impuestos de la operación\n' +
'PROFESIONALES\n  [ ] Escribanía designada (datos)\n  [ ] Asesoramiento legal de las partes\n\n' +
'Este checklist sirve para reunir la información para el/la profesional. NO sustituye el boleto/escritura.'); },
      checklist: ['Título, dominio, hipotecas, embargos, inhibiciones', 'Ocupación del inmueble', 'Libre deuda ABL/expensas/AySA', 'Asentimiento conyugal / poderes', 'Escribanía designada'],
      anexos: ['Carpeta de documentación de la operación'] },

    { id: 'boleto-esqueleto', grupo: 'Venta', titulo: 'Borrador base de boleto / cesión (esqueleto)',
      uso: 'ESTRUCTURA con secciones y placeholders. NO es un boleto válido.',
      campos: [ { k: 'inmueble', label: 'Inmueble' }, { k: 'vendedor', label: 'Vendedor' }, { k: 'vendedorDni', label: 'DNI/CUIT vendedor' },
        { k: 'comprador', label: 'Comprador' }, { k: 'compradorDni', label: 'DNI/CUIT comprador' },
        C_MON, { k: 'precio', label: 'Precio' }, { k: 'escribania', label: 'Escribanía' } ],
      cuerpo: function (d) { return (
'BORRADOR BASE — BOLETO / CESIÓN  (ESQUELETO · estructura para escribanía/abogado)\n' +
'>> ESTE DOCUMENTO NO ES UN BOLETO NI UNA CESIÓN VÁLIDA. ES UNA GUÍA OPERATIVA PARA\n' +
'>> PREPARAR INFORMACIÓN PARA ABOGADO / ESCRIBANÍA / GESTOR. No firmar como está.\n' +
'>> El instrumento definitivo lo redacta y valida el/la profesional interviniente.\n\n' +
'1. PARTES — Vendedor: ' + parte(d, 'vendedor', 'vendedorDni', 'VENDEDOR') + ' · Comprador: ' +
   parte(d, 'comprador', 'compradorDni', 'COMPRADOR') + '.\n   [estado civil / cónyuge / personería — a completar y acreditar]\n' +
'2. DECLARACIONES DEL VENDEDOR — [titularidad, libre disposición, inexistencia de litigios — a verificar]\n' +
'3. INMUEBLE — ' + F(d, 'inmueble', 'INMUEBLE') + '. [nomenclatura, superficie, antecedentes de dominio]\n' +
'4. ESTADO JURÍDICO DEL INMUEBLE — [dominio, reglamento PH, ocupación — a verificar]\n' +
'5. GRAVÁMENES / DEUDAS — [hipotecas, embargos, inhibiciones, expensas, ABL — a verificar]\n' +
'6. PRECIO Y FORMA DE PAGO — ' + money(d, 'precio', 'PRECIO') + '. [seña, saldo, moneda, lugar y fecha de pago]\n' +
'7. POSESIÓN — [momento y condiciones de la entrega de la posesión]\n' +
'8. PLAZOS / DOCUMENTACIÓN PENDIENTE — [plazo a escritura, condiciones suspensivas, docs a acompañar]\n' +
'9. DOMICILIOS Y NOTIFICACIONES — [domicilios especiales de las partes]\n' +
'10. ESCRIBANÍA / INTERVINIENTES — Escribanía: ' + F(d, 'escribania', 'ESCRIBANÍA') + '. [designación, gastos]\n' +
'11. GASTOS E IMPUESTOS — [distribución entre partes, sellos, honorarios]\n' +
'12. ANEXOS — [documentación de la operación]\n' +
'13. FIRMAS — [se instrumenta con el/la profesional interviniente]\n\n' +
'Completar cada sección con asesoramiento. Verificar normativa vigente aplicable.'); },
      checklist: ['Personería y estado civil acreditados', 'Declaraciones y estado jurídico verificados', 'Gravámenes/deudas relevados', 'Forma de pago y posesión definidas', 'Escribanía designada', 'Revisión profesional OBLIGATORIA'],
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
      campos: [ C_OP, { k: 'entrega', label: 'Entrega (nombre)', req: true }, { k: 'entregaDni', label: 'DNI/CUIT de quien entrega' },
        { k: 'recibe', label: 'Recibe (nombre)', req: true }, { k: 'recibeDni', label: 'DNI/CUIT de quien recibe' },
        { k: 'detalle', label: 'Documentación', type: 'textarea', req: true, ph: 'listado de documentos' }, C_FECHA ],
      cuerpo: function (d) { return (
'ACTA DE ENTREGA / RECEPCIÓN DE DOCUMENTACIÓN\n\n' +
'En ' + F(d, 'fecha', 'FECHA') + '.   ' + opLine(d) + '\n\n' +
parte(d, 'entrega', 'entregaDni', 'QUIEN ENTREGA') + ' entrega a ' + parte(d, 'recibe', 'recibeDni', 'QUIEN RECIBE') + '\n' +
'la siguiente documentación:\n' +
F(d, 'detalle', 'LISTADO DE DOCUMENTOS') + '\n\n' +
'Quien recibe declara recibirla de conformidad, sin que ello implique validación de su contenido.\n\n' +
'Entrega ____________________      Recibe ____________________'); },
      checklist: ['DNI de ambas partes', 'Detalle de documentos listado', 'Copias/originales aclarado', 'Firma de ambas partes'],
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
