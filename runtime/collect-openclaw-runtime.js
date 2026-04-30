const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const openclawRoot = path.join(os.homedir(), '.openclaw');
const sessionsIndexPath = path.join(openclawRoot, 'agents', 'main', 'sessions', 'sessions.json');
const DEFAULT_CONTEXT_LIMIT = 200000;

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readTail(filePath, bytes = 256 * 1024) {
  const stat = fs.statSync(filePath);
  const size = stat.size;
  const start = Math.max(0, size - bytes);
  const length = size - start;
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buffer, 0, length, start);
  } finally {
    fs.closeSync(fd);
  }
  return buffer.toString('utf8');
}

function timeAgo(timestampMs) {
  if (!timestampMs) return 'sin dato';
  const diff = Date.now() - timestampMs;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'recién';
  if (diff < hour) return `${Math.round(diff / minute)}m`;
  if (diff < day) return `${Math.round(diff / hour)}h`;
  return `${Math.round(diff / day)}d`;
}

function formatK(n) {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000) return `${Math.round(n / 100) / 10}k`;
  return String(Math.round(n));
}

function formatUsd(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function detectGatewayProcess() {
  try {
    const processes = fs.readdirSync('/proc').filter((name) => /^\d+$/.test(name));
    for (const pid of processes) {
      try {
        const cmdline = fs.readFileSync(path.join('/proc', pid, 'cmdline'), 'utf8');
        if (cmdline.includes('openclaw-gateway')) return { online: true, pid: Number(pid) };
      } catch {}
    }
  } catch {}
  return { online: false, pid: null };
}

async function probePort(host, port, timeoutMs = 1200) {
  return await new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
    socket.connect(port, host);
  });
}

async function getOpenclawStatusOutput() {
  try {
    const { stdout } = await execFileAsync('script', ['-qec', 'openclaw status', '/dev/null'], { timeout: 20000, maxBuffer: 1024 * 1024 });
    return stdout;
  } catch {
    return '';
  }
}

function stripAnsi(text) {
  return String(text || '').replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\r/g, '');
}

function parseOpenclawStatus(text) {
  const clean = stripAnsi(text);
  const lines = clean.split('\n');
  const findLine = (needle) => lines.find((line) => line.includes(needle)) || '';
  const gatewayLine = findLine('Gateway              │');
  const tasksLine = findLine('Tasks                │');
  const sessionsLine = findLine('Sessions             │');
  const memoryLine = findLine('Memory               │');
  return {
    raw: clean,
    gatewayLine,
    tasksLine,
    sessionsLine,
    memoryLine
  };
}

function parseSessionUsageFromTranscript(sessionFile) {
  if (!fileExists(sessionFile)) return null;
  try {
    const tail = readTail(sessionFile);
    const lines = tail.split('\n').map((line) => line.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const parsed = safeJsonParse(lines[i], null);
      const usage = parsed?.message?.usage;
      if (usage) {
        return {
          input: Number(usage.input || 0),
          output: Number(usage.output || 0),
          cacheRead: Number(usage.cacheRead || 0),
          cacheWrite: Number(usage.cacheWrite || 0),
          totalTokens: Number(usage.totalTokens || 0),
          costTotal: Number(usage.cost?.total || 0),
          timestamp: parsed.timestamp || null,
          model: parsed?.message?.model || parsed?.message?.api || null
        };
      }
    }
  } catch {}
  return null;
}

function collectUsageWindows(sessionFiles = []) {
  const now = Date.now();
  const periods = {
    day: now - (24 * 60 * 60 * 1000),
    week: now - (7 * 24 * 60 * 60 * 1000),
    month: now - (30 * 24 * 60 * 60 * 1000)
  };
  const base = () => ({ tokens: 0, cost: 0, messages: 0, iterations: 0 });
  const windows = { day: base(), week: base(), month: base() };

  for (const sessionFile of sessionFiles) {
    if (!sessionFile || !fileExists(sessionFile)) continue;
    let lines = [];
    try {
      lines = fs.readFileSync(sessionFile, 'utf8').split('\n').filter(Boolean);
    } catch {
      continue;
    }

    for (const line of lines) {
      const parsed = safeJsonParse(line, null);
      if (!parsed?.timestamp || parsed?.type !== 'message') continue;
      const ts = new Date(parsed.timestamp).getTime();
      if (!Number.isFinite(ts)) continue;
      const role = parsed?.message?.role || null;
      const usage = parsed?.message?.usage || null;

      for (const [period, cutoff] of Object.entries(periods)) {
        if (ts < cutoff) continue;
        if (role === 'user' || role === 'assistant') windows[period].messages += 1;
        if (role === 'assistant' && usage) {
          windows[period].iterations += 1;
          windows[period].tokens += Number(usage.totalTokens || 0);
          windows[period].cost += Number(usage.cost?.total || 0);
        }
      }
    }
  }

  return windows;
}

function collectSessions() {
  const index = readJson(sessionsIndexPath, {});
  const entries = Object.entries(index || {});
  const sessions = entries.map(([key, value]) => {
    const usage = value?.sessionFile ? parseSessionUsageFromTranscript(value.sessionFile) : null;
    return {
      key,
      sessionId: value?.sessionId || null,
      sessionFile: value?.sessionFile || null,
      model: usage?.model || value?.model || 'gpt-5.4',
      updatedAt: value?.updatedAt || null,
      usage,
      totalTokens: usage?.totalTokens || 0,
      costTotal: usage?.costTotal || 0,
      channel: value?.lastChannel || value?.deliveryContext?.channel || null,
      previewTo: value?.lastTo || value?.deliveryContext?.to || null
    };
  }).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const activeSessions = sessions.filter((session) => session.updatedAt && (Date.now() - session.updatedAt) < 24 * 60 * 60 * 1000);
  const current = sessions[0] || null;
  return {
    sessions,
    activeSessions,
    current,
    aggregate: {
      count: sessions.length,
      activeCount: activeSessions.length,
      totalTokens: sessions.reduce((sum, session) => sum + (session.totalTokens || 0), 0),
      totalCost: sessions.reduce((sum, session) => sum + (session.costTotal || 0), 0)
    }
  };
}

async function collectRuntime() {
  const sessions = collectSessions();
  const usageWindows = collectUsageWindows(sessions.sessions.map((session) => session.sessionFile).filter(Boolean));
  const gatewayProcess = detectGatewayProcess();
  const gatewayReachable = await probePort('127.0.0.1', 18789);
  const statusOutput = await getOpenclawStatusOutput();
  const parsedStatus = parseOpenclawStatus(statusOutput);

  const current = sessions.current;
  const totalTokens = sessions.aggregate.totalTokens;
  const totalCost = sessions.aggregate.totalCost;
  const currentTokens = current?.usage?.totalTokens || 0;
  const currentCost = current?.usage?.costTotal || 0;
  const contextPct = Math.min(100, Math.round((currentTokens / DEFAULT_CONTEXT_LIMIT) * 100));

  return {
    collectedAt: new Date().toISOString(),
    source: 'local-openclaw',
    gateway: {
      online: gatewayProcess.online && gatewayReachable,
      pid: gatewayProcess.pid,
      reachable: gatewayReachable,
      dashboardUrl: gatewayReachable ? 'http://127.0.0.1:18789/' : null,
      detail: parsedStatus.gatewayLine || ''
    },
    tasks: {
      detail: parsedStatus.tasksLine || ''
    },
    memory: {
      detail: parsedStatus.memoryLine || ''
    },
    sessions: {
      detail: parsedStatus.sessionsLine || '',
      activeCount: sessions.aggregate.activeCount,
      totalCount: sessions.aggregate.count,
      current: current ? {
        key: current.key,
        model: current.model,
        updatedAgo: timeAgo(current.updatedAt),
        totalTokens: currentTokens,
        contextLimit: DEFAULT_CONTEXT_LIMIT,
        contextPct,
        costTotal: currentCost,
        inputTokens: current?.usage?.input || 0,
        outputTokens: current?.usage?.output || 0,
        cacheRead: current?.usage?.cacheRead || 0
      } : null,
      aggregate: {
        totalTokens,
        totalCost,
        models: [...new Set(sessions.sessions.map((session) => session.model).filter(Boolean))]
      },
      usageWindows,
      recent: sessions.sessions.slice(0, 5).map((session) => ({
        key: session.key,
        model: session.model,
        updatedAgo: timeAgo(session.updatedAt),
        totalTokens: session.totalTokens,
        costTotal: session.costTotal,
        to: session.previewTo
      }))
    },
    cards: {
      gatewayValue: gatewayProcess.online && gatewayReachable ? 'Online' : 'Offline',
      sessionsValue: String(sessions.aggregate.activeCount),
      usageValue: `${formatK(currentTokens)} tok`,
      usageNote: current ? `${formatUsd(currentCost)} esta sesión · ${contextPct}% ctx` : 'Sin sesión actual',
      totalUsageValue: `${formatK(totalTokens)} tok`,
      totalUsageNote: `${formatUsd(totalCost)} acumulado visible`
    },
    runtimeItems: [
      {
        title: 'Sesión actual',
        value: current ? `${formatK(currentTokens)} tok` : 'sin sesión',
        tone: 'ok',
        note: current ? `${current.model} · ${formatUsd(currentCost)} · ${contextPct}% contexto` : 'No encontré una sesión actual para mostrar.'
      },
      {
        title: 'Uso acumulado visible',
        value: `${formatK(totalTokens)} tok`,
        tone: 'ok',
        note: `${formatUsd(totalCost)} en sesiones visibles del índice local.`
      },
      {
        title: 'Gateway',
        value: gatewayProcess.online && gatewayReachable ? 'online' : 'offline',
        tone: gatewayProcess.online && gatewayReachable ? 'ok' : 'danger',
        note: parsedStatus.gatewayLine || 'Sin detalle de gateway.'
      },
      {
        title: 'Tasks / cola',
        value: parsedStatus.tasksLine ? 'visible' : 'sin dato',
        tone: parsedStatus.tasksLine ? 'ok' : 'warn',
        note: parsedStatus.tasksLine || 'No pude extraer estado de tasks.'
      },
      {
        title: 'Memoria',
        value: parsedStatus.memoryLine ? 'ready' : 'sin dato',
        tone: parsedStatus.memoryLine ? 'ok' : 'warn',
        note: parsedStatus.memoryLine || 'No pude extraer estado de memoria.'
      }
    ],
    liveLogItems: [
      {
        title: 'Telemetry sync',
        body: `Sesiones activas ${sessions.aggregate.activeCount} · ${formatK(currentTokens)} tokens en sesión actual.`,
        time: 'ahora',
        tone: 'ok'
      },
      {
        title: 'Gateway check',
        body: gatewayProcess.online && gatewayReachable ? 'Gateway reachable y proceso arriba.' : 'Gateway no respondió o proceso caído.',
        time: 'live',
        tone: gatewayProcess.online && gatewayReachable ? 'ok' : 'danger'
      }
    ]
  };
}

module.exports = {
  collectRuntime,
  formatK,
  formatUsd,
  stripAnsi
};
