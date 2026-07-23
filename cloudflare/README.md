# MAD SHOT'Z — Cloudflare delivery Worker

A tiny Worker + R2 bucket that stores each finished photo and serves it when the QR
is scanned. Photos **expire 24h** after upload.

## Deploy (one time, ~5 min)

From this `cloudflare/` folder:

```bash
# 1. Install + log in (uses your existing Cloudflare account)
npm i -g wrangler          # or use: npx wrangler ...
wrangler login

# 2. Create the R2 bucket (enable R2 in the dashboard first if prompted — free tier)
wrangler r2 bucket create madshotz-photos

# 3. Deploy the Worker
wrangler deploy
```

`wrangler deploy` prints your Worker URL, e.g.
`https://madshotz-delivery.YOURNAME.workers.dev`.

## Point the app at it

In the app's root `.env` (copy from `.env.example`):

```
VITE_DELIVERY_BASE=https://madshotz-delivery.YOURNAME.workers.dev
```

Then rebuild/restart the app (`npm run dev` or `npm run build`). Done — finishing a
session uploads the photo and the QR opens it.

## Expiry

The Worker refuses (and deletes) any photo older than 24h, so links expire on their
own. To also reclaim storage automatically, add an R2 **lifecycle rule** in the
dashboard (R2 → `madshotz-photos` → Settings → Object lifecycle) to delete objects
after **1 day**.

## Routes

| Method | Path            | Purpose                                   |
|--------|-----------------|-------------------------------------------|
| POST   | `/upload/:code` | kiosk uploads the composite PNG           |
| GET    | `/s/:code`      | branded viewer page (the QR target)       |
| GET    | `/img/:code`    | raw PNG (`?dl=1` to download)             |

Upload is open (no auth) so the browser kiosk can post directly; the 8 MB cap and
24h expiry keep abuse cheap. Add a shared-secret header or Cloudflare Access later
if you want to lock it down.
