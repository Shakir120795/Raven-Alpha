// Tiny helper around the Upstash/Vercel-KV REST API — no SDK dependency needed.
// Works the moment you create a "KV" (Upstash Redis) database in the Vercel
// dashboard and connect it to this project: Vercel auto-injects
// KV_REST_API_URL + KV_REST_API_TOKEN as env vars, and this file just uses them.
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

export const kvReady = () => Boolean(KV_URL && KV_TOKEN);

export async function kvGet(key) {
  if (!kvReady()) return null;
  try {
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    const j = await r.json();
    if (j == null || j.result == null) return null;
    try { return JSON.parse(j.result); } catch { return j.result; }
  } catch { return null; }
}

export async function kvSet(key, value) {
  if (!kvReady()) return false;
  try {
    const r = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      body: JSON.stringify(value),
    });
    return r.ok;
  } catch { return false; }
}
