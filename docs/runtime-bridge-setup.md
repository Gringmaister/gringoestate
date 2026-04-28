# Runtime Bridge Setup · Wispy Office

## Objetivo
Hacer que el panel `/wispy/` lea telemetría real de OpenClaw aunque la UI esté hosteada en Netlify.

## Qué expone
Endpoint read-only:
- `GET /wispy-runtime`
- protegido por bearer token

Healthcheck:
- `GET /healthz`

## Data que entrega
- gateway online/offline
- sesiones activas
- tokens de la sesión actual
- costo estimado visible
- contexto usado
- estado de tasks
- estado de memoria

## Archivos
- `runtime/collect-openclaw-runtime.js`
- `runtime/wispy-runtime-bridge.js`
- `runtime/wispy-runtime-bridge.service`
- `.env.runtime-bridge.example`

## Setup local en VPS
### 1. Crear env real
```bash
cd /home/franco/.openclaw/workspace/gringoestate
cp .env.runtime-bridge.example .env.runtime-bridge
```

Editar:
```bash
WISPY_RUNTIME_TOKEN=un_token_largo_y_privado
WISPY_RUNTIME_PUBLIC=0
```

### 2. Test manual
```bash
cd /home/franco/.openclaw/workspace/gringoestate
set -a; source .env.runtime-bridge; set +a
node runtime/wispy-runtime-bridge.js
```

### 3. Test endpoint
```bash
curl -H "Authorization: Bearer $WISPY_RUNTIME_TOKEN" http://127.0.0.1:8787/wispy-runtime
```

### 4. Instalar como servicio
```bash
sudo cp /home/franco/.openclaw/workspace/gringoestate/runtime/wispy-runtime-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now wispy-runtime-bridge
sudo systemctl status wispy-runtime-bridge
```

## Netlify
Definir env vars:
- `WISPY_RUNTIME_BRIDGE_URL`
- `WISPY_RUNTIME_BRIDGE_TOKEN`

Ejemplo:
```bash
WISPY_RUNTIME_BRIDGE_URL=https://runtime.tudominio.com/wispy-runtime
WISPY_RUNTIME_BRIDGE_TOKEN=<mismo_token>
```

## Recomendación de producción
No dejarlo expuesto directo al puerto 8787 en internet.
Mejor:
1. reverse proxy
2. HTTPS
3. allowlist o capa extra de auth si querés máxima prolijidad

## Faltantes para producción completa
1. Reverse proxy con dominio/subdominio y TLS
2. Deploy Netlify con env vars del bridge
3. Reemplazar algunos bloques seed por data comercial real
4. Conectar boards reales (Trello o fuente operativa)
5. Conectar colaboradores reales con último contacto vivo
6. Live log real en vez de solo eventos sintéticos
7. Acciones reales desde `Acción` (crear tarea, follow-up, mover a Trello, disparar automatización)
8. Alertas reales de fallos críticos
