// Cloudflare Worker:個人雲端備份(給 afk-cloudsave.js 用)。
// 只有一個使用者:持有 SAVE_TOKEN 的人。每份備份＝afk-fullsave 打出來的整包 JSON,原樣存、原樣吐,不解析內容。
//
// API(全部要 Authorization: Bearer <SAVE_TOKEN>):
//   GET    /backups          → [{ id, at, device, size }](新到舊)
//   POST   /backups?device=x → body=整包文字;存一份新的,超過 KEEP 份就刪最舊的 → { id, at }
//   GET    /backups/<id>     → 該份原文
//
// 設定:KV 綁定 SAVES、secret SAVE_TOKEN(wrangler secret put SAVE_TOKEN)、[vars] KEEP / ALLOW_ORIGINS。
//
// KV key 用「反向時間戳」開頭 → list() 天生是新到舊,不必整批讀出來排序。
// KV 免費額度:每天寫 1000 次、刪 1000 次、list 1000 次;自動上傳每 10 分鐘一次＝每天最多 144 寫＋144 刪,夠用。

const MAX_TS = 9999999999999;
const MAX_BYTES = 24 * 1024 * 1024;   // KV 單值上限 25MB,留一點餘裕

function cors(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allow = String(env.ALLOW_ORIGINS || "*").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = allow.includes("*") || allow.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? (origin || "*") : "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
}

// 逐字比對但不提早結束,避免用回應時間猜密碼
function sameToken(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !b) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a.charCodeAt(i) || 0) ^ b.charCodeAt(i);
  return diff === 0;
}

function newId(now) {
  const rev = String(MAX_TS - now).padStart(13, "0");
  const rand = Math.random().toString(36).slice(2, 8);
  return rev + "-" + rand;
}

async function listAll(env) {
  const out = [];
  let cursor;
  do {
    const r = await env.SAVES.list({ prefix: "b:", cursor });
    for (const k of r.keys) out.push({ id: k.name.slice(2), ...(k.metadata || {}) });
    cursor = r.list_complete ? undefined : r.cursor;
  } while (cursor);
  return out;
}

export default {
  async fetch(req, env) {
    const h = cors(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });

    const auth = req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!sameToken(token, env.SAVE_TOKEN)) return json({ error: "unauthorized" }, 401, h);

    const url = new URL(req.url);
    const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (parts[0] !== "backups") return json({ error: "not found" }, 404, h);

    if (parts.length === 1 && req.method === "GET") {
      return json(await listAll(env), 200, h);
    }

    if (parts.length === 1 && req.method === "POST") {
      const body = await req.text();
      if (!body) return json({ error: "empty" }, 400, h);
      if (new TextEncoder().encode(body).length > MAX_BYTES) return json({ error: "too large" }, 413, h);
      const now = Date.now();
      const id = newId(now);
      const device = (url.searchParams.get("device") || "").slice(0, 40);
      await env.SAVES.put("b:" + id, body, { metadata: { at: now, device, size: body.length } });

      const keep = Math.max(1, parseInt(env.KEEP, 10) || 20);
      const all = await listAll(env);
      for (const old of all.slice(keep)) await env.SAVES.delete("b:" + old.id);
      return json({ id, at: now }, 200, h);
    }

    if (parts.length === 2 && req.method === "GET") {
      const v = await env.SAVES.get("b:" + parts[1]);
      if (v == null) return json({ error: "not found" }, 404, h);
      return new Response(v, { status: 200, headers: { ...h, "Content-Type": "application/json; charset=utf-8" } });
    }

    return json({ error: "not found" }, 404, h);
  },
};
