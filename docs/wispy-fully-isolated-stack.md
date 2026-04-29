# Wispy Fully Isolated Stack

## Objetivo
Dejar a Wispy dentro de una caja portable propia:
- gateway OpenClaw
- backend/API del panel
- runtime bridge
- chat persistente
- estado del panel
- memoria y sesiones OpenClaw

Todo eso dentro del mismo contenedor y con data exportable.

## Qué resuelve
- Wispy deja de depender del host compartido para correr su runtime principal.
- Ariel no necesita rutear procesos sueltos del VPS.
- El perímetro de Wispy queda separado de GringoPMS.
- Se puede mover a otro VPS o local copiando data + env + repo.

## Archivos principales
- `gringoestate/runtime/Dockerfile.wispy-core`
- `gringoestate/runtime/wispy-portable-supervisor.sh`
- `wispy-stack/docker-compose.wispy-core.yml`
- `wispy-stack/.env.wispy-core.example`

## Qué corre adentro
### 1. OpenClaw Gateway
Puerto interno/externo:
- `18789`

### 2. Wispy Portable API
Sirve:
- `GET /healthz`
- `GET /api/panel-data`
- `GET|POST|DELETE /api/chat`
- `GET|POST|PATCH /api/inbox`
- `POST /api/followup`
- `GET|PATCH /api/collaborators`
- `GET|PATCH /api/pipeline`
- `GET /wispy-runtime`

Puerto:
- `8788`

## Persistencia portable
La data queda en:
- `wispy-stack/data/home`
- `wispy-stack/data/panel`
- `wispy-stack/logs`

### `data/home`
Acá vive el `HOME` del contenedor.
Entonces la carpeta importante es:
- `data/home/.openclaw`

Eso incluye sesiones/config/estado del runtime principal.

## Primera importación
Para no perder el estado actual, el contenedor puede importar **una sola vez** desde la `.openclaw` actual del host:
- monta `${HOME}/.openclaw` en `/seed/openclaw` solo lectura
- si `data/home/.openclaw` todavía no existe, la copia adentro

Después de eso, Wispy ya vive en su propia data portable.

## Cómo levantarlo
```bash
cd /home/franco/.openclaw/workspace/wispy-stack
cp .env.wispy-core.example .env.wispy-core
# completar tokens y env

docker compose -f docker-compose.wispy-core.yml up -d --build
```

## Cómo validar
```bash
curl http://127.0.0.1:8788/healthz
curl -H "Authorization: Bearer $WISPY_API_TOKEN" http://127.0.0.1:8788/api/panel-data
curl -H "Authorization: Bearer $WISPY_RUNTIME_TOKEN" http://127.0.0.1:8788/wispy-runtime
curl -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" http://127.0.0.1:18789/
```

## Qué queda para Ariel
Ariel solo tendría que rutear:
- `runtime.gringo.estate` -> `wispy_core:8788`

Con eso Netlify puede usar:
- `WISPY_PORTABLE_API_URL=https://runtime.gringo.estate/`
- `WISPY_PORTABLE_API_TOKEN=<token api>`
- `WISPY_RUNTIME_BRIDGE_URL=https://runtime.gringo.estate/wispy-runtime`
- `WISPY_RUNTIME_BRIDGE_TOKEN=<token runtime>`

## Qué copiar para mover Wispy completo
Para llevar Wispy a otro VPS o a local:
1. repo/workspace
2. `wispy-stack/docker-compose.wispy-core.yml`
3. `wispy-stack/.env.wispy-core`
4. `wispy-stack/data/home`
5. `wispy-stack/data/panel`
6. `wispy-stack/logs` (opcional)

## Estado real
Desde código, esta es la base más cercana a dejar Wispy 100% aislado.
La parte final operativa depende de levantar el contenedor y rutearlo en el entorno real.
