# Agent Manager

An Electron app where you hire AI employees, each with its own desktop. Read `docs/hackathon/README.md` first.

```
npm install && node node_modules/electron/install.js   # once
cp .env.example .env.local                             # then fill in keys (optional with mock mode)
DESKTOPS=mock MOCK_LLM=1 npm run office:once           # office on 127.0.0.1:4317
npm run web                                            # renderer on http://127.0.0.1:4318 (proxies /api /media /ws to office)
npm run dev                                            # the same renderer inside Electron
npm run build && npm start                             # production build, preview in Electron
```

- Fixtures, no office needed: open `http://127.0.0.1:4318/?shot=team/week` (any `<area>/<name>` from a `shots.ts`).
- Screenshots: `npm run shots` or `npm run shots -- <area>` writes `shots/<area>/<name>-light.png` and `-dark.png`.
- Checks: `npm run typecheck`, `npm run test`, `npm run purity -- src/renderer`, `npx astryx doctor --built out/renderer`.
- Electron smoke test: `npx electron-vite build && npx tsx scripts/smoke/electron-window.ts`.
- Front end is Astryx only (see `AGENTS.md`). Shared types are in `src/shared`; the renderer store is `src/renderer/src/api/store.ts`.
