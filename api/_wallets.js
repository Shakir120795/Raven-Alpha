import { kvGet, kvSet } from "./_kv.js";
import { SEED_WALLETS, SEED_WALLET_CHAINS } from "../src/chains.js";

export async function getWallets() {
  const existing = await kvGet("wallets");
  if (existing) return existing;
  const seeded = [];
  SEED_WALLET_CHAINS.forEach((chainId) => {
    SEED_WALLETS.forEach((address) => {
      seeded.push({ id: `${chainId}_${address}_seed`, address, chain: chainId, label: `${address.slice(0,6)}…${address.slice(-4)}` });
    });
  });
  await kvSet("wallets", seeded);
  return seeded;
}

export async function saveWallets(wallets) {
  await kvSet("wallets", wallets);
}
