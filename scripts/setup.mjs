// Idempotent devnet setup: wallets, test USDC mint, funding. Run: node scripts/setup.mjs
import fs from "node:fs";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, clusterApiUrl, sendAndConfirmTransaction } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

const ENV = ".env.local";
const env = {};
if (fs.existsSync(ENV)) {
  for (const line of fs.readFileSync(ENV, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
}

const ORDER = ["AGENT_SECRET_KEY", "MERCHANT_PUBKEY", "MERCHANT_SECRET_KEY", "USDC_MINT", "PRICE_USDC", "AGENT_BUDGET_USDC"];
function save() {
  const lines = ORDER.filter((k) => env[k] !== undefined).map((k) => `${k}=${env[k]}`);
  for (const [k, v] of Object.entries(env)) if (!ORDER.includes(k) && k !== "ANTHROPIC_API_KEY") lines.push(`${k}=${v}`);
  lines.push("# Optional: without ANTHROPIC_API_KEY the app returns mock answers", `ANTHROPIC_API_KEY=${env.ANTHROPIC_API_KEY ?? ""}`);
  fs.writeFileSync(ENV, lines.join("\n") + "\n");
}

const toArr = (kp) => JSON.stringify(Array.from(kp.secretKey));
if (!env.AGENT_SECRET_KEY) env.AGENT_SECRET_KEY = toArr(Keypair.generate());
if (!env.MERCHANT_PUBKEY) {
  const m = Keypair.generate();
  env.MERCHANT_PUBKEY = m.publicKey.toBase58();
  env.MERCHANT_SECRET_KEY = toArr(m);
}
env.PRICE_USDC ??= "0.001";
env.AGENT_BUDGET_USDC ??= "0.02";
save();

const agent = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(env.AGENT_SECRET_KEY)));
const merchant = new PublicKey(env.MERCHANT_PUBKEY);
const conn = new Connection(process.env.RPC_URL || env.RPC_URL || clusterApiUrl("devnet"), "confirmed");
const link = (x) => `https://explorer.solana.com/address/${x}?cluster=devnet`;

let sol = (await conn.getBalance(agent.publicKey)) / LAMPORTS_PER_SOL;
if (sol < 0.5) {
  try {
    console.log("Requesting 1 SOL airdrop...");
    const sig = await conn.requestAirdrop(agent.publicKey, LAMPORTS_PER_SOL);
    const bh = await conn.getLatestBlockhash();
    await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
    sol = (await conn.getBalance(agent.publicKey)) / LAMPORTS_PER_SOL;
  } catch (e) {
    console.error(`\nAirdrop failed: ${e.message}`);
    console.error(`Fund the agent wallet manually at https://faucet.solana.com (devnet), then re-run.`);
    console.error(`Agent pubkey: ${agent.publicKey.toBase58()}`);
    console.error(`${ENV} written.`);
    process.exit(1);
  }
}

// Solana Pay's createTransfer requires the recipient wallet account to exist, so give the merchant rent money.
if ((await conn.getBalance(merchant)) === 0) {
  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: agent.publicKey, toPubkey: merchant, lamports: 0.01 * LAMPORTS_PER_SOL }));
  await sendAndConfirmTransaction(conn, tx, [agent]);
  console.log("Sent 0.01 SOL to merchant so its account exists.");
}

if (!env.USDC_MINT) {
  env.USDC_MINT = (await createMint(conn, agent, agent.publicKey, null, 6)).toBase58();
  save();
}
const mint = new PublicKey(env.USDC_MINT);
const agentAta = await getOrCreateAssociatedTokenAccount(conn, agent, mint, agent.publicKey);
await getOrCreateAssociatedTokenAccount(conn, agent, mint, merchant);
let tokens = Number(agentAta.amount) / 1e6;
if (tokens < 10) {
  await mintTo(conn, agent, mint, agentAta.address, agent, 100_000_000);
  tokens += 100;
}
save();

console.log(`
Agent:    ${agent.publicKey.toBase58()}  ${link(agent.publicKey.toBase58())}
Merchant: ${env.MERCHANT_PUBKEY}  ${link(env.MERCHANT_PUBKEY)}
Mint:     ${env.USDC_MINT}  ${link(env.USDC_MINT)}
SOL:      ${sol}
Tokens:   ${tokens}
Wrote ${ENV}`);
