# AGENTS.md

## Reality Check
- `README.md` is still the stock Vite template. For real behavior, start with `package.json`, `electron/main.cjs`, `electron/preload.cjs`, and `src/renderer.d.ts`.
- This is a single-package Electron + React/Vite app. `pnpm-workspace.yaml` only controls built-dependency policy; it is not a monorepo.

## System Boundary
- This repo is only the Electron app actor in a larger `Electron app <-> ThingsBoard <-> ESP32` system.
- Keep that boundary strict: the app should talk to ThingsBoard only, never directly to the ESP32 and never via MQTT.
- Treat the app as the source of truth for Pomodoro state and phase durations; device state is only a mirror driven by RPC.
- Threshold/alarm policy belongs in ThingsBoard or the app, not in firmware-facing glue code.

## Run
- Use `pnpm`.
- `pnpm dev` is the normal local entrypoint: it runs Vite plus Electron and waits for `localhost:5173`.
- `pnpm start` only runs `electron .`; in source mode Electron always loads `http://localhost:5173`, so `pnpm start` needs a separate Vite server already running.
- Root `tsconfig.json` is project references only; use `pnpm exec tsc -b` for typechecking.
- `pnpm exec vite build` is the fastest bundle check. `pnpm build` additionally runs `electron-builder` to package the desktop app.
- `pnpm test:iot` is a manual integration check. It prompts for real ThingsBoard user credentials and hits the live host `http://iot.ceisufro.cl:8080`.
- `node test-tracking.js` is a manual smoke test for `get-windows`; it needs a real desktop session and OS permissions to inspect the active window.

## Architecture
- `electron/main.cjs` is the real backend of the app: ThingsBoard auth/telemetry, presence polling, active-window tracking, and stats persistence all live there.
- Runtime preload is `electron/preload.cjs`. `src/preload.ts` exists but is not wired into `BrowserWindow`.
- The renderer entrypoint is `src/main.tsx`; `src/App.tsx` composes the dashboard. `src/renderer.d.ts` is the type contract for `window.api`.
- If you change IPC, update all three surfaces together: `electron/main.cjs`, `electron/preload.cjs`, and `src/renderer.d.ts`.
- Firmware-facing control currently goes through `rpc:send-command` in `electron/main.cjs`; that handler validates methods against `ALLOWED_RPC_METHODS`, which currently only permits `setSessionState`.
- App-usage history is stored outside the repo at `app.getPath('userData')/truefocus-stats.json`, so old state survives git clean/reset.

## Current Scope
- Current code implements ThingsBoard REST login, telemetry reads, presence polling, local app-usage tracking, and oneway RPC forwarding.
- Do not assume WebSocket telemetry subscriptions, alarm ingestion, extra environmental sensor fields, or `sonarAlarma` support already exist in this repo just because they appear in higher-level system docs.
- If you add alarm handling later, preserve the product rules from the system spec: absence alarms only matter during active work sessions, posture-style alerts need cooldowns, and critical air-quality alerts may need to override normal silent behavior.

## Gotchas
- `.env.example` is more configurable than the code. `electron/main.cjs` only reads `DEV_MODE`, `DEV_EMAIL`, and `DEV_PASSWORD`.
- ThingsBoard host, device ID, and device access token are hard-coded in `electron/main.cjs` and mirrored in `test-thingsboard.js`; editing `.env` alone will not retarget the backend or device.
- Presence gates tracking: active-window usage only increments while presence is detected, and renderer widgets react to `window.api.onPresenceChanged`.
- Styling tokens live in `src/index.css` via Tailwind v4 `@theme`; `glass-card`, `brand-green-*`, and the custom text scale are defined there, not in `tailwind.config.js`.
- `pnpm lint` only lints `**/*.{ts,tsx}`. Edits in `electron/*.cjs` get no lint or TypeScript coverage, so manual checks matter.
