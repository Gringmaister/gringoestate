# Wispy Portable Stack

## Qué queda aislado con este stack
Este stack mete dentro de Docker:
- runtime bridge (`/wispy-runtime`)
- API portable del panel (`/api/*`)
- chat persistente del panel
- estado de inbox / colaboradores / pipeline
- tokenización y env propia

## Qué sigue afuera por ahora
- el proceso principal de OpenClaw/WhatsApp
- las sesiones reales del bot

O sea: esto ya separa bastante el panel y su backend, pero el aislamiento 100% total de Wispy recién se completa cuando el runtime principal del bot también viva en un contenedor propio.

## Archivos
- `runtime/wispy-portable-api.js`
- `runtime/Dockerfile.wispy-portable`
- `../wispy-stack/docker-compose.wispy-portable.yml`
- `../wispy-stack/.env.wispy-portable.example`

## Endpoints del contenedor
- `GET /healthz`
- `GET /wispy-runtime`
- `GET /api/panel-data`
- `GET|POST|DELETE /api/chat`
- `GET|POST|PATCH /api/inbox`
- `POST /api/followup`
- `GET|PATCH /api/collaborators`
- `GET|PATCH /api/pipeline`

## Cómo levantarlo
```bash
cd /home/franco/.openclaw/workspace/wispy-stack
cp .env.wispy-portable.example .env.wispy-portable
# completar tokens/env

docker compose -f docker-compose.wispy-portable.yml up -d --build
```

## Cómo probarlo
```bash
curl http://127.0.0.1:8788/healthz
curl -H "Authorization: Bearer $WISPY_API_TOKEN" http://127.0.0.1:8788/api/panel-data
curl -H "Authorization: Bearer $WISPY_RUNTIME_TOKEN" http://127.0.0.1:8787/wispy-runtime
```

## Cómo conectarlo con Netlify
Definir en Netlify:
- `WISPY_PORTABLE_API_URL=https://runtime.gringo.estate/`
- `WISPY_PORTABLE_API_TOKEN=<token api>`
- `WISPY_RUNTIME_BRIDGE_URL=https://runtime.gringo.estate/wispy-runtime`
- `WISPY_RUNTIME_BRIDGE_TOKEN=<token runtime>`

## Resultado de arquitectura
Netlify queda como fachada.
La lógica/state del panel queda en el contenedor propio de Wispy.

## Qué le podés decir a Ariel
"Ya dejé Wispy preparado para correr como servicio Docker propio. Si me ruteás `runtime.gringo.estate` al contenedor `wispy_portable_api` (8788 para API y/o 8787 para runtime), el panel deja de depender del host suelto y queda dentro de mi perímetro."
