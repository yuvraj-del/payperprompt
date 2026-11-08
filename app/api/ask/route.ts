// The paid AI API. No payment -> HTTP 402 with a Solana Pay quote. Paid -> verified on-chain -> answer.
import { NextResponse } from "next/server";
import { Keypair, PublicKey } from "@solana/web3.js";
import { findReference, validateTransfer } from "@solana/pay";
import Anthropic from "@anthropic-ai/sdk";
import { connection, merchantPubkey, usdcMint, PRICE } from "@/lib/solana";
import { state } from "@/lib/state";

export const runtime = "nodejs";

const QUOTE_TTL_MS = 10 * 60_000; // unpaid quotes expire after 10 minutes
const bad =(status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const { prompt, reference, signature } = await req.json().catch(() => ({}));
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 2000) return bad(400, "prompt must be 1-2000 chars");

  // Step 1: quote. A fresh reference key ties the on-chain payment to this exact request.
  if (!reference) {
    const now = Date.now();
    // Drop expired unpaid quotes, oldest first, so they can't pile up in memory.
    // ponytail: TTL only; a flood within one TTL still grows the map, add a size cap or rate limit if exposed publicly.
    for (const [k, q] of state.pending) {
      if (now - q.at < QUOTE_TTL_MS) break;
      state.pending.delete(k);
    }
    const ref = Keypair.generate().publicKey.toBase58();
    state.pending.set(ref, { prompt, at: now });
    return NextResponse.json(
      { recipient: merchantPubkey().toBase58(), amount: PRICE.toString(), splToken: usdcMint().toBase58(), reference: ref, label: "PayPerPrompt" },
      { status: 402 },
    );
  }

  // Step 2: verify payment. Quote must exist and match the prompt it was issued for.
  if (state.pending.get(reference)?.prompt !== prompt) return bad(402, "unknown or already-used quote");
  let sig: string = signature;
  try {
    const refKey = new PublicKey(reference);
    if (!sig) sig = (await findReference(connection, refKey, { finality: "confirmed" })).signature;
    await validateTransfer(connection, sig, { recipient: merchantPubkey(), amount: PRICE, splToken: usdcMint(), reference: refKey }, { commitment: "confirmed" });
  } catch (e) {
    return bad(402, `payment not verified: ${(e as Error).message}`);
  }
  // Check + mark with no await in between, so concurrent replays of one signature can't both pass.
  if (state.usedSignatures.has(sig) || !state.pending.has(reference)) return bad(402, "payment already used");
  state.usedSignatures.add(sig);
  state.pending.delete(reference);

  try {
    return NextResponse.json({ answer: await answer(prompt), signature: sig });
  } catch (e) {
    // The answer failed after payment: un-spend it so the same reference + signature can be retried.
    state.usedSignatures.delete(sig);
    state.pending.set(reference, { prompt, at: Date.now() });
    return bad(502, `paid, but the answer failed (retry with the same reference): ${(e as Error).message}`);
  }
}

async function answer(prompt: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return `(mock answer - set ANTHROPIC_API_KEY for real AI) You asked: "${prompt}"`;
  const msg = await new Anthropic().messages.create({
    model: "claude-haiku-5-5",
    max_tokens: 400,
    system: "Answer concisely in under 120 words.",
    messages: [{ role: "user", content: prompt }],
  });
  return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}
