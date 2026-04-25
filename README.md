# gringoestate

Landing pública de Gringo Estate + panel privado inicial de Wispy.

## Rutas
- `/` → landing pública
- `/wispy/` → consola privada MVP de Wispy

## Variables de entorno
- `GEMINI_API_KEY` → usada por `netlify/functions/generate-description.js`
- `WISPY_PANEL_PASSWORD` → clave de acceso del panel privado
- `WISPY_PANEL_SECRET` → secreto para firmar la sesión del panel

## Notas
- El panel `/wispy/` mantiene la estética visual de Gringo Estate pero es una capa privada.
- La auth del panel en esta etapa es un MVP basado en una Netlify Function (`wispy-panel-auth`).
- Siguiente etapa sugerida: conectar chat real, memoria y acciones operativas de Wispy.
