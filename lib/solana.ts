import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import BigNumber from "bignumber.js";
import tls from "node:tls";

// Antivirus HTTPS scanning (e.g. Norton Web Shield) re-signs certificates with a root only the OS trusts, and Node
// ignores the OS store, so every RPC call fails with UNABLE_TO_VERIFY_LEAF_SIGNATURE. Trust the OS store as well.
// Needs Node >= 22.19 / 24.5; older Node skips this and behaves as before.
const t = tls as typeof tls & { getCACertificates?: (s: string) => string[]; setDefaultCACertificates?: (c: string[]) => void };
if (t.getCACertificates && t.setDefaultCACertificates) t.setDefaultCACertificates([...t.getCACertificates("default"), ...t.getCACertificates("system")]);

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env.local - run \`npm run setup\``);
  return v;
}

// The public devnet RPC drops connections now and then ("fetch failed"). Retry network errors only.
// Safe for sendTransaction too: re-sending the same signed tx has the same signature, so it can't pay twice.
const retryingFetch: typeof fetch = async (input, init) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(input, init);
    } catch (e) {
      if (attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
};

export const connection = new Connection(process.env.RPC_URL ?? clusterApiUrl("devnet"), { commitment: "confirmed", fetch: retryingFetch });

// Secret keys are stored as JSON byte arrays (same format as solana-keygen output).
export const agentKeypair = () => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(env("AGENT_SECRET_KEY"))));
export const merchantPubkey = () => new PublicKey(env("MERCHANT_PUBKEY"));
export const usdcMint = () => new PublicKey(env("USDC_MINT"));

export const PRICE = new BigNumber(process.env.PRICE_USDC ?? "0.001"); // USDC per request
export const USDC_DECIMALS = 6;

// Public devnet RPC drops requests under load ("fetch failed"). Retry with backoff; only wrap calls that are safe to repeat.
export async function retry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 400 * i));
    }
  }
}

export const explorerTx =(sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
