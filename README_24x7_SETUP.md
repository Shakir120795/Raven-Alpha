# 🍌 Raven Alpha — 24/7 Background Alerts Setup

Ye guide batata hai ki apne Vercel deployment ko **sach me 24/7** kaise banaya jaye —
matlab alerts tab bhi aate rahein jab koi bhi browser tab khula na ho.

## Kyun zaroori hai?

Pehle wala "Start Monitoring" button sirf tab tak kaam karta hai jab tak tumhara
browser tab khula ho. Vercel pe deploy karne ke baad agar koi browser open nahi
rakhta, wo polling ruk jati hai. Isliye ab ek **serverless background scanner**
(`/api/scan`) bana diya hai jo Vercel pe khud chalta hai, kisi browser ki zaroorat
nahi.

## Setup — 4 steps

### 1. KV Database banao (wallets store karne ke liye)
Vercel dashboard → apna project → **Storage** tab → **Create Database** → **KV**
(Upstash Redis, free tier). Connect karte hi Vercel khud `KV_REST_API_URL` aur
`KV_REST_API_TOKEN` env vars daal dega — kuch copy-paste nahi karna.

### 2. Environment Variables set karo
Project → **Settings** → **Environment Variables** mein ye daalo:

| Variable | Value | Zaroori? |
|---|---|---|
| `TELEGRAM_TOKEN` | Tumhara Telegram bot token | Telegram ke liye |
| `TELEGRAM_CHAT_ID` | Tumhara chat ID | Telegram ke liye |
| `DISCORD_WEBHOOK` | Discord webhook URL | Discord ke liye |
| `ETH_KEYS` | Etherscan key(s), comma se separate multiple | Ethereum ke liye |
| `ROBINHOOD_KEYS` | (khaali chhod sakte ho — Blockscout, key nahi chahiye) | Optional |
| `ARC_KEYS` | Arc explorer key(s) (jab live ho, 16 Sep 2026 se) | Optional |
| `INK_KEYS` | (khaali chhod sakte ho — Blockscout, key nahi chahiye) | Optional |
| `SCAN_SECRET` | Khud koi random secret bana lo (e.g. `raven_9f8a3...`) | ✅ Zaroori |

Multi-RPC failover ke liye ek variable mein comma se kai keys daal sakte ho:
`ETH_KEYS=key1,key2,key3` — pehli rate-limit hone pe agli apne aap try hogi.

`CRON_SECRET` khud-ba-khud Vercel set kar dega jab tum cron job connect karoge —
usko chhedne ki zaroorat nahi.

### 3. Redeploy karo
Env vars daalne ke baad ek naya deployment trigger karo (`git push` ya Vercel
dashboard se "Redeploy") taaki naye vars load ho jayein.

### 4. Har 5 minute mein scan chalao (free external scheduler)
⚠️ **Zaroori baat**: Vercel ka apna built-in Cron sirf **Hobby (free) plan pe
din mein sirf 1 baar** chal sakta hai — har 5 minute wala schedule Hobby plan pe
allowed nahi hai (ye Vercel ki khud ki limit hai, humare code ki nahi).

Isliye 5-minute cadence ke liye ek **free external scheduler** use karo:

1. [cron-job.org](https://cron-job.org) pe free account banao
2. Naya cronjob banao:
   - **URL**: `https://<your-app>.vercel.app/api/scan?secret=<tumhara SCAN_SECRET>`
   - **Schedule**: Every 5 minutes
3. Save karo — bas, ab har 5 minute mein tumhari app khud check karegi.

(Agar Vercel Pro plan hai [$20/month], to `vercel.json` mein already daala hua
cron config seedha kaam karega without kisi external service ke — bas schedule
ko `*/5 * * * *` kar dena.)

## Naye wallets kaise add karein

Dashboard ke **Whales** tab se — jaisa pehle karte the. Ab jab KV connected hoga,
wahan add/remove kiya hua wallet turant server-side scanner ke saath bhi sync ho
jayega (tab pe "🟢 24/7 server scanner se connected" dikhega). Koi extra step
nahi.

## Test karna ho manually
Browser mein ya curl se ye URL kholo:
```
https://<your-app>.vercel.app/api/scan?secret=<tumhara SCAN_SECRET>
```
JSON response mein `walletsScanned` aur `alertsSent` count dikhega.
