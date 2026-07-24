# MAD SHOT'Z — Cloudflare delivery Worker

A tiny Worker that (1) stores each finished photo in **R2** and serves it when the
QR is scanned (photos **expire 24h**), and (2) stores the **events list + their
templates** in **KV** — permanently — so the same events are available on every
kiosk that points at this Worker.

## Deploy (one time, ~5 min)

From this `cloudflare/` folder:

```bash
# 1. Install + log in (uses your existing Cloudflare account)
npm i -g wrangler          # or use: npx wrangler ...
wrangler login

# 2. Create the R2 bucket (enable R2 in the dashboard first if prompted — free tier)
wrangler r2 bucket create madshotz-photos

# 3. Create the KV namespace for events + templates, then paste the printed id
#    into wrangler.toml ([[kv_namespaces]] → id = "...").
wrangler kv namespace create madshots-data

# 4. Deploy the Worker
wrangler deploy
```

> Already deployed before? You just need steps 3 + 4 to add the events store:
> create the KV namespace, paste its id into `wrangler.toml`, and re-run
> `wrangler deploy`. No frontend env change is needed — events reuse the same
> `VITE_DELIVERY_BASE`. Redeploy the frontend once so the new sync code ships.

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

| Method | Path                    | Purpose                                        |
|--------|-------------------------|------------------------------------------------|
| POST   | `/upload/:code`         | kiosk uploads the composite PNG (R2, 24h)      |
| GET    | `/s/:code`              | branded viewer page (the QR target)            |
| GET    | `/img/:code`            | raw PNG (`?dl=1` to download)                   |
| GET    | `/kv/:collection`       | list all items (`events` or `templates`) — KV  |
| PUT    | `/kv/:collection/:id`   | upsert one item (JSON body)                     |
| DELETE | `/kv/:collection/:id`   | delete one item                                 |

The KV data (events + templates) is **permanent** — no expiry. The app writes
through on every create/edit/delete and pulls the shared list on boot.

Everything is open (no auth) so the browser kiosk can talk to it directly; the size
caps keep abuse cheap. Add a shared-secret header or Cloudflare Access later if you
want to lock writes down.
