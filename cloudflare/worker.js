/**
 * Mad Shots delivery Worker (Cloudflare R2).
 *
 * Routes:
 *   POST /upload/:code   — store the finished photo in R2 (called by the kiosk app)
 *   GET  /s/:code        — branded viewer page (what the QR opens)
 *   GET  /img/:code      — raw PNG (?dl=1 forces download)
 *
 * Photos are refused / deleted 24h after upload, so every link expires after a day.
 * Bind an R2 bucket as `PHOTOS` (see wrangler.toml).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB safety cap

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const keyFor = (code) => `sessions/${code}.png`;
const CODE_RE = /^[A-Za-z0-9_-]{1,64}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    let m;
    if ((m = pathname.match(/^\/upload\/(.+)$/)) && request.method === "POST") {
      return handleUpload(request, env, m[1], url.origin);
    }
    if ((m = pathname.match(/^\/img\/([^/.]+)(?:\.png)?$/)) && request.method === "GET") {
      return serveImage(env, m[1], url.searchParams.has("dl"));
    }
    if ((m = pathname.match(/^\/s\/([^/.]+)$/)) && request.method === "GET") {
      return viewerPage(env, m[1], url.origin);
    }

    return new Response("Mad Shots delivery", { status: 200, headers: CORS });
  },
};

async function handleUpload(request, env, code, origin) {
  if (!CODE_RE.test(code)) return json({ error: "bad code" }, 400);
  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return json({ error: "empty" }, 400);
  if (body.byteLength > MAX_BYTES) return json({ error: "too large" }, 413);

  const contentType = request.headers.get("content-type") || "image/jpeg";
  await env.PHOTOS.put(keyFor(code), body, {
    httpMetadata: { contentType },
    customMetadata: { ts: String(Date.now()), ct: contentType },
  });
  return json({ url: `${origin}/s/${code}` }, 200);
}

function uploadedAt(obj) {
  const ts = obj.customMetadata && obj.customMetadata.ts;
  if (ts) return Number(ts);
  return obj.uploaded ? obj.uploaded.getTime() : 0;
}

function isExpired(obj) {
  return Date.now() - uploadedAt(obj) > DAY_MS;
}

async function serveImage(env, code, download) {
  if (!CODE_RE.test(code)) return notFound();
  const obj = await env.PHOTOS.get(keyFor(code));
  if (!obj) return notFound();
  if (isExpired(obj)) {
    await env.PHOTOS.delete(keyFor(code));
    return new Response("Expired", { status: 410, headers: CORS });
  }
  const ct =
    (obj.httpMetadata && obj.httpMetadata.contentType) ||
    (obj.customMetadata && obj.customMetadata.ct) ||
    "image/jpeg";
  const ext = ct.includes("webp") ? "webp" : ct.includes("png") ? "png" : "jpg";
  const headers = new Headers(CORS);
  headers.set("content-type", ct);
  headers.set("cache-control", "public, max-age=1800");
  if (download) {
    headers.set("content-disposition", `attachment; filename="mad-shots-${code}.${ext}"`);
  }
  return new Response(obj.body, { headers });
}

async function viewerPage(env, code, origin) {
  if (!CODE_RE.test(code)) return htmlResponse(expiredHtml(), 404);
  const obj = await env.PHOTOS.head(keyFor(code));
  if (!obj || isExpired(obj)) {
    if (obj) await env.PHOTOS.delete(keyFor(code));
    return htmlResponse(expiredHtml(), 410);
  }
  const hoursLeft = Math.max(
    0,
    Math.ceil((DAY_MS - (Date.now() - uploadedAt(obj))) / (60 * 60 * 1000)),
  );
  return htmlResponse(viewerHtml(code, origin, hoursLeft), 200);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}
function notFound() {
  return new Response("Not found", { status: 404, headers: CORS });
}
function htmlResponse(html, status) {
  return new Response(html, {
    status,
    headers: { ...CORS, "content-type": "text/html; charset=utf-8" },
  });
}

const PAGE_HEAD = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mad Shots</title>
<style>
  :root{--a:#ff7aad;--b:#b294ff;--c:#7ae0c4}
  *{box-sizing:border-box}
  body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;
    font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#5a4552;
    background:radial-gradient(120% 80% at 50% -10%,#fff 0,#ffeef6 45%,#eee6ff 100%)}
  .card{width:min(92vw,420px);text-align:center;padding:26px}
  .brand{font-weight:800;letter-spacing:.18em;font-size:15px;
    background:linear-gradient(110deg,var(--a),var(--b) 55%,var(--c));
    -webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:16px}
  img{width:100%;border-radius:18px;box-shadow:0 22px 48px -20px rgba(150,90,120,.5);background:#fff}
  .btn{display:inline-block;margin-top:20px;padding:14px 30px;border-radius:999px;
    font-weight:700;color:#fff;text-decoration:none;
    background:linear-gradient(110deg,var(--a),var(--b) 60%,var(--c));
    box-shadow:0 0 40px -10px var(--a)}
  .note{margin-top:14px;font-size:12px;opacity:.6}
  .big{font-size:22px;font-weight:800;margin:8px 0}
</style></head><body><div class="card">`;

function viewerHtml(code, origin, hoursLeft) {
  return `${PAGE_HEAD}
    <div class="brand">MAD SHOTS</div>
    <img src="${origin}/img/${code}" alt="Your Mad Shots photo"/>
    <div><a class="btn" href="${origin}/img/${code}?dl=1" download>↓ Save photo</a></div>
    <div class="note">Link expires in ~${hoursLeft}h · save it now 💾</div>
  </div></body></html>`;
}

function expiredHtml() {
  return `${PAGE_HEAD}
    <div class="brand">MAD SHOTS</div>
    <div class="big">This link has expired 🕊️</div>
    <div class="note">Photos are available for 24 hours after your session.</div>
  </div></body></html>`;
}
