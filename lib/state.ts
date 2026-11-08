// ponytail: in-memory state, resets on server restart. Fine for a demo; move to a DB if it must persist.
export type Payment = { signature: string; amount: string; prompt: string; ms: number; at: number };

type State = {
  pending: Map<string, { prompt: string; at: number }>; // reference pubkey -> prompt it was quoted for; insertion order = age
  usedSignatures: Set<string>; // replay protection: each payment buys exactly one answer
  spent: number; // agent's total USDC spent
  budget: number; // agent's spending cap in USDC
  payments: Payment[];
};

// globalThis so every route handler shares one copy, even across dev hot reloads.
const g = globalThis as unknown as { __ppp?: State };
export const state: State = (g.__ppp ??= {
  pending: new Map(),
  usedSignatures: new Set(),
  spent: 0,
  budget: Number(process.env.AGENT_BUDGET_USDC ?? "0.02"),
  payments: [],
});
