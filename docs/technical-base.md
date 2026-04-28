# Technical Base · Wispy + Gringo Estate

## 1. Active surfaces
- Public landing: `/`
- Private dashboard: `/wispy/`
- Hosting/runtime: Netlify
- Functions dir: `netlify/functions/`

## 2. Current private dashboard modules
- top metrics snapshot
- central Ops block
- command composer
- Wispy chat
- persistent inbox
- focus/context block

## 3. Key runtime files
- `wispy/index.html` → dashboard UI
- `netlify/functions/wispy-panel-auth.js` → private access
- `netlify/functions/wispy-panel-data.js` → snapshot/inbox/focus payload
- `netlify/functions/wispy-panel-inbox.js` → inbox persistence API
- `netlify/functions/wispy-panel-chat.js` → Wispy chat API
- `netlify/functions/wispy-panel-action.js` → brief/action synthesis API
- `netlify/functions/_wispy-panel-utils.js` → shared runtime helpers
- `data/wispy-context.json` → production-safe seed context
- `data/wispy-inbox.json` → seed inbox

## 4. Production constraints
- Netlify functions cannot rely on local workspace files outside the deployed project bundle.
- Writable runtime state must go to `/tmp`.
- HTML and functions can propagate at different times.
- AI model ids must be production-valid; always keep graceful fallback behavior.

## 5. Current UI direction
- premium / sober / executive
- fewer descriptive sections
- metrics first
- one dominant Ops surface
- action density over decorative cards

## 6. Current priorities
1. keep deploy stable
2. harden dashboard runtime
3. connect real OpenClaw telemetry (gateway, sessions, tokens, cost)
4. connect real commercial/business data later

## 7. Runtime telemetry bridge
- `runtime/collect-openclaw-runtime.js` gathers live local telemetry from `~/.openclaw` and `openclaw status`
- `runtime/wispy-runtime-bridge.js` exposes a read-only bearer-protected HTTP bridge
- `netlify/functions/_wispy-runtime.js` reads either:
  - local telemetry directly, or
  - remote bridge telemetry via `WISPY_RUNTIME_BRIDGE_URL`

This is the path for real metrics when the UI is hosted on Netlify but OpenClaw runs on Franco's VPS.

## 8. Environment assumptions
- `GEMINI_API_KEY` may exist in Netlify; if not, chat must degrade gracefully
- panel auth depends on `WISPY_PANEL_PASSWORD` and/or `WISPY_PANEL_SECRET`
- live telemetry on Netlify depends on:
  - `WISPY_RUNTIME_BRIDGE_URL`
  - `WISPY_RUNTIME_BRIDGE_TOKEN`

## 7. Environment assumptions
- `GEMINI_API_KEY` may exist in Netlify; if not, chat must degrade gracefully
- panel auth depends on `WISPY_PANEL_PASSWORD` and/or `WISPY_PANEL_SECRET`

## 8. Working rule
When changing the panel, verify both:
- public page reflects the intended UI
- dependent functions answer correctly in production
