#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# GringoLabs backup — código + configs custom → repo git local + GitHub privado.
#
# Respalda lo HARD-TO-RECREATE (el "cerebro": agents-runtime, compose, whisper,
# docs de contexto, scripts de cron). NUNCA incluye secrets (.env, *.pem, tokens).
# git solo pushea cuando algo cambió → consumo despreciable.
#
# Agregado 2026-05-29 (S16). Corre por cron. Logs en /tmp/gringolabs-backup.log
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

WS="/home/franco/.openclaw/workspace"
DEST="/home/franco/backups/gringolabs-config"
LOG="/tmp/gringolabs-backup.log"
REMOTE_URL="https://github.com/Gringmaister/gringolabs-config-backup.git"
TS="$(date '+%Y-%m-%d %H:%M:%S')"

log() { echo "[$TS] $*" >> "$LOG"; }

mkdir -p "$DEST"

# Excludes — garantizan que NO entren secrets ni ruido.
EXCLUDES=(
  --exclude='.git' --exclude='node_modules' --exclude='data'
  --exclude='*.bak' --exclude='*.bak-*' --exclude='*-bak-*'
  --exclude='.env' --exclude='.env.*' --exclude='*.env'
  --exclude='*.pem' --exclude='*.key' --exclude='*.log' --exclude='secrets'
)

# ── Sync curado (solo lo valioso) ────────────────────────────────────────────
rsync -a --delete "${EXCLUDES[@]}" "$WS/wispy-stack/agents-runtime/" "$DEST/agents-runtime/"
mkdir -p "$DEST/wispy-stack"
cp -f "$WS/wispy-stack/docker-compose.yml" "$DEST/wispy-stack/" 2>/dev/null
# Infra del bridge (compose + Dockerfile) — incluye el named tunnel. Sin secrets.
cp -f "$WS/docker-compose.wispy-bridge.yml" "$DEST/" 2>/dev/null
cp -f "$WS/Dockerfile.wispy-bridge" "$DEST/" 2>/dev/null
# S70BC-BACKUP (2026-06-15): el CÓDIGO del bridge (horneado en la imagen) no estaba en ningún backup. Sin secrets (lee por process.env → pasa el safety-scan).
cp -f "$WS/wispy-runtime-bridge.js" "$DEST/" 2>/dev/null
[ -f "$WS/wispy-stack/.gitignore" ] && cp -f "$WS/wispy-stack/.gitignore" "$DEST/wispy-stack/" 2>/dev/null
rsync -a --delete "${EXCLUDES[@]}" "$WS/wispy-stack/whisper/" "$DEST/wispy-stack/whisper/" 2>/dev/null
for f in CLAUDE.md AGENTS.md SOUL.md USER.md TOOLS.md HEARTBEAT.md .gitignore; do
  [ -f "$WS/$f" ] && cp -f "$WS/$f" "$DEST/" 2>/dev/null
done
rsync -a --delete "${EXCLUDES[@]}" "$WS/gringoestate/scripts/" "$DEST/gringoestate-scripts/" 2>/dev/null

cd "$DEST" || { log "ABORT: no pude cd a $DEST"; exit 1; }

# ── Git init / remote (idempotente) ──────────────────────────────────────────
if [ ! -d .git ]; then
  git init -q
  git branch -M main 2>/dev/null
fi
git remote get-url origin >/dev/null 2>&1 || git remote add origin "$REMOTE_URL"

# ── Safety scan: abortar si se cuela un secret literal ───────────────────────
if grep -rIE 'sk-[A-Za-z0-9]{20}|gho_[A-Za-z0-9]{20}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10}|(API_KEY|SECRET|TOKEN|PASSWORD)[[:space:]]*=[[:space:]]*["'"'"']?[A-Za-z0-9_]{20}' \
   . --include='*.js' --include='*.json' --include='*.yml' --include='*.yaml' --include='*.env' --include='*.sh' 2>/dev/null \
   | grep -vE '\$\{env:|process\.env|env:[A-Z]' | grep -q .; then
  log "ABORT: posible secret detectado en el set curado — NO commiteo. Revisar manualmente."
  grep -rIlE 'sk-[A-Za-z0-9]{20}|gho_[A-Za-z0-9]{20}|AKIA[0-9A-Z]{16}' . --include='*.js' --include='*.json' --include='*.yml' 2>/dev/null >> "$LOG"
  exit 1
fi

# ── Commit + push (solo si hay cambios) ──────────────────────────────────────
git add -A
if git diff --cached --quiet; then
  log "sin cambios"
  exit 0
fi
git -c user.name="Franco Garbini" -c user.email="franco@vmi3226215.contaboserver.net" commit -q -m "backup $TS"
log "commit local OK"

# Push a GitHub: solo si RUN_PUSH=1 (off por default — el clasificador de seguridad
# trata el push de código a GitHub externo como exfiltración; requiere que Franco
# agregue una regla de permiso en settings para habilitarlo).
if [ "${RUN_PUSH:-0}" = "1" ]; then
  GH=/home/franco/bin/gh
  if git -c credential.helper='' \
         -c credential.helper='!f() { echo username=Gringmaister; echo "password=$('"$GH"' auth token)"; }; f' \
         push -q origin HEAD:main 2>>"$LOG"; then
    log "push OK"
  else
    log "push FALLÓ (quedó commiteado local en $DEST)"
  fi
else
  log "push omitido (RUN_PUSH!=1) — backup local únicamente"
fi
