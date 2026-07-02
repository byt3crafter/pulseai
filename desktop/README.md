# Pulse Desktop

A branded desktop client (Linux / Windows / macOS) for your Pulse AI agent
workforce. Staff log in and chat with the company's agents in a private app —
no Telegram/WhatsApp needed. It talks to a Pulse gateway's **App API**
(`/api/app/*`).

## Run it (development)
```bash
cd desktop
npm install          # downloads Electron (~one-time)
npm start            # opens the app window
```
On first launch: enter your **email + password** (and 2FA code if enabled).
To point at a different instance, click **Server settings** and set the gateway
URL (default `https://pulse.runstate.mu:8082`).

## Build installers
```bash
npm run build:linux   # → AppImage + .deb in dist/
npm run build:win     # → NSIS installer (run on/for Windows)
npm run build:mac     # → .dmg (run on macOS)
```

## Branding (per client)
For a white-labeled build, change `productName`/`appId` in `package.json` and
the brand name shown in `renderer/index.html` (`brandName`, `brandName2`).
Point the default gateway URL at the client's dedicated instance in
`renderer/app.js` (`DEFAULT_SERVER`).

## How it connects
- `POST /api/app/login` → app token (password + 2FA honored)
- `GET /api/app/agents` → the workspace's agents
- `GET /api/app/history` → recent messages
- `POST /api/app/chat` → send a message, runs the agent, returns the reply

Auth token is stored locally; sign out clears it.
