# PayPerPrompt: submission text

**Project name:** PayPerPrompt

**Tagline:** AI agents pay for every answer on Solana, a tenth of a cent each.

## Inspiration
Autonomous agents need to buy things: data, compute, answers. Cards can't do it. A $0.001 API call costs ~$0.30 in card fees, 300x the price, and every agent would need an account and a human-issued key. We wanted an agent that holds its own wallet, has a spending limit, and pays per request.

## What it does
An AI agent asks a paid AI API a question. The API replies HTTP 402 with a Solana Pay quote (recipient, 0.001 USDC-like token, unique reference). The agent checks its budget, pays on-chain in about a second for a fraction of a cent, retries with the reference, and gets a Claude answer. A dashboard shows the live payment feed with explorer links, spend vs budget, and confirm latency. "Burst x10" fires ten paid requests for one cent. Lower the cap and the agent refuses to overspend.

## How we built it
Next.js 15 app. `/api/ask` is the paid endpoint: it issues quotes, verifies payment with `@solana/pay` (`findReference` + `validateTransfer`), enforces one-payment-one-answer so a reference can't be replayed, then calls Claude (`claude-haiku-5-5`) via the Anthropic SDK. `/api/agent` is the autonomous client: budget check, SPL transfer via `@solana/web3.js` and `@solana/spl-token`, retry. A setup script generates devnet keypairs, airdrops SOL, mints a test USDC and writes `.env.local`. Without an Anthropic key the API returns mock answers so the demo always runs.

## Challenges we ran into
- Making payment verification airtight: matching amount, recipient and mint, and blocking replay of a reference.
- Handling confirmation timing so the retry doesn't race the chain.
- Keeping the cap strict: the agent must refuse before sending anything, not after.
- Building a one-command devnet setup so judges can run it in minutes.

## Accomplishments that we're proud of
- A full pay-per-request loop that works end to end: 402, pay, verify, answer.
- Real on-chain payments of $0.001 at ~1s and a fraction of a cent in fees, impossible on card rails.
- An agent that visibly says no when the budget is gone.

## What we learned
Micropayments change what you can sell: when the fee is a rounding error, per-request pricing is viable. Solana Pay references make payment-to-request matching simple. HTTP 402 finally has a payment rail that fits it.

## What's next for PayPerPrompt
- Enforce the spend cap on-chain with an SPL delegate `approve`, so the limit holds even if the agent is compromised.
- Persistent storage instead of in-memory state.
- Multiple paid tools priced competitively, so agents pick the cheapest capable API.
- Align with the x402 standard so any agent can pay any API.
- Mainnet with real USDC.

## Built with
Solana (devnet), Solana Pay (`@solana/pay`), `@solana/web3.js`, `@solana/spl-token`, SPL tokens, Next.js 15, React, TypeScript, Tailwind CSS, Anthropic Claude API (`claude-haiku-5-5`), Node.js

## Tracks to enter
- **Top 3 Overall:** Solana is doing what it is good at (speed and near-zero fees make $0.001 payments possible), not a chain bolted onto a web2 app; remove it and the product cannot exist.
- **AI Track:** AI and Solana each do real work: Claude answers the questions, Solana settles and verifies every payment, in an "autonomous agent that holds a wallet and pays for APIs with spending limits".
- **DeFi Track:** It is a payments and stablecoin product: per-request micropayments in an SPL stablecoin-style token with on-chain verification.

## 2-minute demo video script

| Time | Screen | Say |
|---|---|---|
| 0:00-0:15 | Dashboard, wallet and budget visible | "AI agents need to pay for things. A card charges 30 cents on a tenth-of-a-cent purchase. So we built PayPerPrompt on Solana." |
| 0:15-0:35 | Ask a question | "The agent asks a paid AI API. The API answers HTTP 402 with a Solana Pay quote: recipient, price, unique reference." |
| 0:35-1:00 | Feed updates, click explorer link | "The agent pays 0.001 USDC on-chain, about a second, a fraction of a cent in fees. Here's the transaction on the explorer. The server verifies it, and Claude's answer comes back." |
| 1:00-1:20 | Click Burst x10 | "Ten paid requests, ten transactions, one cent total. Confirm latency is live on the dashboard." |
| 1:20-1:40 | Lower the cap, ask again | "Now I drop the spending cap below what it has spent. The agent refuses. No transaction, no overspend." |
| 1:40-1:52 | Code flash of `findReference` / `validateTransfer` | "Each payment unlocks exactly one answer. Replays are rejected." |
| 1:52-2:00 | Dashboard | "Next: the cap enforced on-chain with SPL delegates, and x402-style pricing across many tools. PayPerPrompt: agents that pay their own way." |
