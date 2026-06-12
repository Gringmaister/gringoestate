#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Backup LOCAL de datos operativos (sqlite DBs). NO va a GitHub — son PII
# (historial de conversaciones, huéspedes). Snapshot diario comprimido en
# /home/franco/backups/data-snapshots, retiene los últimos 7 días.
# Complementa al gringolabs-backup.sh (que respalda código/config, no datos).
# Agregado 2026-05-29 (S16).
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

SRC=/home/franco/.openclaw/workspace/wispy-stack/data
DEST=/home/franco/backups/data-snapshots
LOG=/tmp/gringolabs-data-backup.log
TS="$(date '+%Y-%m-%d %H:%M')"
DAY="$(date '+%Y-%m-%d')"
ARCHIVE="$DEST/data-$DAY.tar.gz"

mkdir -p "$DEST"

# DBs valiosas (sqlite). Incluye -wal/-shm para consistencia de las DBs en modo WAL.
# La DB de WhatsApp (evolution_postgres) se agrega vía pg_dump más abajo (S36, 2026-06-10).
CANDIDATES=(
  agents-runtime/agents-history.db
  bambi/bambi_history.db
  n8n/database.sqlite n8n/database.sqlite-wal n8n/database.sqlite-shm
  wacli/wacli.db wacli/wacli.db-wal wacli/wacli.db-shm wacli/session.db
)
FILES=()
for f in "${CANDIDATES[@]}"; do
  [ -f "$SRC/$f" ] && FILES+=("$f")
done

if [ ${#FILES[@]} -eq 0 ]; then
  echo "[$TS] no encontré DBs para respaldar en $SRC" >> "$LOG"
  exit 1
fi

# pg_dump de la DB de WhatsApp (Evolution/Postgres): instancias, mensajes, contactos
# y chats. Sin esto, perder el volumen = re-emparejar ambos números. Auth local =
# trust (no requiere password). Tolerante a fallo (el resto del snapshot igual sale).
PGDUMP_DIR="$(mktemp -d)"
PGDUMP_OK=0
if docker exec evolution_postgres pg_dump -U evolution -d evolution > "$PGDUMP_DIR/evolution-postgres.sql" 2>>"$LOG"; then
  PGDUMP_OK=1
else
  echo "[$TS] WARN: pg_dump de evolution_postgres falló (snapshot sin la DB de WhatsApp)" >> "$LOG"
fi

TAR_ARGS=( -C "$SRC" "${FILES[@]}" )
[ "$PGDUMP_OK" = 1 ] && TAR_ARGS+=( -C "$PGDUMP_DIR" evolution-postgres.sql )

# Datos del GRINGO CRM (S43, 2026-06-12): audit trail JSONL (+rotado .1) y plan semanal.
# Viven en workspace/data y no estaban en NINGÚN backup (el CRM en sí vive en Notion,
# que ya se espeja a Obsidian los sábados — esto cubre la trazabilidad local).
CRM_SRC=/home/franco/.openclaw/workspace/data
CRM_FILES=()
for f in "$CRM_SRC"/crm-*.json "$CRM_SRC"/crm-*.jsonl "$CRM_SRC"/crm-*.jsonl.1; do
  [ -f "$f" ] && CRM_FILES+=("$(basename "$f")")
done
[ ${#CRM_FILES[@]} -gt 0 ] && TAR_ARGS+=( -C "$CRM_SRC" "${CRM_FILES[@]}" )

tar -czf "$ARCHIVE" "${TAR_ARGS[@]}" 2>>"$LOG"
RC=$?
rm -rf "$PGDUMP_DIR"
if [ $RC -eq 0 ] && [ -f "$ARCHIVE" ]; then
  echo "[$TS] snapshot OK: $(basename "$ARCHIVE") ($(du -h "$ARCHIVE" | cut -f1), $(( ${#FILES[@]} + PGDUMP_OK )) archivos, pg_dump=$PGDUMP_OK)" >> "$LOG"
else
  echo "[$TS] snapshot FALLÓ (rc=$RC)" >> "$LOG"
  exit 1
fi

# Retención: últimos 7
ls -1t "$DEST"/data-*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm -f
echo "[$TS] snapshots retenidos: $(ls -1 "$DEST"/data-*.tar.gz 2>/dev/null | wc -l)" >> "$LOG"
