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

module.exports = {
  getTrelloBoardsSnapshot,
  getTrelloRecentActivity,
  createTrelloCard
};
