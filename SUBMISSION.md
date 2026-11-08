# PayPerPrompt: submission text

**Project name:** PayPerPrompt

**Tagline:** AI agents pay for every answer on Solana, a tenth of a cent each.

**Demo video:** https://youtu.be/_Q8L6GngaW4

## Inspiration
Autonomous agents need to buy things: data, compute, answers. Cards can't do it. A $0.001 API call costs ~$0.30 in card fees, 300x the price, and every agent would need an account and a human-issued key. We wanted an agent that holds its own wallet, has a spending limit, and pays per request.

## What it does
An AI agent asks a paid AI API a question. The API replies HTTP 402 with a Solana Pay quote (recipient, 0.001 USDC-like token, unique reference). The agent checks its budget, pays on-chain in about a second for a fraction of a cent, retries with the reference, and gets the answer. The paid endpoint is wired to Claude (`claude-haiku-5-5`); this demo runs it in mock mode without an API key, so answers are placeholders, while every payment, verification and refusal is real on devnet. A dashboard shows the live payment feed with explorer links, spend vs budget, and confirm latency. "Burst x10" fires ten paid requests for one cent. Lower the cap and the agent refuses to overspend.

## How we built it
Next.js 15 app. `/api/ask` is the paid endpoint: it issues quotes, verifies payment with `@solana/pay` (`findReference` + `validateTransfer`), enforces one-payment-one-answer so a reference can't be replayed, then calls Claude (`claude-haiku-5-5`) via the Anthropic SDK. `/api/agent` is the autonomous client: budget check, SPL transfer via `@solana/web3.js` and `@solana/spl-token`, retry. The agent signs each payment once and resends the same bytes on RPC errors, so a retry can never pay twice. A setup script generates devnet keypairs, funds them (airdrop, or the devnet faucet when airdrops are closed), mints a test USDC and writes `.env.local`. Without an Anthropic key the API returns mock answers so the demo always runs; the submitted demo runs this way. An optional password puts the dashboard and the agent's spend controls behind Basic auth, while the paid API stays open: payment is its auth.

## Challenges we ran into
- Making payment verification airtight: matching amount, recipient and mint, and blocking replay of a reference.
- Handling confirmation timing so the retry doesn't race the chain.
- Surviving a flaky, rate-limited public devnet RPC without ever double-paying: re-signing on retry would create a second transaction, so the agent resends the exact signed bytes and the network dedupes them.
- Not losing a payment when the AI call fails: the quote is restored so the same payment can be retried.
- Keeping the cap strict: the agent must refuse before sending anything, not after.
- Building a one-command devnet setup so judges can run it in minutes.

## Accomplishments that we're proud of
- A full pay-per-request loop that works end to end: 402, pay, verify, answer.
- Real on-chain payments of $0.001 at ~1s and a fraction of a cent in fees, impossible on card rails.
- An agent that visibly says no when the budget is gone.

## What we learned
Micropayments change what you can sell: when the fee is a rounding error, per-request pricing is viable. Solana Pay references make payment-to-request matching simple. HTTP 402 finally has a payment rail that fits it.

## What's next for PayPerPrompt
- Turn on live Claude answers: the integration is in place and needs only an API key.
- Enforce the spend cap on-chain with an SPL delegate `approve`, so the limit holds even if the agent is compromised.
- Persistent storage instead of in-memory state.
- Multiple paid tools priced competitively, so agents pick the cheapest capable API.
- Align with the x402 standard so any agent can pay any API.
- Mainnet with real USDC.

## Built with
Solana (devnet), Solana Pay (`@solana/pay`), `@solana/web3.js`, `@solana/spl-token`, SPL tokens, Next.js 15, React, TypeScript, Tailwind CSS, Anthropic Claude API (`claude-haiku-5-5`, integrated; demo runs in mock mode), Node.js

## Tracks to enter
- **Top 3 Overall:** Solana is doing what it is good at (speed and near-zero fees make $0.001 payments possible), not a chain bolted onto a web2 app; remove it and the product cannot exist.
- **AI Track:** Solana gives AI systems something they can't get elsewhere: an autonomous agent that holds its own wallet and pays an AI service per request, with a spending cap and a trusted-payee check, matching both "agents that hold a wallet and pay for APIs with spending limits" and "machine payments: AI services paid per request". The Claude call is integrated; the demo shows placeholder answers because it runs without an API key.
- **DeFi Track:** It is a payments and stablecoin product: per-request micropayments in an SPL stablecoin-style token with on-chain verification.

## 2-minute demo video script

| Time | Screen | Say |
|---|---|---|
| 0:00-0:15 | Dashboard, wallet and budget visible | "AI agents need to pay for things. A card charges 30 cents on a tenth-of-a-cent purchase. So we built PayPerPrompt on Solana." |
| 0:15-0:35 | Ask a question | "The agent asks a paid AI API. The API answers HTTP 402 with a Solana Pay quote: recipient, price, unique reference." |
| 0:35-1:00 | Feed updates, click explorer link | "The agent pays 0.001 USDC on-chain, about a second, a fraction of a cent in fees. Here's the transaction on the explorer. The server verifies it and the answer comes back. In this demo the AI endpoint runs in mock mode, so the answer is a placeholder; the payment is real." |
| 1:00-1:20 | Click Burst x10 | "Ten paid requests, ten transactions, one cent total. Confirm latency is live on the dashboard." |
| 1:20-1:40 | Lower the cap, ask again | "Now I drop the spending cap below what it has spent. The agent refuses. No transaction, no overspend." |
| 1:40-1:52 | Code flash of `findReference` / `validateTransfer` | "Each payment unlocks exactly one answer. Replays are rejected." |
| 1:52-2:00 | Dashboard | "Next: the cap enforced on-chain with SPL delegates, and x402-style pricing across many tools. PayPerPrompt: agents that pay their own way." |
