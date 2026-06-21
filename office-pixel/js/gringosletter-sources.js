/* Gringosletter — Source Registry (Fase 0A · Mapa de Fuentes + Estrategia de Extracción)
 * ──────────────────────────────────────────────────────────────────────────────────────
 * SOLO MAPA Y DIAGNÓSTICO. No captura, no scraping de notas, no cuerpos completos.
 * La captura (titulares + links, sin cuerpo) es Fase 0B (backend wispy_bridge como proxy).
 *
 * Diagnóstico read-only (robots.txt + sección) hecho el 2026-06-21. `verificado:true` = chequeado
 * en vivo esa fecha; `verificado:false` = documentado del mapa, a confirmar en 0B. NUNCA inventamos
 * URLs de sitemap/RSS: solo las vistas literalmente.
 *
 * Campos por fuente:
 *   id, nombre, tipo (medio|dato_duro|analista|newsletter|social|interno),
 *   prioridad (alta|media-alta|media|baja), urlBase, seccionUrl,
 *   metodo (rss|news_sitemap|google_news_feed|sitemap|section_scrape|api|pdf|email|manual),
 *   nivel (1..4), feeds[{tipo,url}], frecuencia, temas[], zonas[],
 *   confiabilidad (1-5), dificultadTecnica (1-5), riesgoLegal (bajo|medio|medio-alto|alto),
 *   permiteCuerpoCompleto, requiereRevisionManual, httpStatus, paywall (no|parcial|si|desconocido|n/a),
 *   verificado, grupoOperativo (viable|cuidado|dato_duro|editorial|futura),
 *   captura0B (titulares|indicadores|manual|no), estado (activo|revisar|manual|bloqueado),
 *   ultimaRevision (YYYY-MM-DD), proximaAccion, notas
 *
 * Niveles de extracción: 1 sitemap/RSS/feed · 2 sección HTML · 3 nota individual · 4 manual/API/PDF/email.
 * Legal: de MEDIOS solo título·fuente·link·fecha·RESUMEN PROPIO·números·"por qué importa". Nunca cuerpo completo.
 */
window.GL_SOURCES = [

  /* ═══════════ MEDIOS PERIODÍSTICOS ═══════════ */
  {
    id: 'cronista_realestate', nombre: 'El Cronista — Real Estate', tipo: 'medio', prioridad: 'alta',
    urlBase: 'https://www.cronista.com', seccionUrl: 'https://www.cronista.com/tema/real-estate/',
    metodo: 'google_news_feed', nivel: 1,
    feeds: [
      { tipo: 'google_news', url: 'https://www.cronista.com/arc/outboundfeeds/google-news-feed/' },
      { tipo: 'news_sitemap', url: 'https://www.cronista.com/arc/outboundfeeds/sitemap-news-index/?outputType=xml' },
      { tipo: 'section_index', url: 'https://www.cronista.com/arc/outboundfeeds/sitemap-section-index/?outputType=xml' }
    ],
    frecuencia: 'diaria', temas: ['negocios', 'desarrollos', 'inversión', 'oficinas', 'fondos'],
    zonas: ['CABA', 'AMBA'], confiabilidad: 4, dificultadTecnica: 2,
    permiteCuerpoCompleto: false, requiereRevisionManual: true, riesgoLegal: 'medio',
    httpStatus: '200', paywall: 'parcial', verificado: true,
    grupoOperativo: 'viable', captura0B: 'titulares', estado: 'activo', ultimaRevision: '2026-06-21',
    proximaAccion: '0B: usar google-news-feed (RSS-like) como PRIMER extractor de titulares; filtrar por tema/zona.',
    notas: 'Mejor candidato técnico: feed Google News + news-sitemap-index ARC. Listado muy scrapeable.'
  },
  {
    id: 'iprofesional_realestate', nombre: 'iProfesional — Real Estate', tipo: 'medio', prioridad: 'alta',
    urlBase: 'https://www.iprofesional.com', seccionUrl: 'https://www.iprofesional.com/real-estate',
    metodo: 'news_sitemap', nivel: 1,
    feeds: [
      { tipo: 'news_sitemap', url: 'https://www.iprofesional.com/sitemap-news.economia.xml' },
      { tipo: 'news_sitemap', url: 'https://www.iprofesional.com/sitemap-news.negocios.xml' },
      { tipo: 'news_sitemap', url: 'https://www.iprofesional.com/sitemap-news.finanzas.xml' },
      { tipo: 'sitemap', url: 'https://www.iprofesional.com/sitemap-index.xml' }
    ],
    frecuencia: 'diaria', temas: ['mercado', 'alquileres', 'inversión', 'construcción', 'legales', 'proptech'],
    zonas: ['CABA', 'AMBA'], confiabilidad: 3, dificultadTecnica: 2,
    permiteCuerpoCompleto: false, requiereRevisionManual: true, riesgoLegal: 'medio',
    httpStatus: '200', paywall: 'no', verificado: true,
    grupoOperativo: 'viable', captura0B: 'titulares', estado: 'activo', ultimaRevision: '2026-06-21',
    proximaAccion: '0B: leer news-sitemaps por vertical (economia/negocios/finanzas), filtrar real estate.',
    notas: 'News-sitemaps por vertical (no hay vertical real-estate propio; cae en economia/negocios). Sin paywall.'
  },
  {
    id: 'ambito_realestate', nombre: 'Ámbito — Real Estate', tipo: 'medio', prioridad: 'alta',
    urlBase: 'https://www.ambito.com', seccionUrl: 'https://www.ambito.com/contenidos/real-estate.html',
    metodo: 'news_sitemap', nivel: 1,
    feeds: [
      { tipo: 'news_sitemap', url: 'https://www.ambito.com/sitemap-news.xml' },
      { tipo: 'sitemap', url: 'https://www.ambito.com/sitemap.xml' }
    ],
    frecuencia: 'diaria', temas: ['mercado', 'impuestos', 'precios', 'alquileres', 'construcción'],
    zonas: ['CABA', 'AMBA'], confiabilidad: 4, dificultadTecnica: 2,
    permiteCuerpoCompleto: false, requiereRevisionManual: true, riesgoLegal: 'medio',
    httpStatus: '200', paywall: 'no', verificado: true,
    grupoOperativo: 'viable', captura0B: 'titulares', estado: 'activo', ultimaRevision: '2026-06-21',
    proximaAccion: '0B: sitemap-news + sección Real Estate / tag mercado-inmobiliario.',
    notas: 'Buena coyuntura inmobiliaria. sitemap-news confirmado.'
  },
  {
    id: 'infobae_realestate', nombre: 'Infobae — Economía / Real Estate', tipo: 'medio', prioridad: 'alta',
    urlBase: 'https://www.infobae.com', seccionUrl: 'https://www.infobae.com/economia/',
    metodo: 'news_sitemap', nivel: 1,
    feeds: [
      { tipo: 'news_sitemap', url: 'https://www.infobae.com/arc/outboundfeeds/news-sitemap2/' },
      { tipo: 'sitemap', url: 'https://www.infobae.com/arc/outboundfeeds/sitemap2/' }
    ],
    frecuencia: 'diaria', temas: ['mercado', 'alquileres', 'crédito', 'desarrollos', 'opinión'],
    zonas: ['CABA', 'AMBA'], confiabilidad: 4, dificultadTecnica: 3,
    permiteCuerpoCompleto: false, requiereRevisionManual: true, riesgoLegal: 'medio-alto',
    httpStatus: '200', paywall: 'no', verificado: true,
    grupoOperativo: 'viable', captura0B: 'titulares', estado: 'activo', ultimaRevision: '2026-06-21',
    proximaAccion: '0B: news-sitemap2 + filtrar FUERTE por AR/economía/real-estate (mezcla mucho internacional).',
    notas: 'ARC outboundfeeds. Disallow /buscador. Mezcla AR con internacional → score/keyword filter obligatorio.'
  },
  {
    id: 'lanacion_propiedades', nombre: 'La Nación — Propiedades', tipo: 'medio', prioridad: 'alta',
    urlBase: 'https://www.lanacion.com.ar', seccionUrl: 'https://www.lanacion.com.ar/propiedades/',
    metodo: 'news_sitemap', nivel: 1,
    feeds: [
      { tipo: 'news_sitemap', url: 'https://www.lanacion.com.ar/sitemap-news.xml' },
      { tipo: 'section_index', url: 'https://www.lanacion.com.ar/sitemap-section-index.xml' },
      { tipo: 'sitemap', url: 'https://www.lanacion.com.ar/sitemap-index.xml' }
    ],
    frecuencia: 'diaria', temas: ['propiedades', 'compraventa', 'alquileres', 'barrios', 'desarrollos'],
    zonas: ['CABA', 'AMBA', 'Recoleta', 'Palermo', 'Belgrano', 'Núñez', 'Colegiales'],
    confiabilidad: 4, dificultadTecnica: 2,
    permiteCuerpoCompleto: false, requiereRevisionManual: true, riesgoLegal: 'alto',
    httpStatus: '200', paywall: 'parcial', verificado: true,
    grupoOperativo: 'cuidado', captura0B: 'titulares', estado: 'revisar', ultimaRevision: '2026-06-21',
    proximaAccion: '0B: sitemap-news / section-index → filtrar /propiedades/. Solo título+URL+fecha+snippet.',
    notas: 'Muy valiosa pero paywall medido + copyright fuerte. /propiedades NO disallow. Cuidar republicación.'
  },
  {
    id: 'clarin_arq', nombre: 'Clarín — ARQ / Inmobiliario', tipo: 'medio', prioridad: 'media-alta',
    urlBase: 'https://www.clarin.com', seccionUrl: 'https://www.clarin.com/arq/inmobiliario/',
    metodo: 'manual', nivel: 4, feeds: [],
    frecuencia: 'semanal', temas: ['arquitectura', 'construcción', 'desarrollos', 'mercado'],
    zonas: ['CABA', 'AMBA'], confiabilidad: 4, dificultadTecnica: 5,
    permiteCuerpoCompleto: false, requiereRevisionManual: true, riesgoLegal: 'alto',
    httpStatus: 'bloqueado', paywall: 'si', verificado: true,
    grupoOperativo: 'cuidado', captura0B: 'manual', estado: 'bloqueado', ultimaRevision: '2026-06-21',
    proximaAccion: 'Tratar MANUAL: buscador/cards visibles; NO extractor automático de cuerpo.',
    notas: 'Fetch bloqueado (anti-bot / 402 Payment Required). Valiosa pero no es primer extractor automático.'
  },

  /* ═══════════ FUENTES DE DATOS DURAS ═══════════ */
  {
    id: 'bcra_series', nombre: 'BCRA — Principales Variables (UVA/CER/ICL/tasas)', tipo: 'dato_duro', prioridad: 'alta',
    urlBase: 'https://www.bcra.gob.ar', seccionUrl: 'https://www.bcra.gob.ar/PublicacionesEstadisticas/Principales_variables.asp',
    metodo: 'api', nivel: 4,
    feeds: [{ tipo: 'html_serie', url: 'https://www.bcra.gob.ar/PublicacionesEstadisticas/Principales_variables.asp' }],
    frecuencia: 'diaria', temas: ['UVA', 'CER', 'ICL', 'tasas', 'reservas', 'dólar'],
    zonas: ['Argentina'], confiabilidad: 5, dificultadTecnica: 2,
    permiteCuerpoCompleto: true, requiereRevisionManual: false, riesgoLegal: 'bajo',
    httpStatus: '200', paywall: 'no', verificado: true,
    grupoOperativo: 'dato_duro', captura0B: 'indicadores', estado: 'activo', ultimaRevision: '2026-06-21',
    proximaAccion: '0B: leer UVA/CER/ICL/tasas de Principales Variables; evaluar API/serie XLS (menciona SDDS-FMI).',
    notas: 'Dato oficial. Página estructurada por variable. Datos abiertos / serie descargable a confirmar.'
  },
  {
    id: 'estadistica_ciudad', nombre: 'Estadística Ciudad GCBA — Mercado Inmobiliario', tipo: 'dato_duro', prioridad: 'alta',
    urlBase: 'https://www.estadisticaciudad.gob.ar', seccionUrl: 'https://www.estadisticaciudad.gob.ar/eyc/?cat=377',
    metodo: 'manual', nivel: 4, feeds: [],
    frecuencia: 'mensual', temas: ['alquileres', 'escrituras', 'precio publicación', 'actos notariales'],
    zonas: ['CABA'], confiabilidad: 5, dificultadTecnica: 2,
    permiteCuerpoCompleto: true, requiereRevisionManual: true, riesgoLegal: 'bajo',
    httpStatus: 'sin-verificar', paywall: 'no', verificado: false,
    grupoOperativo: 'dato_duro', captura0B: 'indicadores', estado: 'revisar', ultimaRevision: '2026-06-21',
    proximaAccion: '0B: categoría Mercado Inmobiliario (alquileres x ambiente/barrio, índice precio publicación, actos notariales).',
    notas: 'Datos estructurados oficiales CABA. Candidata ideal para indicadores duros. Verificar acceso/URL en 0B.'
  },
  {
    id: 'escribanos_caba', nombre: 'Colegio de Escribanos CABA — Escrituras/Hipotecas', tipo: 'dato_duro', prioridad: 'alta',
    urlBase: 'https://www.colegio-escribanos.org.ar', seccionUrl: 'https://www.colegio-escribanos.org.ar/',
    metodo: 'pdf', nivel: 4, feeds: [],
    frecuencia: 'mensual', temas: ['escrituras', 'hipotecas', 'volumen operaciones'],
    zonas: ['CABA'], confiabilidad: 5, dificultadTecnica: 3,
    permiteCuerpoCompleto: true, requiereRevisionManual: true, riesgoLegal: 'bajo',
    httpStatus: 'sin-verificar', paywall: 'no', verificado: false,
    grupoOperativo: 'dato_duro', captura0B: 'indicadores', estado: 'revisar', ultimaRevision: '2026-06-21',
    proximaAccion: '0B: ubicar comunicado/estadística mensual de escrituras + hipotecas CABA (HTML/PDF).',
    notas: 'Fuente oficial de escrituras e hipotecas. Suele publicar comunicado mensual (PDF).'
  },
  {
    id: 'indec_icc', nombre: 'INDEC — Índice Costo de la Construcción (ICC GBA)', tipo: 'dato_duro', prioridad: 'media-alta',
    urlBase: 'https://www.indec.gob.ar', seccionUrl: 'https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-5-32',
    metodo: 'pdf', nivel: 4, feeds: [],
    frecuencia: 'mensual', temas: ['costo construcción', 'm²', 'insumos'],
    zonas: ['GBA'], confiabilidad: 5, dificultadTecnica: 2,
    permiteCuerpoCompleto: true, requiereRevisionManual: true, riesgoLegal: 'bajo',
    httpStatus: 'sin-verificar', paywall: 'no', verificado: false,
    grupoOperativo: 'dato_duro', captura0B: 'indicadores', estado: 'revisar', ultimaRevision: '2026-06-21',
    proximaAccion: '0B: ICC GBA mensual (PDF / serie). Ej. referencia: mayo 2026 +2,7% mensual.',
    notas: 'Dato oficial de costo de construcción. PDF mensual + series.'
  },
  {
    id: 'zonaprop_index', nombre: 'Zonaprop — Index / Blog', tipo: 'dato_duro', prioridad: 'alta',
    urlBase: 'https://www.zonaprop.com.ar', seccionUrl: 'https://www.zonaprop.com.ar/noticias/',
    metodo: 'sitemap', nivel: 4,
    feeds: [{ tipo: 'sitemap', url: 'https://www.zonaprop.com.ar/blog/sitemap_index.xml' }],
    frecuencia: 'mensual', temas: ['precio m²', 'alquileres', 'rentabilidad', 'barrios'],
    zonas: ['CABA', 'AMBA'], confiabilidad: 4, dificultadTecnica: 3,
    permiteCuerpoCompleto: false, requiereRevisionManual: true, riesgoLegal: 'medio',
    httpStatus: '200', paywall: 'no', verificado: true,
    grupoOperativo: 'dato_duro', captura0B: 'indicadores', estado: 'activo', ultimaRevision: '2026-06-21',
    proximaAccion: '0B: blog sitemap → descubrir reportes Zonaprop Index (precio m²/rentabilidad). Dato vive en posts/PDF.',
    notas: 'El Index (USD/m², variaciones) se publica en posts/reportes → parte manual. Privado (cuidar uso).'
  },
  {
    id: 'ml_udesa', nombre: 'Mercado Libre – UdeSA — Índice de Precios Inmobiliarios', tipo: 'dato_duro', prioridad: 'media-alta',
    urlBase: 'https://www.udesa.edu.ar', seccionUrl: 'https://www.udesa.edu.ar/centros-e-institutos',
    metodo: 'pdf', nivel: 4, feeds: [],
    frecuencia: 'mensual', temas: ['precio m²', 'índice inmobiliario', 'venta', 'alquiler'],
    zonas: ['CABA', 'AMBA', 'Argentina'], confiabilidad: 4, dificultadTecnica: 3,
    permiteCuerpoCompleto: true, requiereRevisionManual: true, riesgoLegal: 'bajo',
    httpStatus: 'sin-verificar', paywall: 'no', verificado: false,
    grupoOperativo: 'dato_duro', captura0B: 'indicadores', estado: 'revisar', ultimaRevision: '2026-06-21',
    proximaAccion: '0B: ubicar URL pública exacta del índice mensual ML–UdeSA (informe/PDF) y confirmar reuso.',
    notas: 'Índice mensual de precios inmobiliarios (ML + Universidad de San Andrés). URL exacta a confirmar.'
  },

  /* ═══════════ REFERENTES / ANALISTAS / OPINIÓN ═══════════ */
  {
    id: 'reporte_inmobiliario', nombre: 'Reporte Inmobiliario', tipo: 'analista', prioridad: 'alta',
    urlBase: 'https://www.reporteinmobiliario.com', seccionUrl: 'https://www.reporteinmobiliario.com/',
    metodo: 'email', nivel: 4, feeds: [],
    frecuencia: 'semanal', temas: ['índices', 'oferta', 'usados', 'oficinas', 'terrenos', 'market analytics'],
    zonas: ['CABA', 'AMBA'], confiabilidad: 5, dificultadTecnica: 4,
    permiteCuerpoCompleto: false, requiereRevisionManual: true, riesgoLegal: 'medio',
    httpStatus: 'sin-verificar', paywall: 'parcial', verificado: false,
    grupoOperativo: 'editorial', captura0B: 'manual', estado: 'revisar', ultimaRevision: '2026-06-21',
    proximaAccion: '0B: suscribir newsletter semanal a casilla Wispy (email); separar público scrapeable de membresía.',
    notas: 'Índices + market analytics + newsletter semanal. Algunas herramientas son para miembros.'
  },
  {
    id: 'monitor_bryn', nombre: 'Monitor Inmobiliario / Daniel Bryn', tipo: 'analista', prioridad: 'media-alta',
    urlBase: 'https://www.monitorinmobiliario.com', seccionUrl: 'https://www.monitorinmobiliario.com/',
    metodo: 'manual', nivel: 4, feeds: [],
    frecuencia: 'semanal', temas: ['estadísticas porteñas', 'precios', 'oferta', 'análisis por barrio'],
    zonas: ['CABA'], confiabilidad: 4, dificultadTecnica: 4,
    permiteCuerpoCompleto: false, requiereRevisionManual: true, riesgoLegal: 'medio',
    httpStatus: 'sin-verificar', paywall: 'no', verificado: false,
    grupoOperativo: 'editorial', captura0B: 'manual', estado: 'revisar', ultimaRevision: '2026-06-21',
    proximaAccion: '0B: capturar estadísticas por barrio; seguir a D. Bryn (X/LinkedIn) como fuente estratégica.',
    notas: 'Mirada estratégica + datos de oferta/precios del mercado porteño.'
  },
  {
    id: 'magnin_social', nombre: 'Santiago Magnin (social/opinión)', tipo: 'social', prioridad: 'media',
    urlBase: 'https://www.linkedin.com', seccionUrl: 'https://www.linkedin.com/in/santiagomagnin/',
    metodo: 'manual', nivel: 4, feeds: [],
    frecuencia: 'semanal', temas: ['operatoria', 'cultura inmobiliaria', 'mirada estratégica'],
    zonas: ['CABA', 'AMBA'], confiabilidad: 3, dificultadTecnica: 4,
    permiteCuerpoCompleto: false, requiereRevisionManual: true, riesgoLegal: 'medio',
    httpStatus: 'sin-verificar', paywall: 'no', verificado: false,
    grupoOperativo: 'editorial', captura0B: 'manual', estado: 'manual', ultimaRevision: '2026-06-21',
    proximaAccion: 'Manual: seguir como fuente de mirada estratégica/operatoria, no de dato duro.',
    notas: 'Opinión/cultura, no estadística. LinkedIn/X requieren tratamiento manual.'
  },
  {
    id: 'deinmobiliarios', nombre: 'deinmobiliarios (comunidad/contenido)', tipo: 'social', prioridad: 'media',
    urlBase: 'https://deinmobiliarios.com', seccionUrl: 'https://deinmobiliarios.com/',
    metodo: 'manual', nivel: 4, feeds: [],
    frecuencia: 'semanal', temas: ['operatoria', 'proptech', 'cultura inmobiliaria', 'tendencias'],
    zonas: ['Argentina'], confiabilidad: 3, dificultadTecnica: 4,
    permiteCuerpoCompleto: false, requiereRevisionManual: true, riesgoLegal: 'medio',
    httpStatus: 'sin-verificar', paywall: 'no', verificado: false,
    grupoOperativo: 'editorial', captura0B: 'manual', estado: 'revisar', ultimaRevision: '2026-06-21',
    proximaAccion: '0B: confirmar formato (web/newsletter/social) y si hay RSS/feed; tratar como referencia editorial.',
    notas: 'Comunidad/contenido del sector. Mirada de operatoria y tendencias, no dato duro.'
  },
  {
    id: 'camaras_inmobiliarias', nombre: 'Cámaras inmobiliarias (CUCICBA / CIA)', tipo: 'analista', prioridad: 'media-alta',
    urlBase: 'https://www.colegioinmobiliario.org.ar', seccionUrl: 'https://www.colegioinmobiliario.org.ar/',
    metodo: 'manual', nivel: 4, feeds: [],
    frecuencia: 'mensual', temas: ['compraventa CABA', 'relevamientos', 'índices del sector'],
    zonas: ['CABA', 'AMBA'], confiabilidad: 4, dificultadTecnica: 3,
    permiteCuerpoCompleto: true, requiereRevisionManual: true, riesgoLegal: 'bajo',
    httpStatus: 'sin-verificar', paywall: 'no', verificado: false,
    grupoOperativo: 'dato_duro', captura0B: 'indicadores', estado: 'revisar', ultimaRevision: '2026-06-21',
    proximaAccion: '0B: ubicar informe mensual de compraventa CUCICBA + relevamientos de la CIA (HTML/PDF).',
    notas: 'CUCICBA (Colegio Único de Corredores CABA) publica relevamiento mensual de compraventa. Útil como dato.'
  },

  /* ═══════════ FUENTES INTERNAS (futuras — circuito propio) ═══════════ */
  {
    id: 'fuentes_internas', nombre: 'Fuentes internas Gringo (CRM/Tasaciones/Operaciones)', tipo: 'interno', prioridad: 'alta',
    urlBase: '', seccionUrl: '',
    metodo: 'manual', nivel: 4, feeds: [],
    frecuencia: 'continua',
    temas: ['precio publicado vs cierre', 'objeciones', 'contraofertas', 'cierres reales', 'tasaciones', 'props sobrepreciadas', 'leads'],
    zonas: ['CABA', 'AMBA'], confiabilidad: 5, dificultadTecnica: 1,
    permiteCuerpoCompleto: true, requiereRevisionManual: false, riesgoLegal: 'bajo',
    httpStatus: 'n/a', paywall: 'n/a', verificado: false,
    grupoOperativo: 'futura', captura0B: 'no', estado: 'revisar', ultimaRevision: '2026-06-21',
    proximaAccion: '0C/0D: alimentar insights desde Gringo CRM / Tasaciones (datos propios = diferenciación). Circuito aparte.',
    notas: 'El activo más diferencial: precio publicado propio vs cierre, objeciones, contraofertas, props que no se venden, leads.'
  }
];

/* Config de scoring de relevancia para Gringo Estate (esqueleto para Fase 0B/0C — NO se ejecuta en 0A).
 * Una pieza capturada sumará/restará según menciones. Umbral y matching se definen en 0B. */
window.GL_SCORING = {
  suma: [
    { pts: 5, keywords: ['CABA', 'AMBA'] },
    { pts: 4, keywords: ['precio/m²', 'm2', 'm²', 'escrituras', 'hipotecas', 'alquileres'] },
    { pts: 3, keywords: ['Recoleta', 'Palermo', 'Belgrano', 'Núñez', 'Colegiales', 'Chacarita', 'Barrio Norte'] },
    { pts: 3, keywords: ['crédito hipotecario', 'UVA'] },
    { pts: 2, keywords: ['compraventa', 'oficinas', 'construcción', 'rentabilidad', 'captación', 'tasaciones'] },
    { pts: 2, keywords: ['__fuente_prioritaria__'] }
  ],
  resta: [
    { pts: -4, keywords: ['internacional sin impacto local'] },
    { pts: -3, keywords: ['mansiones', 'lifestyle', 'celebrity', 'famosos'] },
    { pts: -3, keywords: ['branded content', 'publicidad', 'publinota'] },
    { pts: -2, keywords: ['__sin_datos__'] }
  ],
  notas: 'Umbral sugerido para "Relevante": >= 6. Matching (substring/entidades) y normalización se definen en 0B.'
};
