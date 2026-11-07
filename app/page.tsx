"use client";

import { useCallback, useEffect, useState } from "react";

type Payment = { signature: string; amount: string; prompt: string; ms: number; at: string | number };
type State = { spent: number; budget: number; agent: string; payments: Payment[] };
type Msg =
  | { kind: "user"; text: string }
  | { kind: "agent"; text: string; amount: string; ms: number; explorer: string }
  | { kind: "refused" | "error"; text: string };

const short = (s: string, n = 4) => (s && s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);
const usdc = (n: number) => (Number(n) || 0).toFixed(3);
const txUrl = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
function ago(at: string | number, now: number) {
  const s = Math.max(0, Math.round((now - new Date(at).getTime()) / 1000));
  if (Number.isNaN(s)) return "";
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
}

export default function Home() {
  const [state, setState] = useState<State | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [cap, setCap] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/agent", { cache: "no-store" });
      if (r.ok) setState(await r.json());
    } catch {}
    setNow(Date.now());
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (state && cap === "") setCap(String(state.budget));
  }, [state, cap]);

  // Returns false when the agent should stop (budget hit or error).
  async function ask(text: string): Promise<boolean> {
    setMsgs((m) => [...m, { kind: "user", text }]);
    try {
      const r = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 402) {
        setMsgs((m) => [...m, { kind: "refused", text: `Budget cap reached — agent refused to pay (spent ${usdc(d.spent)} / ${usdc(d.budget)} USDC)` }]);
        return false;
      }
      if (!r.ok) {
        setMsgs((m) => [...m, { kind: "error", text: d.error || `Request failed (${r.status})` }]);
        return false;
      }
      setMsgs((m) => [...m, { kind: "agent", text: d.answer, amount: d.amount, ms: d.ms, explorer: d.explorer || txUrl(d.signature) }]);
      return true;
    } catch (e) {
      setMsgs((m) => [...m, { kind: "error", text: e instanceof Error ? e.message : String(e) }]);
      return false;
    } finally {
      refresh();
    }
  }

  async function submit() {
    const text = prompt.trim();
    if (!text || busy) return;
    setPrompt("");
    setBusy(true);
    await ask(text);
    setBusy(false);
  }

  async function burst() {
    if (busy) return;
    setBusy(true);
    for (let i = 1; i <= 10; i++) if (!(await ask(`Give me one fun fact #${i}`))) break;
    setBusy(false);
  }

  async function setBudget() {
    const budget = Number(cap);
    if (!Number.isFinite(budget) || budget < 0) return;
    try {
      const r = await fetch("/api/agent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budget }),
      });
      if (r.ok) setState(await r.json());
      else setMsgs((m) => [...m, { kind: "error", text: `Could not set cap (${r.status})` }]);
    } catch (e) {
      setMsgs((m) => [...m, { kind: "error", text: e instanceof Error ? e.message : String(e) }]);
    }
  }

  const payments = state?.payments ?? [];
  const spent = state?.spent ?? 0;
  const budget = state?.budget ?? 0;
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const avgMs = payments.length ? Math.round(payments.reduce((a, p) => a + (p.ms || 0), 0) / payments.length) : 0;

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-8 font-sans text-zinc-900 dark:text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            PayPerPrompt
            <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/30">devnet</span>
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            An AI agent paying 0.001 USDC per question on Solana — micropayments that card rails can&apos;t do.
          </p>
        </div>
        {state?.agent && (
          <a
            href={`https://explorer.solana.com/address/${state.agent}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-mono rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title={state.agent}
          >
            Agent wallet {short(state.agent)} ↗
          </a>
        )}
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3" aria-label="Agent stats">
        {[
          ["Spent", `${usdc(spent)} USDC`],
          ["Budget", `${usdc(budget)} USDC`],
          ["Requests paid", String(payments.length)],
          ["Avg confirm", avgMs ? `${avgMs} ms` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
            <div className="text-xs uppercase tracking-wide text-zinc-500">{k}</div>
            <div className="text-lg font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div
          className="flex-1 min-w-48 h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden"
          role="progressbar"
          aria-label="Budget used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
        >
          <div className={`h-full transition-all ${pct >= 100 ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
        </div>
        <label htmlFor="cap" className="text-sm text-zinc-500">Spending cap (USDC)</label>
        <input
          id="cap"
          type="number"
          min={0}
          step={0.001}
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setBudget()}
          className="w-28 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-sm tabular-nums"
        />
        <button onClick={setBudget} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
          Set cap
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section aria-label="Chat" className="rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col min-h-[28rem]">
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[60vh]" aria-live="polite">
            {msgs.length === 0 && <p className="text-sm text-zinc-500">Ask the agent anything. Each answer is paid for on-chain.</p>}
            {msgs.map((m, i) =>
              m.kind === "user" ? (
                <div key={i} className="ml-auto max-w-[85%] w-fit rounded-xl bg-purple-600 text-white px-3 py-2 text-sm whitespace-pre-wrap break-words">{m.text}</div>
              ) : m.kind === "agent" ? (
                <div key={i} className="max-w-[85%] rounded-xl bg-zinc-100 dark:bg-zinc-800/70 px-3 py-2 text-sm">
                  <div className="whitespace-pre-wrap break-words">{m.text}</div>
                  <div className="mt-2 text-xs text-zinc-500">
                    Paid {m.amount} USDC · {m.ms} ms ·{" "}
                    <a href={m.explorer} target="_blank" rel="noreferrer" className="underline hover:text-purple-500">View tx ↗</a>
                  </div>
                </div>
              ) : (
                <div
                  key={i}
                  role="alert"
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm border ${m.kind === "refused" ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"}`}
                >
                  {m.kind === "refused" ? "⛔ " : "Error: "}{m.text}
                </div>
              ),
            )}
            {busy && <div className="text-sm text-zinc-500 animate-pulse">Paying &amp; thinking…</div>}
          </div>
          <form
            className="border-t border-zinc-200 dark:border-zinc-800 p-3 flex gap-2 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label htmlFor="prompt" className="sr-only">Prompt</label>
            <textarea
              id="prompt"
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Ask a question… (Enter to send, Shift+Enter for newline)"
              className="flex-1 resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
            />
            <div className="flex flex-col gap-2">
              <button type="submit" disabled={busy || !prompt.trim()} className="rounded-lg bg-purple-600 text-white px-4 py-2 text-sm font-medium hover:bg-purple-500 disabled:opacity-50">
                Ask
              </button>
              <button type="button" onClick={burst} disabled={busy} aria-label="Burst: send 10 quick prompts" className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50">
                Burst ×10
              </button>
            </div>
          </form>
        </section>

        <aside aria-label="Live payments" className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden /> Live payments
          </h2>
          {payments.length === 0 ? (
            <p className="text-sm text-zinc-500">No payments yet.</p>
          ) : (
            <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
              {payments.map((p) => (
                <li key={p.signature} className="text-sm flex items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800/70 pb-2" title={p.prompt}>
                  <a href={txUrl(p.signature)} target="_blank" rel="noreferrer" className="font-mono text-purple-600 dark:text-purple-300 hover:underline">
                    {short(p.signature, 6)}
                  </a>
                  <span className="tabular-nums text-xs text-zinc-500 text-right">
                    {p.amount} USDC · {p.ms} ms · {ago(p.at, now)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </main>
  );
}
