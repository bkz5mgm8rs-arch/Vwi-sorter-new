# VWI Sorter — Discord bot worker

Keeps your bot ONLINE (green dot) and runs the /stock command.

/stock add | remove | set | view lets you add stock, remove stock and change
stock on your SellAuth shop straight from Discord. The worker forwards the
command to the VWI Sorter site, which re-checks your Discord roles and talks to
SellAuth with the key saved in the Discord tab. Run it anywhere that stays on 24/7.

## Commands
Product and variant are pickable: start typing and Discord suggests your real
SellAuth products/variants (with live stock) — no exact names to remember.

- /stock view   product:<pick> [variant:<pick>]
- /stock add    product:<pick> lines:<line1|line2> [variant:<pick>] [console:PC|Xbox|PlayStation|Cross-platform]
- /stock remove product:<pick> [lines:<exact lines>] [count:<N>] [variant:<pick>]
- /stock set    product:<pick> count:<N> [variant:<pick>]
- /stock addfile product:<pick> file:<upload .txt> [variant:<pick>] [console:<pick>]
- /stock live   [product:<pick>]  (live stock + Buy now button)

Eldorado Seller Center (R6 tab):
- /eldorado overview | stock | offers | orders | sync
- /eldorado order  id:<order id>
- /eldorado search query:<internal id, title or offer>

SellAuth shop management:
- /sa products | product | addproduct | editproduct | deleteproduct
- /sa orders | order | invoices
- /sa coupons | addcoupon | deletecoupon
- /sa blacklist | blacklistadd | blacklistremove
- /sa shopinfo | revenue | topproducts | help




## Files
- index.js       - the worker (presence + /stock command)
- package.json   - dependencies + start script
- README.md      - these instructions


IMPORTANT: the file names must be EXACT. If your browser saved
"package.json.txt", rename it back to "package.json" before deploying,
otherwise Railway/Railpack replies:
"Railpack could not determine how to build the app."


## Requirements
- Node.js 20+
- Your bot token as the env var DISCORD_BOT_TOKEN
- Optional: VWI_SITE_URL if your site is not blacklistmp-vwi-sorter.lovable.app
- Your SellAuth key + shop ID saved in the Discord tab (needed for /stock)
- The bot already invited to your server (use the install link in the Discord tab)
- Exactly ONE instance running (two logins with the same token conflict)

## Where to get the token
Discord Developer Portal -> your application -> Bot -> Reset Token
https://discord.com/developers/applications

## Deploy: Railway (easiest)
1. https://railway.com/new
2. Deploy from GitHub repo (push the 3 files) or "Empty Service".
3. Variables -> DISCORD_BOT_TOKEN = your token
4. Deploy. It is a worker; no port or domain is needed.
package.json must sit at the repo ROOT with the exact name "package.json" (not
package.json.txt). Its build/start scripts are what Railway uses - if it is
missing or renamed you get "Script start.sh not found".

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
- "DiscordjsError [TokenInvalid]: An invalid token was provided."
  The value in DISCORD_BOT_TOKEN is not a valid bot token. Checklist:
  1. It must be the BOT TOKEN (Developer Portal -> your app -> Bot -> Reset Token).
     NOT the Client Secret, NOT the Public Key, NOT the Application ID.
  2. Paste the value with NO quotes and no spaces. On Railway type it into the
     Variables field directly - do not wrap it in " ".
  3. Do not prefix it with "Bot ".
  4. A token is shown only once. If you lost it, hit Reset Token and use the new
     one - the old one stops working immediately.
  5. After changing the variable, redeploy/restart the service so it picks it up.
- Still offline: check the host logs for "Online as ..." and confirm the token
  is set and not reset in the developer portal.
- Instantly disconnecting: the token is invalid or another instance is running.
- Commands stopped working: unrelated to this worker - check the interactions
  endpoint in the VWI Sorter Discord tab.
