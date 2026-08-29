# VWI Sorter — Discord presence worker

Keeps your bot showing as ONLINE (green dot) in Discord.

Your slash commands already work through HTTP interactions on the VWI Sorter
site. This tiny worker does one thing: it holds an open Discord Gateway
connection so the bot appears online. Run it anywhere that stays on 24/7.

## Files
- index.js       - the worker (logs in, sets presence)
- package.json   - dependencies + start script
- README.md      - these instructions

## Requirements
- Node.js 20+
- Your bot token as the env var DISCORD_BOT_TOKEN
- The bot already invited to your server (use the install link in the Discord tab)
- Exactly ONE instance running (two logins with the same token conflict)

## Where to get the token
Discord Developer Portal -> your application -> Bot -> Reset Token
https://discord.com/developers/applications

## Deploy: Railway (easiest)
1. https://railway.com/new
2. Deploy from GitHub repo (push these files) or "Empty Service".
3. Variables -> DISCORD_BOT_TOKEN = your token
4. Deploy. It is a worker; no port or domain is needed.

## Deploy: Render
1. https://dashboard.render.com/create?type=worker  (Background Worker)
2. Build command: npm install
3. Start command: node index.js
4. Environment -> DISCORD_BOT_TOKEN
Note: Render background workers are a paid instance type.

## Deploy: Fly.io
1. Install flyctl: https://fly.io/docs/flyctl/install/
2. fly launch --no-deploy
3. Remove the [http_service] block from fly.toml (no web port).
4. fly secrets set DISCORD_BOT_TOKEN=your-token
5. fly deploy   (keep 1 machine always on)

## Deploy: your own VPS / Raspberry Pi
1. npm install
2. export DISCORD_BOT_TOKEN=your-token
3. npm i -g pm2 && pm2 start index.js --name vwi-presence
4. pm2 save && pm2 startup

## Troubleshooting
- Still offline: check the host logs for "Online as ..." and confirm the token
  is set and not reset in the developer portal.
- Instantly disconnecting: the token is invalid or another instance is running.
- Commands stopped working: unrelated to this worker - check the interactions
  endpoint in the VWI Sorter Discord tab.
