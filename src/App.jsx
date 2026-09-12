import { useState, useEffect, useCallback, useRef } from "react";
import { CHAINS, NFT_CHAINS, SEED_WALLETS, SEED_WALLET_CHAINS, ACTIVE_CHAIN_IDS, ACTIVE_CHAINS } from "./chains.js";

// ── Storage ──────────────────────────────────────────────────────
const store = {
  get: (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ── Design ───────────────────────────────────────────────────────
const BG   = "#060A14";
const CARD = "#0D1424";
const LINE = "#1A2540";
const AMB  = "#F5C843";
const POS  = "#00C896";
const NEG  = "#FF5A5A";
const DIM  = "#4A5878";
const TXT  = "#C8D4E8";
const MONO = "'Courier New', monospace";

// ── Alert types ──────────────────────────────────────────────────
const ALERT_TYPES = [
  { id:"new_token", label:"🆕 New Token Pairs",   desc:"DexScreener new profiles" },
  { id:"boosted",   label:"🚀 Boosted / Frontrun", desc:"Projects paying for visibility" },
  { id:"new_proto", label:"📊 New DeFi Protocol",  desc:"DeFiLlama fresh listings" },
  { id:"new_nft",   label:"🖼️ New NFT Mint",       desc:"Reservoir fresh collections" },
  { id:"wallet_new_token", label:"🆕 Wallet New Token", desc:"Watched wallet buys/receives a token it never held before" },
  { id:"wallet_nft_mint", label:"🖼️ Wallet NFT Mint", desc:"Your watched wallets mint a brand-new NFT" },
  { id:"discover_whale", label:"🐳 Whale Buys — Any New Coin/NFT", desc:"Auto-scan trending coins & fresh NFT sales, no address needed" },
];

// ── Helpers ──────────────────────────────────────────────────────
const shorten = (a) => a ? `${a.slice(0,6)}…${a.slice(-4)}` : "—";
const fmtNum = (n, d=2) => {
  const v = Number(n);
  if (!v || isNaN(v)) return "0";
  if (v >= 1e9) return `${(v/1e9).toFixed(d)}B`;
  if (v >= 1e6) return `${(v/1e6).toFixed(d)}M`;
  if (v >= 1e3) return `${(v/1e3).toFixed(d)}K`;
  return v.toFixed(d);
};
const safe = async (url, opts={}) => {
  try { const r = await fetch(url, opts); return r.ok ? r.json() : null; } catch { return null; }
};
// A response counts as "rate limited" if the explorer's own body says so (Etherscan-style APIs
// return HTTP 200 with status:"0" + a rate-limit message even when throttled).
const isRateLimited = (res) => {
  if (!res) return true; // network failure — also worth trying the next key
  const msg = `${res.message||""} ${res.result||""}`.toLowerCase();
  return res.status === "0" && (msg.includes("rate limit") || msg.includes("max calls") || msg.includes("too many requests"));
};
// Multi-RPC/API-key failover: settings[chain.key] can hold one key or several comma-separated
// keys. Tries each in order; if one is rate-limited it automatically falls through to the next.
// Chains flagged noKeyRequired (Blockscout-based explorers like Robinhood/Ink) work with zero keys too.
const explorerFetch = async (chain, settings, params) => {
  const keys = (settings[chain.key] || "").split(",").map(k => k.trim()).filter(Boolean);
  const qs = new URLSearchParams(params).toString();
  if (!keys.length) {
    if (!chain.noKeyRequired) return null;
    return safe(`${chain.api}?${qs}`); // Blockscout-style explorer, no key needed
  }
  let last = null;
  for (const key of keys) {
    const res = await safe(`${chain.api}?${qs}&apikey=${key}`);
    if (!isRateLimited(res)) return res;
    last = res;
  }
  return last; // all keys exhausted/rate-limited — return the last response we got anyway
};
const tagSt = (c) => ({
  background:c+"20", color:c, padding:"2px 7px", borderRadius:"3px",
  fontSize:"10px", fontWeight:"700", fontFamily:MONO, display:"inline-block"
});
const chainColor = (id) => CHAINS.find(c=>c.id===id)?.color || "#718096";

// ── Styles ───────────────────────────────────────────────────────
const P  = { background:CARD, border:`1px solid ${LINE}`, borderRadius:"6px", padding:"16px", marginBottom:"12px" };
const IN = { width:"100%", background:BG, border:`1px solid ${LINE}`, borderRadius:"4px", padding:"9px 11px", color:TXT, fontSize:"12px", boxSizing:"border-box", fontFamily:MONO, outline:"none" };
const BT = { background:AMB, color:"#060A14", border:"none", padding:"8px 16px", borderRadius:"4px", cursor:"pointer", fontSize:"12px", fontWeight:"700" };
const RW = { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${LINE}22` };

function Empty({ msg }) {
  return <div style={{ textAlign:"center", padding:"48px 20px", color:DIM, fontSize:"12px" }}><div style={{ fontSize:"28px", opacity:0.4, marginBottom:"10px" }}>🍌</div><p style={{ margin:0 }}>{msg}</p></div>;
}
function Spin() { return <div style={{ textAlign:"center", padding:"40px", color:DIM, fontSize:"12px", fontFamily:MONO }}>loading...</div>; }
function SubTabs({ tabs, active, onChange }) {
  return (
    <div style={{ display:"flex", gap:"8px", marginBottom:"16px", flexWrap:"wrap" }}>
      {tabs.map(([id,label]) => (
        <button key={id} onClick={()=>onChange(id)} style={{ ...BT, background:active===id?AMB:LINE, color:active===id?"#060A14":DIM, padding:"6px 14px", fontSize:"11px" }}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 🔔 NOTIFICATION ENGINE
// ═══════════════════════════════════════════════════════════════

function buildTelegramText(alert) {
  if (alert.type === "discover_whale") {
    if (alert.isNft) {
      let t = `🐳 <b>Raven Alpha</b> — Whale NFT Buy\n\n🖼️ <b>${alert.name}</b>\n\n⛓ Chain\n${alert.chain?.toUpperCase()}\n\n💎 Price\n<b>${alert.priceNative} ETH</b>\n\n👤 Buyer\n<code>${shorten(alert.address)}</code>\n\n📄 Contract\n<code>${alert.contract}</code>\n\n🔗 <a href="${alert.chartUrl}">View</a>`;
      return t;
    }
    let t = `🐳 <b>Raven Alpha</b> — Whale Buy Detected\n\n🔥 <b>$${alert.sym}</b>\n\n💰 Market Cap\n$${fmtNum(alert.marketCap)}\n\n⛓ Chain\n${alert.chain?.toUpperCase()}\n\n💵 Buy Size\n<b>$${fmtNum(alert.usdVal)}</b> (${alert.tokenAmt} ${alert.sym})\n\n👤 Wallet\n<code>${shorten(alert.address)}</code>\n\n📄 Contract\n<code>${alert.contract}</code>`;
    if (alert.chartUrl) t += `\n\n📈 <a href="${alert.chartUrl}">Chart</a>`;
    return t;
  }
  const emoji = { new_token:"🆕", boosted:"🚀", new_proto:"📊", new_nft:"🖼️", wallet_new_token:"🆕", wallet_nft_mint:"🖼️" }[alert.type] || "⚡";
  const title = { new_token:"New Token", boosted:"Boosted Token", new_proto:"New Protocol", new_nft:"New NFT Mint", wallet_new_token:"Wallet New Token", wallet_nft_mint:"Wallet NFT Mint" }[alert.type] || "Alert";
  let t = `🍌 <b>Raven Alpha</b>\n\n${emoji} <b>${title} Alert</b>\n`;
  if (alert.name)    t += `\n📌 <b>${alert.name}</b>`;
  if (alert.chain)   t += `\n⛓ Chain: <b>${alert.chain.toUpperCase()}</b>`;
  if (alert.address) t += `\n📍 <code>${alert.address}</code>`;
  if (alert.amount)  t += `\n🔥 Boost: <b>${fmtNum(alert.amount)}</b>`;
  if (alert.tvl)     t += `\n💰 TVL: <b>$${fmtNum(alert.tvl)}</b>`;
  if (alert.minted!=null)  t += `\n📦 Minted: <b>${fmtNum(alert.minted,0)}</b>`;
  if (alert.owners!=null)  t += `\n👥 Owners: <b>${fmtNum(alert.owners,0)}</b>`;
  if (alert.floor!=null)   t += `\n💎 Floor: <b>${alert.floor} ETH</b>`;
  if (alert.type==="wallet_new_token") {
    t += `\n👛 Wallet: <b>${alert.walletLabel||shorten(alert.address)}</b>`;
    t += `\n🪙 Token: <b>${alert.tokenName||"Unknown"}${alert.sym?` (${alert.sym})`:""}</b>`;
    if (alert.contract) t += `\n📄 Contract: <code>${alert.contract}</code>`;
    if (alert.hash) t += `\n🧾 <code>${alert.hash.slice(0,16)}…</code>`;
    if (alert.minters?.length) t += `\n👥 Minted by <b>${alert.minters.length}</b> tracked wallet${alert.minters.length>1?"s":""}: ${alert.minters.map(m=>m.label||shorten(m.address)).join(", ")}`;
  }
  if (alert.type==="wallet_nft_mint") {
    t += `\n👛 Wallet: <b>${alert.walletLabel||shorten(alert.address)}</b>`;
    t += `\n🖼️ Collection: <b>${alert.nftName||"Unknown"}</b>`;
    if (alert.tokenId!=null) t += `\n🔢 Token ID: <b>${alert.tokenId}</b>`;
    if (alert.contract) t += `\n📄 Contract: <code>${alert.contract}</code>`;
    if (alert.hash) t += `\n🧾 <code>${alert.hash.slice(0,16)}…</code>`;
    if (alert.minters?.length) t += `\n👥 Minted by <b>${alert.minters.length}</b> tracked wallet${alert.minters.length>1?"s":""}: ${alert.minters.map(m=>m.label||shorten(m.address)).join(", ")}`;
  }
  if (alert.links?.length) t += `\n🔗 ${alert.links.slice(0,3).map(l=>`<a href="${l.url}">${l.type||"link"}</a>`).join(" · ")}`;
  return t;
}

function buildDiscordEmbed(alert) {
  if (alert.type === "discover_whale") {
    if (alert.isNft) {
      return {
        title: "🐳 Whale NFT Buy Detected",
        color: 0x9945FF,
        description: `**${alert.name}**`,
        fields: [
          { name:"Chain", value: alert.chain?.toUpperCase(), inline:true },
          { name:"Price", value: `${alert.priceNative} ETH`, inline:true },
          { name:"Buyer", value: `\`${shorten(alert.address)}\``, inline:true },
          { name:"Contract", value: `\`${alert.contract?.slice(0,14)}…\``, inline:false },
        ],
        url: alert.chartUrl,
        footer: { text:"🦅 Raven Alpha · Whale Discovery" },
        timestamp: new Date().toISOString(),
      };
    }
    return {
      title: `🐳 Whale Buy — $${alert.sym}`,
      color: 0x00D4AA,
      description: `**Market Cap:** $${fmtNum(alert.marketCap)}`,
      fields: [
        { name:"Chain",    value: alert.chain?.toUpperCase(), inline:true },
        { name:"Buy Size", value: `$${fmtNum(alert.usdVal)}`, inline:true },
        { name:"Amount",   value: `${alert.tokenAmt} ${alert.sym}`, inline:true },
        { name:"Wallet",   value: `\`${shorten(alert.address)}\``, inline:true },
        { name:"Contract", value: `\`${alert.contract?.slice(0,14)}…\``, inline:true },
      ],
      url: alert.chartUrl,
      footer: { text:"🦅 Raven Alpha · Whale Discovery" },
      timestamp: new Date().toISOString(),
    };
  }
  const colors = { new_token:0xF5C843, boosted:0xFF5A5A, new_proto:0x00C896, new_nft:0x9945FF, wallet_new_token:0xF5C843, wallet_nft_mint:0x9945FF };
  const titles = { new_token:"🆕 New Token Detected", boosted:"🚀 Boosted Token Alert", new_proto:"📊 New Protocol Listed", new_nft:"🖼️ New NFT Mint Detected", wallet_new_token:"🆕 Wallet New Token", wallet_nft_mint:"🖼️ Wallet NFT Mint" };
  return {
    title: titles[alert.type] || "⚡ Alert",
    color: colors[alert.type] || 0xF5C843,
    description: `**${alert.name || "Unknown"}**`,
    fields: [
      alert.chain   && { name:"Chain",   value:alert.chain.toUpperCase(), inline:true },
      alert.address && { name:"Address", value:`\`${alert.address.slice(0,12)}…\``,  inline:true },
      alert.amount  && { name:"Boost",   value:String(fmtNum(alert.amount)), inline:true },
      alert.tvl     && { name:"TVL",     value:`$${fmtNum(alert.tvl)}`,     inline:true },
      alert.minted!=null && { name:"Minted", value:String(fmtNum(alert.minted,0)), inline:true },
      alert.owners!=null && { name:"Owners", value:String(fmtNum(alert.owners,0)), inline:true },
      alert.floor!=null  && { name:"Floor",  value:`${alert.floor} ETH`, inline:true },
      alert.type==="wallet_new_token" && { name:"Wallet", value: alert.walletLabel || shorten(alert.address), inline:true },
      alert.type==="wallet_new_token" && { name:"Token", value: `${alert.tokenName||"Unknown"}${alert.sym?` (${alert.sym})`:""}`, inline:true },
      alert.type==="wallet_new_token" && alert.hash && { name:"Tx", value:`\`${alert.hash.slice(0,16)}…\``, inline:false },
      alert.type==="wallet_nft_mint" && { name:"Wallet", value: alert.walletLabel || shorten(alert.address), inline:true },
      alert.type==="wallet_nft_mint" && { name:"Collection", value: alert.nftName||"Unknown", inline:true },
      alert.type==="wallet_nft_mint" && alert.tokenId!=null && { name:"Token ID", value:String(alert.tokenId), inline:true },
      alert.type==="wallet_nft_mint" && alert.hash && { name:"Tx", value:`\`${alert.hash.slice(0,16)}…\``, inline:false },
      (alert.type==="wallet_new_token" || alert.type==="wallet_nft_mint") && alert.minters?.length &&
        { name:`Minted by ${alert.minters.length} tracked wallet${alert.minters.length>1?"s":""}`, value: alert.minters.map(m=>m.label||shorten(m.address)).join(", ").slice(0,1000), inline:false },
    ].filter(Boolean),
    footer: { text:"🦅 Raven Alpha" },
    timestamp: new Date().toISOString(),
  };
}

// Send via Vercel API route (handles both TG + Discord server-side)
async function sendNotification(settings, alert) {
  const tgText   = buildTelegramText(alert);
  const dsEmbed  = buildDiscordEmbed(alert);

  const hasTG = settings.telegramToken && settings.telegramChatId;
  const hasDS = settings.discordWebhook;

  // Try Vercel API route (works in production)
  try {
    const r = await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({
        telegram_token:   hasTG ? settings.telegramToken  : undefined,
        chat_id:          hasTG ? settings.telegramChatId : undefined,
        message:          tgText,
        discord_webhook:  hasDS ? settings.discordWebhook : undefined,
        discord_embed:    dsEmbed,
      }),
    });
    if (r.ok) return { ok:true, via:"api" };
  } catch {}

  // Fallback: Discord direct (works from browser, CORS ok)
  if (hasDS) {
    try {
      const r = await fetch(settings.discordWebhook, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ username:"🦅 Raven Alpha", embeds:[dsEmbed] }),
      });
      if (r.ok) return { ok:true, via:"discord-direct" };
    } catch {}
  }

  return { ok:false };
}

// ── Alert polling engine ──────────────────────────────────────────
async function runAlertCheck(settings, alertConfig, seenRef, addLog) {
  const seen = seenRef.current;
  const newAlerts = [];

  // 1. New tokens
  if (alertConfig.new_token) {
    const tokens = await safe("https://api.dexscreener.com/token-profiles/latest/v1");
    if (Array.isArray(tokens)) {
      for (const t of tokens.slice(0, 20)) {
        const id = `tok_${t.tokenAddress}`;
        if (t.tokenAddress && !seen.has(id)) {
          seen.add(id);
          newAlerts.push({ type:"new_token", name:t.description||"New Token", chain:t.chainId, address:t.tokenAddress, links:t.links||[] });
        }
      }
    }
  }

  // 2. Boosted tokens
  if (alertConfig.boosted) {
    const boosted = await safe("https://api.dexscreener.com/token-boosts/top/v1");
    if (Array.isArray(boosted)) {
      for (const t of boosted.slice(0, 10)) {
        const id = `boost_${t.tokenAddress}`;
        if (t.tokenAddress && !seen.has(id)) {
          seen.add(id);
          newAlerts.push({ type:"boosted", name:t.description||"Boosted Token", chain:t.chainId, address:t.tokenAddress, amount:t.totalAmount });
        }
      }
    }
  }

  // 3. New protocols
  if (alertConfig.new_proto) {
    const protos = await safe("https://api.llama.fi/protocols");
    if (Array.isArray(protos)) {
      const newest = [...protos].sort((a,b)=>(b.listedAt||0)-(a.listedAt||0)).slice(0,5);
      for (const p of newest) {
        const id = `proto_${p.slug}`;
        if (p.slug && !seen.has(id)) {
          seen.add(id);
          newAlerts.push({ type:"new_proto", name:p.name, chain:(p.chains||[])[0], tvl:p.tvl });
        }
      }
    }
  }

  // 4. New NFT mints (Reservoir - checks eth + base, needs free key)
  if (alertConfig.new_nft && settings.reservoirKey) {
    for (const nc of NFT_CHAINS.slice(0, 2)) { // eth + base by default to save requests
      const res = await safe(`${nc.api}/collections/v7?sortBy=createdAt&limit=10`, {
        headers: { "x-api-key": settings.reservoirKey },
      });
      const cols = res?.collections || [];
      for (const c of cols) {
        const id = `nft_${nc.id}_${c.id}`;
        if (c.id && !seen.has(id)) {
          seen.add(id);
          newAlerts.push({
            type:"new_nft", name:c.name||"New Collection", chain:nc.id, address:c.id,
            minted: c.tokenCount, owners: c.ownerCount, floor: c.floorAsk?.price?.amount?.native,
          });
        }
      }
    }
  }

  // 5. Watched wallets — ONLY new-token buys & NFT mints (no generic transfer alerts)
  if (alertConfig.wallet_new_token || alertConfig.wallet_nft_mint) {
    const whales = store.get("at:whales") || [];
    const knownTokens = store.get("at:known_tokens") || {};
    let knownTokensChanged = false;
    // contract -> [{walletId,address,label}] — which watched wallets minted this contract
    const mintRegistry = store.get("at:mint_registry") || {};
    let mintRegistryChanged = false;
    const recordMinter = (chainId, contract, walletEntry) => {
      const key = `${chainId}:${(contract||"").toLowerCase()}`;
      const list = mintRegistry[key] || [];
      if (!list.some(m => m.walletId === walletEntry.walletId)) {
        list.push(walletEntry);
        mintRegistry[key] = list;
        mintRegistryChanged = true;
      }
      return mintRegistry[key];
    };

    for (const w of whales) {
      const chain = CHAINS.find(c => c.id === w.chain);
      if (!chain || chain.comingSoon || !ACTIVE_CHAIN_IDS.includes(chain.id)) continue;
      if (!settings[chain.key] && !chain.noKeyRequired) continue;

      // 5a. New token detection — alerts only the FIRST time a token contract ever
      // shows up incoming to this wallet (first run per wallet just builds the baseline,
      // it doesn't alert on tokens the wallet already held before tracking started).
      if (alertConfig.wallet_new_token) {
        const tokRes = await explorerFetch(chain, settings, { module:"account", action:"tokentx", address:w.address, sort:"desc", offset:15 });
        const isBaseline = !knownTokens[w.id];
        const seenTokens = new Set(knownTokens[w.id] || []);
        for (const tx of (tokRes?.result || [])) {
          const contract = (tx.contractAddress || "").toLowerCase();
          if (!contract || seenTokens.has(contract)) continue;
          seenTokens.add(contract);
          knownTokensChanged = true;
          const isIncoming = tx.to?.toLowerCase() === w.address.toLowerCase();
          if (isBaseline || !isIncoming) continue; // baseline run, or an outgoing tx — don't alert
          const id = `wnewtok_${w.id}_${contract}`;
          if (seen.has(id)) continue;
          seen.add(id);
          const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
          const minters = tx.from?.toLowerCase() === ZERO_ADDR
            ? recordMinter(w.chain, tx.contractAddress, { walletId:w.id, address:w.address, label:w.label })
            : [];
          newAlerts.push({
            type:"wallet_new_token", walletLabel:w.label, chain:w.chain, address:w.address, hash:tx.hash,
            tokenName: tx.tokenName || tx.tokenSymbol || "New Token", sym: tx.tokenSymbol || "", contract: tx.contractAddress,
            minters,
          });
        }
        knownTokens[w.id] = [...seenTokens];
      }

      // 5b. NFT mints received by this wallet (via chain explorer's tokennfttx — no Reservoir needed)
      if (alertConfig.wallet_nft_mint) {
        const ZERO = "0x0000000000000000000000000000000000000000";
        const nftTxRes = await explorerFetch(chain, settings, { module:"account", action:"tokennfttx", address:w.address, sort:"desc", offset:10 });
        for (const nft of (nftTxRes?.result || [])) {
          const isMint = nft.from?.toLowerCase() === ZERO && nft.to?.toLowerCase() === w.address.toLowerCase();
          if (!isMint) continue;
          const id = `wnftmint_${w.id}_${nft.hash}_${nft.tokenID}`;
          if (seen.has(id)) continue;
          seen.add(id);
          const minters = recordMinter(w.chain, nft.contractAddress, { walletId:w.id, address:w.address, label:w.label });
          newAlerts.push({
            type:"wallet_nft_mint", walletLabel:w.label, chain:w.chain, address:w.address, hash:nft.hash,
            nftName: nft.tokenName || "New Collection", tokenId: nft.tokenID, contract: nft.contractAddress,
            minters,
          });
        }
      }
    }
    if (knownTokensChanged) store.set("at:known_tokens", knownTokens);
    if (mintRegistryChanged) store.set("at:mint_registry", mintRegistry);
  }

  // 6. Whale Discovery — any new/trending coin, no saved address needed
  if (alertConfig.discover_whale) {
    const usdThreshold = Number(alertConfig.whaleUsdThreshold) || 10000;
    const nftEthThreshold = Number(alertConfig.nftWhaleEth) || 1;

    // 6a. Scan latest new + boosted tokens for big on-chain transfers
    const [newT, boostT] = await Promise.all([
      safe("https://api.dexscreener.com/token-profiles/latest/v1"),
      safe("https://api.dexscreener.com/token-boosts/top/v1"),
    ]);
    const candidates = [...(Array.isArray(newT)?newT:[]), ...(Array.isArray(boostT)?boostT:[])].slice(0, 10);

    for (const t of candidates) {
      const chain = CHAINS.find(c => c.id === t.chainId);
      if (!chain || chain.comingSoon || !ACTIVE_CHAIN_IDS.includes(chain.id) || !t.tokenAddress) continue;
      const key = settings[chain.key];
      if (!key) continue;

      const [transfers, pairData] = await Promise.all([
        explorerFetch(chain, settings, { module:"account", action:"tokentx", contractaddress:t.tokenAddress, sort:"desc", offset:8 }),
        safe(`https://api.dexscreener.com/latest/dex/tokens/${t.tokenAddress}`),
      ]);
      const pair = pairData?.pairs?.[0];
      const priceUsd = Number(pair?.priceUsd || 0);
      if (!priceUsd) continue;

      for (const tx of (transfers?.result || [])) {
        const id = `dwhale_${chain.id}_${tx.hash}`;
        if (seen.has(id)) continue;
        const amt = Number(tx.value || 0) / Math.pow(10, Number(tx.tokenDecimal || 18));
        const usdVal = amt * priceUsd;
        if (usdVal >= usdThreshold) {
          seen.add(id);
          newAlerts.push({
            type:"discover_whale", isNft:false, name: tx.tokenSymbol || pair?.baseToken?.symbol || "Token",
            chain: chain.id, address: tx.to, contract: t.tokenAddress, hash: tx.hash,
            usdVal: Math.round(usdVal), tokenAmt: amt.toFixed(2), sym: tx.tokenSymbol || "",
            marketCap: pair?.fdv || pair?.marketCap, chartUrl: pair?.url,
            direction: tx.from?.toLowerCase()===t.tokenAddress?.toLowerCase() ? "BOUGHT" : "TRANSFER",
          });
        }
      }
    }

    // 6b. Scan global recent NFT sales across supported chains
    if (settings.reservoirKey) {
      for (const nc of NFT_CHAINS.slice(0, 3)) {
        const sales = await safe(`${nc.api}/sales/v6?limit=20&sortDirection=desc`, { headers:{ "x-api-key": settings.reservoirKey } });
        for (const s of (sales?.sales || [])) {
          const priceNative = s.price?.amount?.native;
          const id = `dwhale_nft_${nc.id}_${s.txHash}_${s.token?.tokenId}`;
          if (priceNative >= nftEthThreshold && s.txHash && !seen.has(id)) {
            seen.add(id);
            newAlerts.push({
              type:"discover_whale", isNft:true, name: s.token?.collection?.name || "NFT Collection",
              chain: nc.id, address: s.to, hash: s.txHash, priceNative,
              contract: s.token?.contract, chartUrl: `https://www.opensea.io/assets/${nc.id}/${s.token?.contract}/${s.token?.tokenId}`,
            });
          }
        }
      }
    }
  }

  // Send alerts
  for (const alert of newAlerts.slice(0, 5)) {
    const res = await sendNotification(settings, alert);
    addLog({ ...alert, sentAt: new Date().toLocaleTimeString(), ok: res.ok, via: res.via });
  }

  // Persist seen set (cap at 500)
  const arr = [...seen];
  if (arr.length > 500) seen.clear(); arr.slice(-500).forEach(x => seen.add(x));
  store.set("at:seen", arr.slice(-500));
}

// ═══════════════════════════════════════════════════════════════
// 🔔 ALERTS TAB
// ═══════════════════════════════════════════════════════════════
function AlertsTab({ settings, alertConfig, setAlertConfig, running, nextIn, startPolling, stopPolling, log, clearLog }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");

  const testAlert = async () => {
    setTesting(true); setTestResult("");
    const testData = { type:"new_token", name:"🍌 Test Alert", chain:"eth", address:"0xTestAddress123", links:[] };
    const res = await sendNotification(settings, testData);
    setTestResult(res.ok ? `✓ Sent! (via ${res.via})` : "✗ Failed — Check Telegram token/chatId or Discord webhook");
    setTesting(false);
  };

  const hasTG = settings.telegramToken && settings.telegramChatId;
  const hasDS = settings.discordWebhook;
  const hasAny = hasTG || hasDS;

  const fmtCountdown = (s) => `${Math.floor(s/60)}m ${s%60}s`;

  return (
    <div>
      {/* Connection status */}
      <div style={P}>
        <div style={{ fontWeight:"700", fontSize:"14px", marginBottom:"14px" }}>📡 Connection Status</div>
        <div style={{ display:"flex", gap:"12px", flexWrap:"wrap" }}>
          {[
            { label:"Telegram", ok:hasTG, detail: hasTG ? `@bot + chatId ✓` : "Not configured" },
            { label:"Discord",  ok:hasDS, detail: hasDS ? "Webhook ✓" : "Not configured" },
          ].map(({ label, ok, detail }) => (
            <div key={label} style={{ flex:"1 1 180px", background: ok ? POS+"12" : LINE, border:`1px solid ${ok ? POS+"44" : LINE}`, borderRadius:"6px", padding:"12px" }}>
              <div style={{ fontWeight:"700", color: ok ? POS : DIM }}>{ok ? "● " : "○ "}{label}</div>
              <div style={{ fontSize:"11px", color:DIM, marginTop:"4px" }}>{detail}</div>
            </div>
          ))}
        </div>
        {!hasAny && (
          <div style={{ color:AMB, fontSize:"12px", marginTop:"12px" }}>
            ⚠ Settings tab me Telegram ya Discord configure karo pehle
          </div>
        )}
      </div>

      {/* Alert toggles */}
      <div style={P}>
        <div style={{ fontWeight:"700", fontSize:"14px", marginBottom:"14px" }}>⚡ Kya alert karna hai</div>
        {ALERT_TYPES.map(at => (
          <div key={at.id} style={{ ...RW }}>
            <div>
              <div style={{ fontWeight:"600", fontSize:"13px" }}>{at.label}</div>
              <div style={{ fontSize:"11px", color:DIM }}>{at.desc}</div>
            </div>
            <div onClick={() => setAlertConfig(prev => ({ ...prev, [at.id]: !prev[at.id] }))}
              style={{ width:"36px", height:"20px", borderRadius:"10px", cursor:"pointer", position:"relative",
                background: alertConfig[at.id] ? AMB : LINE, transition:"background 0.2s" }}>
              <div style={{ width:"14px", height:"14px", borderRadius:"50%", background:"white", position:"absolute",
                top:"3px", transition:"left 0.2s", left: alertConfig[at.id] ? "19px" : "3px" }} />
            </div>
          </div>
        ))}

        {/* Interval */}
        <div style={{ marginTop:"14px" }}>
          <label style={{ fontSize:"11px", color:DIM, display:"block", marginBottom:"6px" }}>Check interval (minutes)</label>
          <div style={{ display:"flex", gap:"8px" }}>
            {[5, 10, 15, 30].map(m => (
              <button key={m} onClick={() => setAlertConfig(prev => ({ ...prev, interval:m }))}
                style={{ ...BT, background: alertConfig.interval===m ? AMB : LINE, color: alertConfig.interval===m ? "#060A14" : DIM, padding:"5px 14px" }}>
                {m}m
              </button>
            ))}
          </div>
        </div>

        {/* Discovery thresholds - only relevant when discover_whale is on */}
        {alertConfig.discover_whale && (
          <div style={{ marginTop:"14px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
            <div>
              <label style={{ fontSize:"11px", color:DIM, display:"block", marginBottom:"6px" }}>🐳 Coin whale buy ≥ ($ USD)</label>
              <input type="number" min="0" step="1000" value={alertConfig.whaleUsdThreshold ?? 10000}
                onChange={e=>setAlertConfig(prev=>({...prev, whaleUsdThreshold:e.target.value}))} style={IN} placeholder="10000" />
            </div>
            <div>
              <label style={{ fontSize:"11px", color:DIM, display:"block", marginBottom:"6px" }}>🐳 NFT whale sale ≥ (ETH)</label>
              <input type="number" min="0" step="0.1" value={alertConfig.nftWhaleEth ?? 1}
                onChange={e=>setAlertConfig(prev=>({...prev, nftWhaleEth:e.target.value}))} style={IN} placeholder="1" />
            </div>
            <div style={{ gridColumn:"1 / -1", fontSize:"10px", color:DIM }}>
              Ye scanner har naye/trending token aur global NFT sales pe chalta hai — koi address save karne ki zaroorat nahi.
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display:"flex", gap:"10px", marginBottom:"12px", flexWrap:"wrap" }}>
        {!running ? (
          <button onClick={startPolling} disabled={!hasAny}
            style={{ ...BT, flex:"1", padding:"12px", opacity:hasAny?1:0.5, fontSize:"14px" }}>
            ▶ Start Monitoring
          </button>
        ) : (
          <button onClick={stopPolling}
            style={{ ...BT, flex:"1", padding:"12px", background:NEG, fontSize:"14px" }}>
            ⏹ Stop  ·  Next check in {fmtCountdown(nextIn)}
          </button>
        )}
        <button onClick={testAlert} disabled={!hasAny || testing}
          style={{ ...BT, background:LINE, color:TXT, padding:"12px 20px", opacity:hasAny?1:0.5 }}>
          {testing ? "Sending..." : "🧪 Test Alert"}
        </button>
      </div>

      {testResult && (
        <div style={{ ...P, borderColor: testResult.startsWith("✓") ? POS+"44" : NEG+"44",
          background: testResult.startsWith("✓") ? POS+"0A" : NEG+"0A", color: testResult.startsWith("✓") ? POS : NEG, fontSize:"12px" }}>
          {testResult}
        </div>
      )}

      {/* Alert log */}
      <div style={P}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"12px" }}>
          <div style={{ fontWeight:"700", fontSize:"14px" }}>📋 Alert Log ({log.length})</div>
          <button onClick={clearLog}
            style={{ ...BT, background:LINE, color:DIM, padding:"4px 12px", fontSize:"11px" }}>Clear</button>
        </div>
        {!log.length && <div style={{ color:DIM, fontSize:"12px" }}>Abhi koi alert nahi gaya</div>}
        {log.map((entry, i) => {
          const emoji = { new_token:"🆕", boosted:"🚀", new_proto:"📊", new_nft:"🖼️", wallet_new_token:"🆕", wallet_nft_mint:"🖼️", discover_whale:"🐳" }[entry.type] || "⚡";
          return (
            <div key={i} style={{ ...RW }}>
              <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                <span style={{ fontSize:"14px" }}>{emoji}</span>
                <div>
                  <div style={{ fontWeight:"600", fontSize:"12px" }}>{entry.name || entry.tokenName || entry.nftName}</div>
                  <div style={{ fontSize:"10px", color:DIM }}>{entry.chain && `${entry.chain.toUpperCase()} · `}{entry.sentAt}</div>
                  {entry.minters?.length > 0 && (
                    <div style={{ fontSize:"10px", color:AMB, marginTop:"2px" }}>
                      👥 {entry.minters.length} tracked wallet{entry.minters.length>1?"s":""} minted this: {entry.minters.map(m=>m.label||shorten(m.address)).join(", ")}
                    </div>
                  )}
                </div>
                {entry.chain && <span style={tagSt(chainColor(entry.chain))}>{entry.chain}</span>}
              </div>
              <span style={tagSt(entry.ok ? POS : NEG)}>{entry.ok ? "✓ sent" : "✗ fail"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 🔴 LIVE ALPHA
// ═══════════════════════════════════════════════════════════════
function LiveTab() {
  const [sub, setSub] = useState("new");
  const [newTokens, setNewTokens] = useState([]);
  const [boosted, setBoosted] = useState([]);
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [n, bo, tr] = await Promise.all([
      safe("https://api.dexscreener.com/token-profiles/latest/v1"),
      safe("https://api.dexscreener.com/token-boosts/top/v1"),
      safe("https://api.coingecko.com/api/v3/search/trending"),
    ]);
    setNewTokens(Array.isArray(n) ? n : []);
    setBoosted(Array.isArray(bo) ? bo : []);
    setTrending(tr?.coins || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"16px" }}>
        <SubTabs tabs={[["new","🆕 New Pairs"],["boosted","🚀 Boosted"],["heatmap","🔥 Heatmap"]]} active={sub} onChange={setSub} />
        <button onClick={load} style={{ ...BT, padding:"6px 12px", marginBottom:"16px" }}>↻</button>
      </div>
      {loading && <Spin />}

      {!loading && sub==="new" && (
        <>
          <div style={{ color:DIM, fontSize:"11px", fontFamily:MONO, marginBottom:"10px" }}>DexScreener — latest token profiles · No auth</div>
          {!newTokens.length && <Empty msg="No new tokens. Refresh karo." />}
          {newTokens.slice(0,30).map((t,i) => (
            <div key={i} style={{ ...P, padding:"12px 14px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ display:"flex", gap:"10px", alignItems:"center" }}>
                  {t.icon && <img src={t.icon} style={{ width:"28px", height:"28px", borderRadius:"50%" }} onError={e=>e.target.style.display="none"} alt="" />}
                  <div>
                    <div style={{ fontWeight:"600", fontSize:"13px" }}>{t.description||"New Token"}</div>
                    <div style={{ fontSize:"10px", color:DIM, fontFamily:MONO }}>{shorten(t.tokenAddress)}</div>
                  </div>
                  {t.chainId && <span style={tagSt(chainColor(t.chainId))}>{t.chainId}</span>}
                </div>
                <div style={{ display:"flex", gap:"6px" }}>
                  {(t.links||[]).slice(0,3).map((l,j) => (
                    <a key={j} href={l.url} target="_blank" rel="noreferrer"
                      style={{ fontSize:"10px", color:AMB, textDecoration:"none", background:AMB+"15", padding:"2px 8px", borderRadius:"3px" }}>{l.type||"link"}</a>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {!loading && sub==="boosted" && (
        <>
          <div style={{ color:DIM, fontSize:"11px", fontFamily:MONO, marginBottom:"10px" }}>🎯 Boosted = projects spending money → frontrunning signal</div>
          {!boosted.length && <Empty msg="No boosted tokens." />}
          {boosted.slice(0,30).map((t,i) => (
            <div key={i} style={{ ...P, padding:"12px 14px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ display:"flex", gap:"10px", alignItems:"center" }}>
                  {t.icon && <img src={t.icon} style={{ width:"28px", height:"28px", borderRadius:"50%" }} onError={e=>e.target.style.display="none"} alt="" />}
                  <div>
                    <div style={{ fontWeight:"600", fontSize:"13px" }}>{t.description||"Boosted Token"}</div>
                    <div style={{ fontSize:"10px", color:DIM, fontFamily:MONO }}>{shorten(t.tokenAddress)}</div>
                  </div>
                  {t.chainId && <span style={tagSt(chainColor(t.chainId))}>{t.chainId}</span>}
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ color:AMB, fontWeight:"700", fontFamily:MONO }}>🔥 {t.totalAmount ? fmtNum(t.totalAmount) : "—"}</div>
                  <div style={{ fontSize:"10px", color:DIM }}>boost score</div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {!loading && sub==="heatmap" && (
        <>
          <div style={{ color:DIM, fontSize:"11px", fontFamily:MONO, marginBottom:"12px" }}>CoinGecko trending heatmap</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(130px,1fr))", gap:"8px" }}>
            {trending.map((c,i) => {
              const coin = c.item;
              const chg = coin?.data?.price_change_percentage_24h?.usd || 0;
              const int = Math.min(Math.abs(chg)/20, 1);
              const bg = chg>=0 ? `rgba(0,200,150,${0.1+int*0.4})` : `rgba(255,90,90,${0.1+int*0.4})`;
              const bd = chg>=0 ? `1px solid rgba(0,200,150,${0.3+int*0.5})` : `1px solid rgba(255,90,90,${0.3+int*0.5})`;
              return (
                <div key={i} style={{ background:bg, border:bd, borderRadius:"6px", padding:"12px", textAlign:"center" }}>
                  <div style={{ fontSize:"10px", color:AMB, fontWeight:"700", fontFamily:MONO }}>#{i+1}</div>
                  {coin?.thumb && <img src={coin.thumb} style={{ width:"24px", height:"24px", borderRadius:"50%", margin:"4px auto", display:"block" }} alt="" />}
                  <div style={{ fontWeight:"700", fontSize:"12px", marginTop:"4px" }}>{coin?.symbol}</div>
                  <div style={{ fontFamily:MONO, fontSize:"12px", color:chg>=0?POS:NEG }}>{chg>=0?"+":""}{chg.toFixed(2)}%</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 👛 WALLETS
// ═══════════════════════════════════════════════════════════════
function WalletsTab({ settings }) {
  const [addr, setAddr] = useState("");
  const [chainId, setChainId] = useState("eth");
  const [txs, setTxs] = useState([]);
  const [tokTxs, setTokTxs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [sub, setSub] = useState("txs");
  const selectedChain = CHAINS.find(c => c.id === chainId);

  const lookup = async () => {
    if (!addr.trim()) return;
    setLoading(true); setErr(""); setTxs([]); setTokTxs([]);
    if (chainId === "solana") {
      if (!settings.heliusKey) { setErr("Helius API key chahiye Settings me"); setLoading(false); return; }
      const res = await safe(`https://api.helius.xyz/v0/addresses/${addr.trim()}/transactions?api-key=${settings.heliusKey}&limit=20`);
      setTxs(Array.isArray(res) ? res : []);
    } else {
      const key = settings[selectedChain?.key];
      if (!key && !selectedChain?.noKeyRequired) { setErr(`${selectedChain?.name} API key chahiye → ${selectedChain?.site}`); setLoading(false); return; }
      const [txRes, tokRes] = await Promise.all([
        explorerFetch(selectedChain, settings, { module:"account", action:"txlist", address:addr.trim(), sort:"desc", offset:25 }),
        explorerFetch(selectedChain, settings, { module:"account", action:"tokentx", address:addr.trim(), sort:"desc", offset:25 }),
      ]);
      if (!txRes) { setErr("Error — API key ya address check karo"); setLoading(false); return; }
      setTxs(txRes.result || []);
      setTokTxs(tokRes?.result || []);
    }
    setLoading(false);
  };

  const tokenMap = tokTxs.reduce((acc, t) => {
    const sym = t.tokenSymbol || "?";
    if (!acc[sym]) acc[sym] = { sym, name:t.tokenName, count:0, contract:t.contractAddress };
    acc[sym].count++;
    return acc;
  }, {});

  return (
    <div>
      <div style={P}>
        <div style={{ display:"flex", gap:"6px", flexWrap:"wrap", marginBottom:"12px" }}>
          {ACTIVE_CHAINS.map(c => (
            <button key={c.id} disabled={c.comingSoon} title={c.comingSoon ? c.comingSoonNote : ""}
              onClick={() => !c.comingSoon && setChainId(c.id)} style={{ ...BT, padding:"5px 12px", fontSize:"11px",
              background: chainId===c.id ? c.color : LINE, color: chainId===c.id ? "#060A14" : DIM,
              border:`1px solid ${chainId===c.id ? c.color : LINE}`, opacity: c.comingSoon ? 0.4 : 1,
              cursor: c.comingSoon ? "not-allowed" : "pointer" }}>{c.name}{c.comingSoon ? " 🔜" : ""}</button>
          ))}
        </div>
        <div style={{ display:"flex", gap:"10px" }}>
          <input value={addr} onChange={e=>setAddr(e.target.value)} onKeyDown={e=>e.key==="Enter"&&lookup()}
            style={{ ...IN, flex:1 }} placeholder={chainId==="solana"?"Solana address...":"0x wallet address..."} />
          <button onClick={lookup} style={BT}>Track</button>
        </div>
        {err && <div style={{ color:NEG, fontSize:"12px", marginTop:"8px" }}>⚠ {err}</div>}
      </div>
      {loading && <Spin />}
      {!loading && (txs.length > 0 || tokTxs.length > 0) && (
        <>
          <SubTabs tabs={[["txs","Transactions"],["tokens","Token Activity"]]} active={sub} onChange={setSub} />
          {sub==="txs" && txs.map((tx,i) => {
            if (chainId === "solana") return (
              <div key={i} style={{ ...P, padding:"10px 14px" }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontSize:"11px", fontFamily:MONO, color:AMB }}>{shorten(tx.signature)}</div>
                    <div style={{ fontSize:"10px", color:DIM }}>{tx.type||"transaction"}</div>
                  </div>
                  <div style={{ fontSize:"10px", color:DIM }}>{tx.timestamp ? new Date(tx.timestamp*1000).toLocaleString() : ""}</div>
                </div>
              </div>
            );
            const isIn = tx.to?.toLowerCase() === addr.toLowerCase();
            const val = tx.value ? (Number(tx.value)/1e18).toFixed(5) : "0";
            return (
              <div key={i} style={{ ...P, padding:"10px 14px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                    <span style={{ color:isIn?POS:NEG, fontSize:"11px", fontWeight:"700" }}>{isIn?"↙ IN":"↗ OUT"}</span>
                    <div>
                      <div style={{ fontSize:"11px", fontFamily:MONO, color:AMB }}>{shorten(tx.hash)}</div>
                      <div style={{ fontSize:"10px", color:DIM }}>{isIn?`from ${shorten(tx.from)}`:`to ${shorten(tx.to)}`}</div>
                    </div>
                    {tx.isError==="1" && <span style={tagSt(NEG)}>FAILED</span>}
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontFamily:MONO, fontSize:"12px", color:isIn?POS:NEG }}>{val} {selectedChain?.sym}</div>
                    <div style={{ fontSize:"10px", color:DIM }}>{tx.timeStamp ? new Date(tx.timeStamp*1000).toLocaleString() : ""}</div>
                  </div>
                </div>
              </div>
            );
          })}
          {sub==="tokens" && Object.values(tokenMap).sort((a,b)=>b.count-a.count).map((t,i) => (
            <div key={i} style={RW}>
              <div>
                <div style={{ fontWeight:"600", fontSize:"12px" }}>{t.name||t.sym}</div>
                <div style={{ fontSize:"10px", color:DIM, fontFamily:MONO }}>{shorten(t.contract)}</div>
              </div>
              <span style={tagSt("#9945FF")}>{t.count} txs</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 💻 GITHUB
// ═══════════════════════════════════════════════════════════════
const GH_PRESETS = [
  {label:"DeFi Bridge",q:"defi bridge solidity"},{label:"New Chain",q:"evm chain layer new"},
  {label:"Lending",q:"lending protocol"},{label:"DEX/AMM",q:"dex amm swap solidity"},
  {label:"ZK Rollup",q:"zk rollup prover"},{label:"Restaking",q:"restaking eigenlayer"},
  {label:"NFT 721",q:"ERC721 nft marketplace"},{label:"Solana",q:"solana anchor program rust"},
];

function GitHubTab({ settings }) {
  const [query, setQuery] = useState("defi bridge new");
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState("created");

  const search = async (q=query, s=sort) => {
    setLoading(true);
    const opts = settings.githubToken ? { headers:{ Authorization:`Bearer ${settings.githubToken}` } } : {};
    const res = await safe(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=${s}&order=desc&per_page=20`, opts);
    setRepos(res?.items || []);
    setLoading(false);
  };

  useEffect(() => { search(); }, []);

  return (
    <div>
      <div style={P}>
        <div style={{ display:"flex", gap:"10px", marginBottom:"10px" }}>
          <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()}
            style={{ ...IN, flex:1 }} placeholder="Search DeFi repos..." />
          <select value={sort} onChange={e=>{setSort(e.target.value);search(query,e.target.value);}} style={{ ...IN, width:"130px", cursor:"pointer" }}>
            <option value="created">Newest</option>
            <option value="updated">Recent</option>
            <option value="stars">Stars</option>
          </select>
          <button onClick={()=>search()} style={BT}>Search</button>
        </div>
        <div style={{ display:"flex", gap:"6px", flexWrap:"wrap" }}>
          {GH_PRESETS.map(p => <button key={p.q} onClick={()=>{setQuery(p.q);search(p.q);}} style={{ ...BT, background:LINE, color:DIM, padding:"4px 10px", fontSize:"11px" }}>{p.label}</button>)}
        </div>
      </div>
      {loading && <Spin />}
      {!loading && repos.map((r,i) => (
        <div key={i} style={{ ...P, padding:"12px 14px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ flex:1 }}>
              <a href={r.html_url} target="_blank" rel="noreferrer" style={{ color:AMB, textDecoration:"none", fontWeight:"700", fontSize:"13px" }}>{r.full_name}</a>
              <div style={{ fontSize:"11px", color:DIM, marginTop:"3px" }}>{r.description||"No description"}</div>
              <div style={{ display:"flex", gap:"6px", marginTop:"6px", flexWrap:"wrap" }}>
                {r.language && <span style={tagSt("#627EEA")}>{r.language}</span>}
                <span style={tagSt(AMB)}>⭐ {fmtNum(r.stargazers_count)}</span>
                <span style={tagSt("#9945FF")}>🍴 {fmtNum(r.forks_count)}</span>
              </div>
            </div>
            <div style={{ textAlign:"right", fontSize:"10px", color:DIM, flexShrink:0, marginLeft:"12px" }}>
              <div>Created: {new Date(r.created_at).toLocaleDateString()}</div>
              <div>Updated: {new Date(r.updated_at).toLocaleDateString()}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 📊 CHAINS
// ═══════════════════════════════════════════════════════════════
function ChainsTab() {
  const [protocols, setProtocols] = useState([]);
  const [chains, setChains] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sub, setSub] = useState("gainers");

  const load = useCallback(async () => {
    setLoading(true);
    const [p, c] = await Promise.all([safe("https://api.llama.fi/protocols"), safe("https://api.llama.fi/chains")]);
    setProtocols(p || []);
    setChains((c||[]).sort((a,b)=>(b.tvl||0)-(a.tvl||0)));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  const gainers = [...protocols].filter(p=>p.change_1d!=null).sort((a,b)=>b.change_1d-a.change_1d).slice(0,25);
  const newest  = [...protocols].sort((a,b)=>(b.listedAt||0)-(a.listedAt||0)).slice(0,25);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"16px" }}>
        <SubTabs tabs={[["gainers","📈 Gainers"],["newest","🆕 Newest"],["chains","🌐 Chains"]]} active={sub} onChange={setSub} />
        <button onClick={load} style={{ ...BT, padding:"6px 12px", marginBottom:"16px" }}>↻</button>
      </div>
      {loading && <Spin />}
      {!loading && (sub==="gainers"?gainers:sub==="newest"?newest:chains.slice(0,30)).map((p,i) => (
        <div key={i} style={RW}>
          <div style={{ display:"flex", gap:"10px", alignItems:"center" }}>
            {p.logo && <img src={p.logo} style={{ width:"22px", height:"22px", borderRadius:"50%" }} onError={e=>e.target.style.display="none"} alt="" />}
            <div>
              <div style={{ fontWeight:"600", fontSize:"13px" }}>{p.name}</div>
              <div style={{ fontSize:"10px", color:DIM }}>{p.category || `Chain ID: ${p.chainId||"—"}`}</div>
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontFamily:MONO, fontSize:"12px" }}>${fmtNum(p.tvl)}</div>
            {p.change_1d!=null && <div style={{ fontSize:"10px", fontFamily:MONO, color:p.change_1d>=0?POS:NEG }}>{p.change_1d>=0?"+":""}{p.change_1d?.toFixed(1)}%</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 🔍 SEARCH
// ═══════════════════════════════════════════════════════════════
function SearchTab() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const FILTERS = ["new meme","bridge","staking","lending","nft","ai","gaming","rwa","launchpad"];
  const search = async (query=q) => {
    if (!query.trim()) return;
    setLoading(true);
    const res = await safe(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`);
    setResults((res?.pairs||[]).sort((a,b)=>(b.volume?.h24||0)-(a.volume?.h24||0)));
    setLoading(false);
  };
  return (
    <div>
      <div style={P}>
        <div style={{ display:"flex", gap:"10px", marginBottom:"10px" }}>
          <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()}
            style={{ ...IN, flex:1 }} placeholder="Token name, symbol, address, keyword..." />
          <button onClick={()=>search()} style={BT}>Search</button>
        </div>
        <div style={{ display:"flex", gap:"6px", flexWrap:"wrap" }}>
          {FILTERS.map(f => <button key={f} onClick={()=>{setQ(f);search(f);}} style={{ ...BT, background:LINE, color:DIM, padding:"4px 10px", fontSize:"11px" }}>{f}</button>)}
        </div>
      </div>
      {loading && <Spin />}
      {!loading && results.length > 0 && results.slice(0,25).map((p,i) => {
        const chg = p.priceChange?.h24;
        return (
          <div key={i} style={{ ...P, padding:"12px 14px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontWeight:"700", fontSize:"13px" }}>{p.baseToken?.symbol}/{p.quoteToken?.symbol}</div>
                <div style={{ fontSize:"11px", color:DIM }}>{p.baseToken?.name}</div>
                <div style={{ display:"flex", gap:"6px", marginTop:"5px" }}>
                  {p.chainId && <span style={tagSt(chainColor(p.chainId))}>{p.chainId}</span>}
                  {p.dexId && <span style={tagSt("#9945FF")}>{p.dexId}</span>}
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontFamily:MONO, fontSize:"13px", fontWeight:"600" }}>{p.priceUsd?`$${Number(p.priceUsd).toFixed(6)}`:"—"}</div>
                {chg!=null && <div style={{ fontSize:"11px", fontFamily:MONO, color:Number(chg)>=0?POS:NEG }}>{Number(chg)>=0?"+":""}{chg}% 24h</div>}
                <div style={{ fontSize:"10px", color:DIM }}>Vol: ${fmtNum(p.volume?.h24)}</div>
                <div style={{ fontSize:"10px", color:DIM }}>Liq: ${fmtNum(p.liquidity?.usd)}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 🖼️ NFT TRACKER
// ═══════════════════════════════════════════════════════════════
function NFTsTab({ settings }) {
  const [chainId, setChainId] = useState("eth");
  const [cols, setCols] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const chain = NFT_CHAINS.find(c => c.id === chainId);

  const load = useCallback(async () => {
    if (!settings.reservoirKey) { setErr("Reservoir API key chahiye Settings me (free)"); return; }
    setErr(""); setLoading(true);
    const res = await safe(`${chain.api}/collections/v7?sortBy=createdAt&limit=25`, {
      headers: { "x-api-key": settings.reservoirKey },
    });
    if (!res) { setErr("Error — key ya rate limit check karo"); setLoading(false); return; }
    setCols(res.collections || []);
    setLoading(false);
  }, [chainId, settings.reservoirKey]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={P}>
        <div style={{ display:"flex", gap:"6px", flexWrap:"wrap", marginBottom:"12px" }}>
          {NFT_CHAINS.map(c => (
            <button key={c.id} onClick={() => setChainId(c.id)} style={{ ...BT, padding:"5px 12px", fontSize:"11px",
              background: chainId===c.id ? c.color : LINE, color: chainId===c.id ? "#060A14" : DIM,
              border:`1px solid ${chainId===c.id ? c.color : LINE}` }}>{c.name}</button>
          ))}
          <button onClick={load} style={{ ...BT, padding:"5px 12px", fontSize:"11px", marginLeft:"auto" }}>↻</button>
        </div>
        <div style={{ color:DIM, fontSize:"11px", fontFamily:MONO }}>Reservoir — freshly created collections · needs free key</div>
      </div>

      {err && <div style={{ color:NEG, fontSize:"12px", marginBottom:"12px" }}>⚠ {err}</div>}
      {loading && <Spin />}
      {!loading && !err && !cols.length && <Empty msg="Koi collection nahi mili." />}

      {!loading && cols.map((c,i) => (
        <div key={i} style={{ ...P, padding:"12px 14px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ display:"flex", gap:"10px", alignItems:"center" }}>
              {c.image && <img src={c.image} style={{ width:"36px", height:"36px", borderRadius:"6px" }} onError={e=>e.target.style.display="none"} alt="" />}
              <div>
                <div style={{ fontWeight:"600", fontSize:"13px" }}>{c.name || "Unnamed Collection"}</div>
                <div style={{ fontSize:"10px", color:DIM, fontFamily:MONO }}>{shorten(c.id)}</div>
              </div>
              <span style={tagSt(chain.color)}>{chain.name}</span>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontFamily:MONO, fontSize:"12px" }}>📦 {fmtNum(c.tokenCount,0)} minted</div>
              <div style={{ fontSize:"10px", color:DIM }}>👥 {fmtNum(c.ownerCount,0)} owners</div>
              {c.floorAsk?.price?.amount?.native!=null && (
                <div style={{ fontSize:"10px", color:AMB }}>💎 {c.floorAsk.price.amount.native} ETH floor</div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 🐋 WHALE TRACKER
// ═══════════════════════════════════════════════════════════════
function WhalesTab({ settings }) {
  const [whales, setWhales] = useState(store.get("at:whales") || []);
  const [addr, setAddr] = useState("");
  const [chainId, setChainId] = useState("eth");
  const [label, setLabel] = useState("");
  const [serverSynced, setServerSynced] = useState(null); // null=checking, true/false=result
  const [busy, setBusy] = useState(false);

  // On mount, pull the server-side (KV) wallet list if the 24/7 background
  // scanner is set up — that's the source of truth once deployed, since it's
  // shared between every browser AND the always-on scanner itself.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/wallets");
        if (!r.ok) throw new Error("no server list");
        const j = await r.json();
        setWhales(j.wallets || []);
        store.set("at:whales", j.wallets || []);
        setServerSynced(true);
      } catch {
        setServerSynced(false); // fall back to local-only (e.g. running `npm run dev` without KV)
      }
    })();
  }, []);

  const persist = (next) => { setWhales(next); store.set("at:whales", next); };

  const addWhale = async () => {
    if (!addr.trim()) return;
    const chain = CHAINS.find(c => c.id === chainId);
    if (chain?.comingSoon) return;
    setBusy(true);
    if (serverSynced) {
      try {
        const r = await fetch("/api/wallets", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: addr.trim(), chain: chainId, label: label.trim() || undefined }),
        });
        const j = await r.json();
        if (j.wallets) persist(j.wallets);
      } catch {}
    } else {
      const entry = { id: `${chainId}_${addr.trim()}_${Date.now()}`, address: addr.trim(), chain: chainId, label: label.trim() || shorten(addr.trim()) };
      persist([entry, ...whales]);
    }
    setAddr(""); setLabel(""); setBusy(false);
  };

  const removeWhale = async (id) => {
    if (serverSynced) {
      try {
        const r = await fetch(`/api/wallets?id=${encodeURIComponent(id)}`, { method: "DELETE" });
        const j = await r.json();
        if (j.wallets) { persist(j.wallets); return; }
      } catch {}
    }
    persist(whales.filter(w => w.id !== id));
  };

  return (
    <div>
      <div style={P}>
        <div style={{ fontWeight:"700", fontSize:"14px", marginBottom:"14px" }}>🐋 Wallet Watch-list</div>
        <div style={{ fontSize:"11px", color:DIM, marginBottom:"14px", lineHeight:"1.7" }}>
          Jis bhi wallet ko track karna hai uska address daalo. Koi threshold nahi — jaise hi wallet koi <b style={{ color:TXT }}>naya token pehli baar receive</b> karega ya <b style={{ color:TXT }}>naya NFT mint</b> karega, Telegram/Discord pe alert aa jayega. Generic transfers pe alert nahi aata.
        </div>
        {serverSynced === true && (
          <div style={{ fontSize:"11px", color:POS, marginBottom:"12px" }}>🟢 24/7 server scanner se connected — jo bhi wallet yahan add/remove karoge, wo Vercel pe chal rahe background scan mein bhi turant reflect hoga.</div>
        )}
        {serverSynced === false && (
          <div style={{ fontSize:"11px", color:AMB, marginBottom:"12px" }}>⚠ Server scanner (KV) abhi connect nahi hai — ye list sirf isi browser mein save ho rahi hai. 24/7 background alerts ke liye Vercel pe KV database connect karo (README dekho).</div>
        )}
        <div style={{ display:"flex", gap:"6px", flexWrap:"wrap", marginBottom:"10px" }}>
          {ACTIVE_CHAINS.map(c => (
            <button key={c.id} disabled={c.comingSoon} title={c.comingSoon ? c.comingSoonNote : ""}
              onClick={() => !c.comingSoon && setChainId(c.id)} style={{ ...BT, padding:"5px 12px", fontSize:"11px",
              background: chainId===c.id ? c.color : LINE, color: chainId===c.id ? "#060A14" : DIM,
              border:`1px solid ${chainId===c.id ? c.color : LINE}`, opacity: c.comingSoon ? 0.4 : 1,
              cursor: c.comingSoon ? "not-allowed" : "pointer" }}>{c.name}{c.comingSoon ? " 🔜" : ""}</button>
          ))}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr auto", gap:"8px" }}>
          <input value={addr} onChange={e=>setAddr(e.target.value)} style={IN} placeholder="0x wallet address..." />
          <input value={label} onChange={e=>setLabel(e.target.value)} style={IN} placeholder="Label (optional)" />
          <button onClick={addWhale} disabled={busy} style={{ ...BT, opacity: busy?0.6:1 }}>{busy ? "..." : "+ Add"}</button>
        </div>
      </div>

      <div style={P}>
        <div style={{ fontWeight:"700", fontSize:"14px", marginBottom:"12px" }}>👁 Watching ({whales.length})</div>
        {!whales.length && <Empty msg="Koi wallet watch me nahi hai. Upar se add karo." />}
        {whales.map(w => {
          const chain = CHAINS.find(c => c.id === w.chain);
          return (
            <div key={w.id} style={{ ...RW }}>
              <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                <span style={tagSt(chain?.color || "#718096")}>{chain?.name || w.chain}</span>
                <div>
                  <div style={{ fontWeight:"600", fontSize:"12px" }}>{w.label}</div>
                  <div style={{ fontSize:"10px", color:DIM, fontFamily:MONO }}>{shorten(w.address)}</div>
                </div>
              </div>
              <button onClick={() => removeWhale(w.id)} style={{ ...BT, background:LINE, color:NEG, padding:"4px 10px", fontSize:"11px" }}>Remove</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ⚙️ SETTINGS
// ═══════════════════════════════════════════════════════════════
function SettingsTab({ settings, onSave }) {
  const [loc, setLoc] = useState(settings);
  const [saved, setSaved] = useState(false);
  useEffect(()=>setLoc(settings),[settings]);
  const save = () => { onSave(loc); setSaved(true); setTimeout(()=>setSaved(false),2000); };

  return (
    <div>
      {/* Telegram */}
      <div style={P}>
        <div style={{ fontWeight:"700", fontSize:"14px", color:"#27A7E1", marginBottom:"14px" }}>✈ Telegram Setup</div>
        <div style={{ fontSize:"11px", color:DIM, marginBottom:"14px", lineHeight:"1.7" }}>
          1. Telegram me <b style={{ color:TXT }}>@BotFather</b> ko message karo → /newbot → bot banao → token copy karo<br/>
          2. Apna bot start karo → <b style={{ color:TXT }}>@userinfobot</b> ko message karo → apna Chat ID milega<br/>
          3. Dono yahan paste karo
        </div>
        {[
          { key:"telegramToken",  label:"Bot Token",  ph:"110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw..." },
          { key:"telegramChatId", label:"Chat ID",    ph:"123456789" },
        ].map(({key,label,ph}) => (
          <div key={key} style={{ marginBottom:"12px" }}>
            <label style={{ display:"block", fontSize:"11px", color:DIM, marginBottom:"5px" }}>{label}</label>
            <input value={loc[key]||""} onChange={e=>setLoc({...loc,[key]:e.target.value})} style={IN} placeholder={ph} type="password" />
          </div>
        ))}
      </div>

      {/* Discord */}
      <div style={P}>
        <div style={{ fontWeight:"700", fontSize:"14px", color:"#5865F2", marginBottom:"14px" }}>💬 Discord Setup</div>
        <div style={{ fontSize:"11px", color:DIM, marginBottom:"14px", lineHeight:"1.7" }}>
          1. Discord me apna server open karo<br/>
          2. Channel settings → <b style={{ color:TXT }}>Integrations</b> → <b style={{ color:TXT }}>Webhooks</b> → New Webhook<br/>
          3. Webhook URL copy karo → yahan paste karo
        </div>
        <label style={{ display:"block", fontSize:"11px", color:DIM, marginBottom:"5px" }}>Webhook URL</label>
        <input value={loc.discordWebhook||""} onChange={e=>setLoc({...loc,discordWebhook:e.target.value})}
          style={IN} placeholder="https://discord.com/api/webhooks/..." type="password" />
      </div>

      {/* EVM keys */}
      <div style={P}>
        <div style={{ fontWeight:"700", fontSize:"14px", color:AMB, marginBottom:"14px" }}>EVM Explorer Keys (free) — sirf active chains</div>
        <div style={{ fontSize:"11px", color:DIM, marginBottom:"14px", lineHeight:"1.7" }}>
          Multi-RPC failover: ek se zyada free keys ko <b style={{ color:TXT }}>comma se separate</b> karke daal sakte ho (e.g. <code>KEY1,KEY2,KEY3</code>). Jab pehli key rate-limit hit karegi, app apne aap agli key try karegi.
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
          {ACTIVE_CHAINS.map(c => (
            <div key={c.key}>
              <label style={{ display:"block", fontSize:"11px", marginBottom:"5px" }}>
                <span style={{ color:c.color, fontWeight:"700" }}>● </span>{c.name}
                {c.comingSoon && <span style={{ color:AMB, fontSize:"10px" }}> · 🔜 {c.comingSoonNote}</span>}
                {c.noKeyRequired && !c.comingSoon && <span style={{ color:POS, fontSize:"10px" }}> · optional (Blockscout, key ke bina bhi chalega)</span>}
              </label>
              <input value={loc[c.key]||""} onChange={e=>setLoc({...loc,[c.key]:e.target.value})}
                style={IN} placeholder={`${c.site} · KEY1,KEY2,...`} type="text" disabled={c.comingSoon} />
            </div>
          ))}
        </div>
      </div>

      {/* NFT Tracker */}
      <div style={P}>
        <div style={{ fontWeight:"700", fontSize:"14px", color:"#9945FF", marginBottom:"14px" }}>🖼️ NFT Tracker (free)</div>
        <div style={{ fontSize:"11px", color:DIM, marginBottom:"14px", lineHeight:"1.7" }}>
          1. <b style={{ color:TXT }}>reservoir.tools</b> pe jao → free API key generate karo (no card needed)<br/>
          2. Key yahan paste karo — NFT tab aur NFT alerts dono ke liye use hogi
        </div>
        <label style={{ display:"block", fontSize:"11px", color:DIM, marginBottom:"5px" }}>Reservoir API Key</label>
        <input value={loc.reservoirKey||""} onChange={e=>setLoc({...loc,reservoirKey:e.target.value})}
          style={IN} placeholder="reservoir.tools → free key" type="password" />
      </div>

      {/* Solana + GitHub */}
      <div style={P}>
        <div style={{ fontWeight:"700", fontSize:"14px", color:"#9945FF", marginBottom:"14px" }}>Solana + GitHub</div>
        {[
          { key:"heliusKey",   label:"Helius (Solana)", ph:"helius.dev → free key" },
          { key:"githubToken", label:"GitHub Token",    ph:"github.com/settings/tokens → no scopes" },
        ].map(({key,label,ph}) => (
          <div key={key} style={{ marginBottom:"12px" }}>
            <label style={{ display:"block", fontSize:"11px", color:DIM, marginBottom:"5px" }}>{label}</label>
            <input value={loc[key]||""} onChange={e=>setLoc({...loc,[key]:e.target.value})} style={IN} placeholder={ph} type="password" />
          </div>
        ))}
      </div>

      <button onClick={save} style={{ ...BT, width:"100%", padding:"12px", fontSize:"14px" }}>
        {saved ? "✓ All keys saved!" : "Save All"}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 🍌 MAIN APP
// ═══════════════════════════════════════════════════════════════
const DEFAULT_SETTINGS = {
  telegramToken:"", telegramChatId:"", discordWebhook:"",
  ethKey:"", bscKey:"", polyKey:"", baseKey:"", arbKey:"", optKey:"", avaxKey:"", rhKey:"", arcKey:"",
  heliusKey:"", githubToken:"", reservoirKey:""
};
const DEFAULT_ALERT_CONFIG = { new_token:false, boosted:false, new_proto:false, new_nft:false, wallet_new_token:true, wallet_nft_mint:true, discover_whale:false, whaleUsdThreshold:10000, nftWhaleEth:1, interval:5 };

const TABS = [
  ["live","🔴 Live"],["wallets","👛 Wallets"],["nfts","🖼️ NFTs"],["whales","🐋 Whales"],["github","💻 GitHub"],
  ["chains","📊 Chains"],["search","🔍 Search"],
  ["alerts","🔔 Alerts"],["settings","⚙️ Settings"],
];

export default function AlphaTerminal() {
  const [tab, setTab] = useState("live");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [alertConfig, setAlertConfig] = useState(DEFAULT_ALERT_CONFIG);

  useEffect(() => {
    const s = store.get("at:settings");
    if (s) setSettings({...DEFAULT_SETTINGS,...s});
    const a = store.get("at:alerts");
    if (a) setAlertConfig({...DEFAULT_ALERT_CONFIG,...a});

    // One-time seed: bulk-imported wallet watch-list (runs only once ever)
    if (!store.get("at:seed_v1_done")) {
      const existing = store.get("at:whales") || [];
      const existingKeys = new Set(existing.map(w => `${w.chain}_${w.address.toLowerCase()}`));
      const seeded = [];
      SEED_WALLET_CHAINS.forEach(chainId => {
        SEED_WALLETS.forEach(address => {
          const key = `${chainId}_${address.toLowerCase()}`;
          if (existingKeys.has(key)) return;
          existingKeys.add(key);
          seeded.push({ id: `${chainId}_${address}_seed`, address, chain: chainId, label: shorten(address), threshold: null });
        });
      });
      if (seeded.length) store.set("at:whales", [...existing, ...seeded]);
      store.set("at:seed_v1_done", true);
    }
  }, []);

  const saveSettings = (s) => { setSettings(s); store.set("at:settings", s); };
  const saveAlertConfig = (fn) => {
    setAlertConfig(prev => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      store.set("at:alerts", next);
      return next;
    });
  };

  // ── Background alert polling — lives here (not inside AlertsTab) so it keeps
  // running even when the user switches to a different tab. ──────────────────
  const [log, setLog] = useState(store.get("at:log") || []);
  const [running, setRunning] = useState(false);
  const [nextIn, setNextIn] = useState(0);
  const seenRef = useRef(new Set(store.get("at:seen") || []));
  const timerRef = useRef(null);
  const countRef = useRef(0);
  const settingsRef = useRef(settings);
  const alertConfigRef = useRef(alertConfig);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { alertConfigRef.current = alertConfig; }, [alertConfig]);

  const addLog = (entry) => {
    setLog(prev => {
      const updated = [entry, ...prev].slice(0, 50);
      store.set("at:log", updated);
      return updated;
    });
  };
  const clearLog = () => { setLog([]); store.set("at:log", []); };

  // Countdown display (only ticks the label — the actual poll runs off setInterval below)
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => {
      countRef.current = Math.max(0, countRef.current - 1);
      setNextIn(countRef.current);
    }, 1000);
    return () => clearInterval(tick);
  }, [running]);

  const startPolling = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const intervalSec = (alertConfigRef.current.interval || 10) * 60;
    countRef.current = intervalSec;
    setNextIn(intervalSec);
    setRunning(true);
    // Run immediately, then loop forever on the configured interval — keeps going
    // regardless of which tab is open since this lives in the top-level component.
    runAlertCheck(settingsRef.current, alertConfigRef.current, seenRef, addLog);
    timerRef.current = setInterval(() => {
      countRef.current = (alertConfigRef.current.interval || 10) * 60;
      runAlertCheck(settingsRef.current, alertConfigRef.current, seenRef, addLog);
    }, intervalSec * 1000);
  };

  const stopPolling = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setRunning(false);
  };

  // Only clear the interval when the whole app unmounts (page close/refresh), not on tab switch
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  return (
    <div style={{ fontFamily:"system-ui,sans-serif", background:BG, color:TXT, minHeight:"100vh", fontSize:"13px" }}>
      <div style={{ background:CARD, padding:"0 20px", borderBottom:`1px solid ${LINE}`, display:"flex", justifyContent:"space-between", alignItems:"center", height:"52px" }}>
        <div style={{ fontWeight:"800", fontSize:"16px", color:AMB }}>🦅 Raven Alpha</div>
        <div style={{ fontSize:"10px", color:DIM, fontFamily:MONO }}>
          {running && <span style={{ color:POS }}>🟢 Monitoring · </span>}
          {settings.telegramToken && <span style={{ color:"#27A7E1" }}>✈ TG · </span>}
          {settings.discordWebhook && <span style={{ color:"#5865F2" }}>💬 DC · </span>}
          Free APIs Only
        </div>
      </div>

      <div style={{ display:"flex", background:CARD, borderBottom:`1px solid ${LINE}`, overflowX:"auto" }}>
        {TABS.map(([id,label]) => (
          <button key={id} onClick={()=>setTab(id)} style={{
            padding:"13px 16px", border:"none", background:"transparent",
            color:tab===id?AMB:DIM, borderBottom:tab===id?`2px solid ${AMB}`:"2px solid transparent",
            cursor:"pointer", fontSize:"12px", fontWeight:tab===id?"700":"400", whiteSpace:"nowrap"
          }}>{label}</button>
        ))}
      </div>

      <div style={{ padding:"20px", maxWidth:"1100px", margin:"0 auto" }}>
        {tab==="live"     && <LiveTab />}
        {tab==="wallets"  && <WalletsTab settings={settings} />}
        {tab==="nfts"     && <NFTsTab settings={settings} />}
        {tab==="whales"   && <WhalesTab settings={settings} />}
        {tab==="github"   && <GitHubTab settings={settings} />}
        {tab==="chains"   && <ChainsTab />}
        {tab==="search"   && <SearchTab />}
        {tab==="alerts"   && <AlertsTab settings={settings} alertConfig={alertConfig} setAlertConfig={saveAlertConfig}
          running={running} nextIn={nextIn} startPolling={startPolling} stopPolling={stopPolling} log={log} clearLog={clearLog} />}
        {tab==="settings" && <SettingsTab settings={settings} onSave={saveSettings} />}
      </div>
    </div>
  );
}
