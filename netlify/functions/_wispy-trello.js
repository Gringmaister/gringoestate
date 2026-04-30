const fs = require('fs');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const trelloRoot = path.join(workspaceRoot, 'trello');
const envFile = path.join(process.env.HOME || '', 'gringo-ai', '.env');
const discoveredIdsPath = path.join(trelloRoot, 'discovered_ids.json');

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readDotEnv(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const env = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...rest] = trimmed.split('=');
      env[key.trim()] = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
    }
    return env;
  } catch {
    return {};
  }
}

function getEnv(name, dotenv = {}) {
  return process.env[name] || dotenv[name] || '';
}

function startOfTodayIso() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return start.toISOString();
}

function endOfTodayIso() {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return end.toISOString();
}

function summarizeCards(name, cards = []) {
  const pending = cards.filter((card) => !card.closed).length;
  const todayStart = startOfTodayIso();
  const todayEnd = endOfTodayIso();
  const today = cards.filter((card) => card.due && !card.dueComplete && card.due >= todayStart && card.due < todayEnd).length;
  const blocked = cards.filter((card) => (card.labels || []).some((label) => /block|espera|hold/i.test(label.name || ''))).length;
  return { name, pending, today, blocked };
}

async function trelloFetch(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Trello HTTP ${response.status}${text ? ` · ${text.slice(0, 120)}` : ''}`);
  }
  return await response.json();
}

const WISPY_BOARD_ID = '69efaaa0c87c7dc98b43653e';

function getSelectedBoards(discovered) {
  const boards = discovered?.boards || {};
  return [
    { key: 'gringoestate_personal', name: 'PERSONAL' },
    { key: 'ambbi', name: 'AMBBI' },
    { key: 'mantenimiento_workflow', name: 'MANTENIMIENTO' },
    { key: 'gringo_pms_product', name: 'GRINGO PMS' }
  ].filter((item) => boards[item.key]?.id).map((item) => ({ ...item, id: boards[item.key].id }));
}

async function getTrelloBoardsSnapshot() {
  const dotenv = readDotEnv(envFile);
  const key = getEnv('TRELLO_API_KEY', dotenv);
  const token = getEnv('TRELLO_TOKEN', dotenv);
  if (!key || !token) return null;

  const discovered = readJson(discoveredIdsPath, {});
  const selected = getSelectedBoards(discovered);

  const baseParams = new URLSearchParams({
    key,
    token,
    cards: 'open',
    card_fields: 'name,due,dueComplete,labels,closed,idList',
    lists: 'none',
    fields: 'name'
  }).toString();

  const snapshots = [];
  for (const board of selected) {
    const data = await trelloFetch(`https://api.trello.com/1/boards/${board.id}?${baseParams}`);
    snapshots.push(summarizeCards(board.name, data.cards || []));
  }

  snapshots.push({ name: 'WISPY', pending: 4, today: 2, blocked: 0, synthetic: true });
  return snapshots;
}

async function createTrelloCard({ area = 'inbox', title, desc = '', dryRun = false }) {
  const dotenv = readDotEnv(envFile);
  const key = getEnv('TRELLO_API_KEY', dotenv);
  const token = getEnv('TRELLO_TOKEN', dotenv);
  if (!key || !token) throw new Error('Trello credentials missing');

  const listMap = {
    inbox: getEnv('TRELLO_LIST_INBOX', dotenv),
    maintenance: getEnv('TRELLO_LIST_MAINTENANCE', dotenv),
    admin: getEnv('TRELLO_LIST_ADMIN', dotenv)
  };
  const idList = listMap[area] || listMap.inbox;
  if (!idList) throw new Error(`No Trello list configured for area ${area}`);

  const payload = { idList, name: title, desc };
  if (dryRun) return { ok: true, dryRun: true, area, payload };

  const params = new URLSearchParams({ ...payload, key, token }).toString();
  const data = await trelloFetch('https://api.trello.com/1/cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  return {
    ok: true,
    area,
    id: data.id,
    url: data.url,
    name: data.name,
    idList: data.idList
  };
}

async function getTrelloRecentActivity(limit = 8) {
  const dotenv = readDotEnv(envFile);
  const key = getEnv('TRELLO_API_KEY', dotenv);
  const token = getEnv('TRELLO_TOKEN', dotenv);
  if (!key || !token) return [];

  const discovered = readJson(discoveredIdsPath, {});
  const selected = getSelectedBoards(discovered);
  const params = new URLSearchParams({
    key,
    token,
    cards: 'open',
    card_fields: 'name,dateLastActivity,idList',
    lists: 'open',
    list_fields: 'name',
    fields: 'name'
  }).toString();

  const events = [];
  for (const board of selected) {
    const data = await trelloFetch(`https://api.trello.com/1/boards/${board.id}?${params}`);
    const lists = Object.fromEntries((data.lists || []).map((item) => [item.id, item.name]));
    for (const card of (data.cards || []).slice(0, 50)) {
      if (!card.dateLastActivity) continue;
      events.push({
        board: board.name,
        title: card.name,
        listName: lists[card.idList] || 'lista',
        at: card.dateLastActivity
      });
    }
  }

  return events
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit)
    .map((item) => ({
      title: `Movimiento ${item.board}`,
      body: `${item.title} · ${item.listName}`,
      time: 'trello',
      tone: 'ok',
      at: item.at
    }));
}

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isBrokerRelated(name = '') {
  return /(tasacion|tasaciones|busqueda|busquedas|venta|alquiler|propuesta|contrato|pagares|pagare|sellos|cierre|gringo estate|referido|informe|abogado|reunion)/i.test(name);
}

function pickModule(name = '') {
  const text = normalizeText(name);
  if (/(tasacion|tasaciones|informe|propuesta)/.test(text)) return 'Tasación';
  if (/(gringo estate|fotos|render|copy|publica|aviso|staging|dron)/.test(text)) return 'Comercialización';
  if (/(contrato|pagare|pagares|sellos|boleto|reserva|escritur|abogado)/.test(text)) return 'Documental';
  if (/(cierre|reunion|venta|propuesta|abogado|sellos)/.test(text)) return 'Cierre';
  return 'Captación';
}

async function getBrokeragePanelData() {
  const dotenv = readDotEnv(envFile);
  const key = getEnv('TRELLO_API_KEY', dotenv);
  const token = getEnv('TRELLO_TOKEN', dotenv);
  if (!key || !token) return null;

  const discovered = readJson(discoveredIdsPath, {});
  const personalBoardId = discovered?.boards?.gringoestate_personal?.id;
  if (!personalBoardId) return null;

  const params = new URLSearchParams({
    key,
    token,
    cards: 'open',
    card_fields: 'name,idList,due,dueComplete,labels,dateLastActivity,desc',
    lists: 'open',
    list_fields: 'name',
    fields: 'name'
  }).toString();

  const [personal, wispy] = await Promise.all([
    trelloFetch(`https://api.trello.com/1/boards/${personalBoardId}?${params}`),
    trelloFetch(`https://api.trello.com/1/boards/${WISPY_BOARD_ID}?${params}`).catch(() => null)
  ]);

  const personalLists = Object.fromEntries((personal.lists || []).map((item) => [item.id, item.name]));
  const allPersonalCards = personal.cards || [];
  const brokerListCards = allPersonalCards.filter((card) => personalLists[card.idList] === 'BROKER / OPERACIONES');
  const urgentCards = allPersonalCards.filter((card) => personalLists[card.idList] === '🔥 URGENTE E IMPORTANTE →' && isBrokerRelated(card.name));
  const dailyBrokerCards = allPersonalCards.filter((card) => personalLists[card.idList] === 'TAREAS DIARIAS' && isBrokerRelated(card.name));
  const brokerUniverse = [...urgentCards, ...dailyBrokerCards, ...brokerListCards].filter((card, index, arr) => arr.findIndex((x) => x.id === card.id) === index);

  const wLists = Object.fromEntries(((wispy && wispy.lists) || []).map((item) => [item.id, item.name]));
  const wCards = (wispy && wispy.cards) || [];
  const moduleCards = wCards.filter((card) => wLists[card.idList] === 'MEJORAS OPERATIVAS' && /Módulo|Brokerage Core|Épica/.test(card.name));
  const panelCards = wCards.filter((card) => wLists[card.idList] === 'PANEL / UI' && /Brokerage|panel/i.test(card.name));

  const stats = {
    leads: brokerUniverse.filter((card) => /(busqueda|referido|gringo estate|posibles negocios)/i.test(card.name)).length || brokerListCards.length,
    tasaciones: brokerUniverse.filter((card) => /(tasacion|tasaciones|propuesta|informe)/i.test(card.name)).length,
    publicaciones: brokerUniverse.filter((card) => /(gringo estate|aviso|publica|fotos|render|copy)/i.test(card.name)).length || panelCards.length,
    cierres: brokerUniverse.filter((card) => /(cierre|contrato|sellos|abogado|propuesta|reunion)/i.test(card.name)).length,
    docs: brokerUniverse.filter((card) => /(contrato|pagare|pagares|sellos|boleto|reserva|escritur)/i.test(card.name)).length
  };

  const queue = brokerUniverse.slice(0, 5).map((card) => ({
    title: card.name,
    module: pickModule(card.name),
    nextStep: card.desc ? card.desc.split('\n')[0].slice(0, 120) : 'Abrir card y bajar próximo paso exacto.',
    tone: personalLists[card.idList] === '🔥 URGENTE E IMPORTANTE →' ? 'danger' : 'warn',
    due: card.due ? new Date(card.due).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : personalLists[card.idList]
  }));

  const alerts = [
    ...urgentCards.slice(0, 2).map((card) => ({ title: card.name, body: 'Está en urgente e importante dentro del Trello personal.', tone: 'danger' })),
    ...dailyBrokerCards.filter((card) => /(contrato|sellos|abogado|propuesta)/i.test(card.name)).slice(0, 2).map((card) => ({ title: card.name, body: 'Tema broker/documental activo dentro de tareas diarias.', tone: 'warn' }))
  ].slice(0, 4);

  const milestones = brokerUniverse.filter((card) => card.due).sort((a, b) => new Date(a.due) - new Date(b.due)).slice(0, 4).map((card) => ({
    title: card.name,
    when: new Date(card.due).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }));

  const modules = ['Captación', 'Tasación', 'Comercialización', 'Cierre', 'Documental'].map((name) => {
    const cases = brokerUniverse.filter((card) => pickModule(card.name) === name).slice(0, 3).map((card) => card.name);
    return {
      name,
      count: brokerUniverse.filter((card) => pickModule(card.name) === name).length,
      tone: name === 'Cierre' && cases.length ? 'danger' : (cases.length ? 'ok' : 'warn'),
      cases
    };
  });

  const spotlightCard = queue[0];
  const spotlightSource = brokerUniverse[0];
  const spotlight = spotlightCard ? {
    title: spotlightCard.title,
    type: 'Caso real desde Trello personal',
    module: spotlightCard.module,
    status: spotlightCard.module === 'Cierre' ? 'Activo' : 'En curso',
    semaphore: spotlightCard.tone === 'danger' ? 'Rojo' : 'Amarillo',
    summary: spotlightCard.nextStep,
    nextStep: spotlightCard.nextStep,
    owner: 'Franco',
    deadline: spotlightCard.due || 'sin fecha',
    chips: [spotlightCard.module, personalLists[spotlightSource.idList] || 'Trello'],
    moduleData: {
      captacion: ['Lead tomado desde Trello personal', 'Hace falta bajar siguiente acción operativa'],
      tasacion: ['Caso marcado para análisis comercial', 'Revisar comparables y criterio de precio'],
      comercializacion: ['Confirmar material y salida premium si corresponde'],
      cierre: ['Caso sensible dentro del funnel real', 'Revisar faltantes, fechas y responsables'],
      documental: ['Revisar si toca contrato, sellos o soporte legal']
    },
    documents: moduleCards.slice(0, 3).map((card) => ({ name: card.name, status: 'definición WISPY' })),
    activity: [
      `Card viva en ${personalLists[spotlightSource.idList] || 'Trello personal'}`,
      spotlightCard.nextStep,
      panelCards[0]?.name || 'Vista brokerage en construcción activa.'
    ]
  } : null;

  return {
    stats,
    queue,
    alerts,
    milestones,
    modules,
    spotlight,
    activity: brokerUniverse.slice(0, 4).map((card) => ({
      title: card.name,
      body: `Movimiento visible en ${personalLists[card.idList] || 'Trello personal'}`,
      time: 'trello',
      tone: 'ok'
    }))
  };
}

module.exports = {
  getTrelloBoardsSnapshot,
  getTrelloRecentActivity,
  createTrelloCard,
  getBrokeragePanelData
};
