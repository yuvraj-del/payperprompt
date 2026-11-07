// The AI agent: asks the paid API, checks the quote against its budget and trusted payee, pays on-chain, retries.
import { NextResponse } from "next/server";
import { PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { createTransfer } from "@solana/pay";
import BigNumber from "bignumber.js";
import { connection, agentKeypair, merchantPubkey, usdcMint, explorerTx } from "@/lib/solana";
import { state } from "@/lib/state";

export const runtime = "nodejs";

const snapshot = () => ({ spent: state.spent, budget: state.budget, agent: agentKeypair().publicKey.toBase58(), payments: state.payments.slice(0, 50) });

export async function GET() {
  return NextResponse.json(snapshot());
}

export async function PUT(req: Request) {
  const { budget } = await req.json().catch(() => ({}));
  if (typeof budget !== "number" || !Number.isFinite(budget) || budget < 0) return NextResponse.json({ error: "budget must be a number >= 0" }, { status: 400 });
  state.budget = budget;
  return NextResponse.json(snapshot());
}

export async function POST(req: Request) {
  const { prompt } = await req.json().catch(() => ({}));
  const askUrl = new URL("/api/ask", req.url);
  const post = (body: object) => fetch(askUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  // 1. Ask without paying -> expect a 402 quote.
  const quoteRes = await post({ prompt });
  const quote = await quoteRes.json();
  if (quoteRes.status !== 402 || !quote.reference) return NextResponse.json({ error: quote.error ?? "expected a payment quote" }, { status: quoteRes.status === 402 ? 500 : quoteRes.status });

  // 2. Agent guardrails: only pay the trusted merchant in the expected token, and never exceed the cap.
  if (quote.recipient !== merchantPubkey().toBase58() || quote.splToken !== usdcMint().toBase58())
    return NextResponse.json({ error: "agent refused: untrusted payee or token" }, { status: 403 });
  const amount = Number(quote.amount);
  if (!(amount > 0) || state.spent + amount > state.budget + 1e-9)
    return NextResponse.json({ error: "budget exceeded", spent: state.spent, budget: state.budget }, { status: 402 });
  state.spent += amount; // reserve before any await so parallel requests can't overspend

  // 3. Pay on-chain.
  const t0 = Date.now();
  let signature: string;
  try {
    const agent = agentKeypair();
    const tx = await createTransfer(connection, agent.publicKey, {
      recipient: new PublicKey(quote.recipient),
      amount: new BigNumber(quote.amount),
      splToken: new PublicKey(quote.splToken),
      reference: new PublicKey(quote.reference),
    });
    signature = await sendAndConfirmTransaction(connection, tx, [agent], { commitment: "confirmed" });
  } catch (e) {
    state.spent -= amount; // ponytail: refunds the reservation even if a timed-out tx actually landed; fine for devnet
    return NextResponse.json({ error: `payment failed: ${(e as Error).message}` }, { status: 500 });
  }
  const ms = Date.now() - t0;
  state.payments.unshift({ signature, amount: quote.amount, prompt, ms, at: Date.now() });

  // 4. Retry with proof of payment.
  const res = await post({ prompt, reference: quote.reference, signature });
  const body = await res.json();
  if (!res.ok) return NextResponse.json({ error: body.error ?? "paid but no answer" }, { status: 500 });
  return NextResponse.json({ answer: body.answer, signature, explorer: explorerTx(signature), amount: quote.amount, spent: state.spent, budget: state.budget, ms });
}
