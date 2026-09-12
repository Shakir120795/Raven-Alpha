import { kvReady } from "./_kv.js";
import { getWallets, saveWallets } from "./_wallets.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!kvReady()) {
    return res.status(503).json({ error: "KV not configured — create a KV database in Vercel and connect it to this project (see README)." });
  }

  if (req.method === "GET") {
    const wallets = await getWallets();
    return res.json({ wallets });
  }

  if (req.method === "POST") {
    const { address, chain, label } = req.body || {};
    if (!address || !chain) return res.status(400).json({ error: "address and chain required" });
    const wallets = await getWallets();
    const dupe = wallets.find(w => w.chain === chain && w.address.toLowerCase() === address.toLowerCase());
    if (dupe) return res.json({ ok: true, wallets });
    const entry = { id: `${chain}_${address}_${Date.now()}`, address, chain, label: label || `${address.slice(0,6)}…${address.slice(-4)}` };
    const next = [entry, ...wallets];
    await saveWallets(next);
    return res.json({ ok: true, wallets: next });
  }

  if (req.method === "DELETE") {
    const id = req.query?.id || req.body?.id;
    const wallets = await getWallets();
    const next = wallets.filter(w => w.id !== id);
    await saveWallets(next);
    return res.json({ ok: true, wallets: next });
  }

  res.status(405).json({ error: "Method not allowed" });
}
