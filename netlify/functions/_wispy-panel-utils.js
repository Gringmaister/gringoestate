const fs = require('fs');
const path = require('path');

const runtimeRoot = process.env.LAMBDA_TASK_ROOT || process.cwd() || __dirname;
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const projectRoot = path.resolve(__dirname, '..', '..');
const seedDataDir = fs.existsSync(path.join(projectRoot, 'data'))
  ? path.join(projectRoot, 'data')
  : path.resolve(runtimeRoot, 'data');
const writableDataDir = path.resolve('/tmp', 'wispy-panel-data');
const inboxPath = path.join(writableDataDir, 'wispy-inbox.json');
const actionLogPath = path.join(writableDataDir, 'wispy-action-log.json');
const bugJournalPath = path.join(writableDataDir, 'wispy-bug-journal.json');
const seedInboxPath = path.join(seedDataDir, 'wispy-inbox.json');
const contextPath = path.join(seedDataDir, 'wispy-context.json');
const collaboratorStatePath = path.join(writableDataDir, 'wispy-collaborators.json');
const pipelineStatePath = path.join(writableDataDir, 'wispy-pipeline.json');
const chatHistoryPath = path.join(writableDataDir, 'wispy-chat-history.json');
const memoryPath = path.join(workspaceRoot, 'MEMORY.md');
const userPath = path.join(workspaceRoot, 'USER.md');
const soulPath = path.join(workspaceRoot, 'SOUL.md');
const dailyMemoryDir = path.join(workspaceRoot, 'memory');

function ensureDataDir() {
  if (!fs.existsSync(writableDataDir)) fs.mkdirSync(writableDataDir, { recursive: true });
}

function ensureInboxFile() {
  ensureDataDir();
  if (!fs.existsSync(inboxPath)) {
    const seeded = readJson(seedInboxPath, null);
    const seed = seeded || {
      items: [
        {
          id: `seed-${Date.now()}`,
          title: 'Brief oficina 10:00',
          summary: 'Preparar el resumen ejecutivo de Ambbi, Gringo Estate y pendientes.',
          priority: 'now',
          nextStep: 'Abrir launcher y sintetizar.',
          status: 'open',
          createdAt: new Date().toISOString(),
          source: 'seed'
        }
      ]
    };
    fs.writeFileSync(inboxPath, JSON.stringify(seed, null, 2));
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function extractBullets(sectionTitle, markdown, limit = 5) {
  const escaped = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^###\\s+${escaped}[\\s\\S]*?(?=^###\\s+|^##\\s+|\\Z)`, 'm');
  const match = markdown.match(regex);
  if (!match) return [];
  return match[0]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('*') || /^\d+\./.test(line))
    .map((line) => line.replace(/^\*\s+/, '').replace(/^\d+\.\s+/, '').trim())
    .slice(0, limit);
}

function extractPortfolio(memoryMd) {
  const match = memoryMd.match(/Portfolio Actual:\*\*\s*([^\n]+)/i);
  return match ? match[1].trim() : '17 a 18 departamentos en Uriburu 1070';
}

function extractPriorities(memoryMd, limit = 4) {
  const match = memoryMd.match(/## 4\. PRIORIDADES ESTRATÉGICAS ACTIVAS([\s\S]*?)(?=## 5\.)/);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+\./.test(line))
    .map((line) => line.replace(/^\d+\.\s+/, '').trim())
    .slice(0, limit);
}

function extractStaff(memoryMd, limit = 4) {
  const section = memoryMd.match(/\*\*Áreas Operativas y Liderazgo:\*\*([\s\S]*?)(?=###|\n\n)/);
  if (!section) return [];
  return section[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+\./.test(line))
    .map((line) => line.replace(/^\d+\.\s+/, '').replace(/\*\*/g, '').trim())
    .slice(0, limit);
}

function getLatestDailyMemorySnippet(limit = 3) {
  try {
    const files = fs.readdirSync(dailyMemoryDir)
      .filter((file) => /^\d{4}-\d{2}-\d{2}\.md$/.test(file))
      .sort()
      .reverse();
    if (!files.length) return [];
    const latest = fs.readFileSync(path.join(dailyMemoryDir, files[0]), 'utf8');
    return latest
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- ') || line.startsWith('* '))
      .map((line) => line.slice(2).trim())
      .slice(0, limit);
  } catch {
    return [];
  }
}

function getInbox() {
  ensureInboxFile();
  const payload = readJson(inboxPath, { items: [] });
  return Array.isArray(payload.items) ? payload.items : [];
}

function saveInbox(items) {
  writeJson(inboxPath, { items });
}

function getActionLog() {
  const payload = readJson(actionLogPath, { items: [] });
  return Array.isArray(payload.items) ? payload.items : [];
}

function saveActionLog(items) {
  writeJson(actionLogPath, { items });
}

function appendActionLog(entry) {
  const items = getActionLog();
  const next = [
    {
      id: `log-${Date.now()}`,
      createdAt: new Date().toISOString(),
      ...entry
    },
    ...items
  ].slice(0, 50);
  saveActionLog(next);
  return next;
}

function getBugJournal() {
  const payload = readJson(bugJournalPath, { items: [] });
  return Array.isArray(payload.items) ? payload.items : [];
}

function saveBugJournal(items) {
  writeJson(bugJournalPath, { items });
}

function appendBug(entry) {
  const items = getBugJournal();
  const next = [
    {
      id: `bug-${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: 'open',
      severity: 'medium',
      ...entry
    },
    ...items
  ].slice(0, 80);
  saveBugJournal(next);
  return next;
}

function getCollaboratorState(seedCollaborators = []) {
  const payload = readJson(collaboratorStatePath, null);
  if (payload && Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(seedCollaborators) && seedCollaborators.length) {
    writeJson(collaboratorStatePath, { items: seedCollaborators });
    return seedCollaborators;
  }
  return [];
}

function saveCollaboratorState(items) {
  writeJson(collaboratorStatePath, { items });
}

function getPipelineState(seedPipeline = []) {
  const payload = readJson(pipelineStatePath, null);
  if (payload && Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(seedPipeline) && seedPipeline.length) {
    writeJson(pipelineStatePath, { items: seedPipeline });
    return seedPipeline;
  }
  return [];
}

function savePipelineState(items) {
  writeJson(pipelineStatePath, { items });
}

function updateCollaborator(name, patch = {}) {
  const current = getCollaboratorState();
  const updated = current.map((item) => item.name === name ? { ...item, ...patch } : item);
  saveCollaboratorState(updated);
  return updated;
}

function getChatHistory() {
  const payload = readJson(chatHistoryPath, { items: [] });
  return Array.isArray(payload.items) ? payload.items : [];
}

function saveChatHistory(items) {
  writeJson(chatHistoryPath, { items: items.slice(-40) });
}

function getContextData() {
  const seeded = readJson(contextPath, null);
  if (seeded && seeded.portfolio) {
    return {
      memoryMd: '',
      userMd: '',
      soulMd: '',
      portfolio: seeded.portfolio,
      priorities: Array.isArray(seeded.priorities) ? seeded.priorities : [],
      focus: Array.isArray(seeded.focus) ? seeded.focus : [],
      staff: Array.isArray(seeded.staff) ? seeded.staff : [],
      collaborators: getCollaboratorState(Array.isArray(seeded.collaborators) ? seeded.collaborators : []),
      boards: Array.isArray(seeded.boards) ? seeded.boards : [],
      pipeline: getPipelineState(Array.isArray(seeded.pipeline) ? seeded.pipeline : []),
      gpts: Array.isArray(seeded.gpts) ? seeded.gpts : [],
      subagents: Array.isArray(seeded.subagents) ? seeded.subagents : [],
      runtime: Array.isArray(seeded.runtime) ? seeded.runtime : [],
      liveLog: Array.isArray(seeded.liveLog) ? seeded.liveLog : [],
      daily: Array.isArray(seeded.daily) ? seeded.daily : [],
      communication: Array.isArray(seeded.communication) ? seeded.communication : []
    };
  }

  const memoryMd = readText(memoryPath);
  const userMd = readText(userPath);
  const soulMd = readText(soulPath);
  return {
    memoryMd,
    userMd,
    soulMd,
    portfolio: extractPortfolio(memoryMd),
    priorities: extractPriorities(memoryMd),
    focus: [],
    staff: extractStaff(memoryMd),
    collaborators: getCollaboratorState([]),
    boards: [],
    pipeline: getPipelineState([]),
    gpts: [],
    subagents: [],
    runtime: [],
    liveLog: [],
    daily: getLatestDailyMemorySnippet(),
    communication: extractBullets('COMUNICACIÓN Y "VIBE" ARGENTINO', memoryMd, 3)
  };
}

module.exports = {
  workspaceRoot,
  inboxPath,
  actionLogPath,
  bugJournalPath,
  collaboratorStatePath,
  pipelineStatePath,
  chatHistoryPath,
  getInbox,
  saveInbox,
  getActionLog,
  saveActionLog,
  appendActionLog,
  getCollaboratorState,
  saveCollaboratorState,
  getPipelineState,
  savePipelineState,
  updateCollaborator,
  getChatHistory,
  saveChatHistory,
  getBugJournal,
  saveBugJournal,
  appendBug,
  getContextData,
  readText
};
