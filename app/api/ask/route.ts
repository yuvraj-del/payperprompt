// The paid AI API. No payment -> HTTP 402 with a Solana Pay quote. Paid -> verified on-chain -> answer.
import { NextResponse } from "next/server";
import { Keypair, PublicKey } from "@solana/web3.js";
import { findReference, validateTransfer } from "@solana/pay";
import Anthropic from "@anthropic-ai/sdk";
import { connection, merchantPubkey, usdcMint, PRICE } from "@/lib/solana";
import { state } from "@/lib/state";

export const runtime = "nodejs";

const bad = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const { prompt, reference, signature } = await req.json().catch(() => ({}));
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 2000) return bad(400, "prompt must be 1-2000 chars");

  // Step 1: quote. A fresh reference key ties the on-chain payment to this exact request.
  if (!reference) {
    const ref = Keypair.generate().publicKey.toBase58();
    state.pending.set(ref, prompt);
    return NextResponse.json(
      { recipient: merchantPubkey().toBase58(), amount: PRICE.toString(), splToken: usdcMint().toBase58(), reference: ref, label: "PayPerPrompt" },
      { status: 402 },
    );
  }

  // Step 2: verify payment. Quote must exist and match the prompt it was issued for.
  if (state.pending.get(reference) !== prompt) return bad(402, "unknown or already-used quote");
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

  return NextResponse.json({ answer: await answer(prompt), signature: sig });
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
