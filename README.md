# gringoestate

Landing pública de Gringo Estate + panel privado inicial de Wispy.

## Rutas
- `/` → landing pública
- `/wispy/` → consola privada MVP de Wispy

## Variables de entorno
- `GEMINI_API_KEY` → usada por `netlify/functions/generate-description.js`
- `WISPY_PANEL_PASSWORD` → clave de acceso del panel privado
- `WISPY_PANEL_SECRET` → secreto para firmar la sesión del panel
- `WISPY_RUNTIME_BRIDGE_URL` → endpoint privado read-only para telemetría real de OpenClaw
- `WISPY_RUNTIME_BRIDGE_TOKEN` → bearer token del runtime bridge

## Runtime bridge (telemetría real)
Para que `/wispy/` vea tokens, costo, gateway y sesiones reales desde Netlify, levantá en el host de OpenClaw:

```bash
WISPY_RUNTIME_TOKEN=tu_token node gringoestate/runtime/wispy-runtime-bridge.js
```

Endpoint:
- `GET /wispy-runtime`
- `GET /healthz`

Luego apuntá Netlify a:
- `WISPY_RUNTIME_BRIDGE_URL=https://<tu-host>:8787/wispy-runtime`
- `WISPY_RUNTIME_BRIDGE_TOKEN=tu_token`

Docs completas:
- `docs/runtime-bridge-setup.md`
- `runtime/wispy-runtime-bridge.service`
- `.env.runtime-bridge.example`

## Notas
- El panel `/wispy/` mantiene la estética visual de Gringo Estate pero es una capa privada.
- La auth del panel en esta etapa es un MVP basado en una Netlify Function (`wispy-panel-auth`).
- Siguiente etapa sugerida: conectar chat real, memoria y acciones operativas de Wispy.
