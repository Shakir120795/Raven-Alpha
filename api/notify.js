export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { telegram_token, chat_id, message, discord_webhook, discord_embed } = req.body;
  const results = {};

  // Send Telegram
  if (telegram_token && chat_id && message) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${telegram_token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id, text: message, parse_mode: "HTML" }),
      });
      const j = await r.json();
      results.telegram = j.ok ? "sent" : j.description;
    } catch (e) { results.telegram = e.message; }
  }

  // Send Discord
  if (discord_webhook) {
    try {
      const payload = discord_embed
        ? { username: "🍌 Alpha Terminal", embeds: [discord_embed] }
        : { username: "🍌 Alpha Terminal", content: message };
      const r = await fetch(discord_webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      results.discord = r.ok ? "sent" : `error ${r.status}`;
    } catch (e) { results.discord = e.message; }
  }

  res.json({ ok: true, results });
}
