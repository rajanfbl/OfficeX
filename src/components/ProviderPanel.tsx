import { useEffect, useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import type { ProviderConnection } from '../types';

type Reply = {
  providers: Record<string, ProviderConnection>;
  usage: { totals: Record<string, { requests: number; failed: number; input: number; output: number; unreported: number }>; scope: string };
};
export function ProviderPanel() {
  const [data, setData] = useState<Reply>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function update(method: string, route: string, body?: unknown) {
    setBusy(true); setError('');
    try {
      const result = await api<Reply>(method, route, body);
      setData(result); useStore.setState({ providers: result.providers });
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  useEffect(() => { void update('GET', 'api/providers'); }, []);
  return <section className="provider-panel">
    <p>Use the subscriptions already signed in on this laptop. Codex is the default. Each agent’s model chooses its provider.</p>
    {Object.values(data?.providers ?? {}).map((p) => <article key={p.id} className="provider-card">
      <div className="provider-card__head"><strong>{p.label}</strong><span className={p.state === 'connected' ? 'provider-ready' : 'muted'}>{p.state === 'connected' ? 'Ready' : 'Not connected'}</span></div>
      <p className="small">{p.detail || (p.state === 'connected' ? 'Connected' : 'Optional: connect your Claude account below.')}</p>
      {p.quota && <p className="small">{p.quota.primary && <>Session: {p.quota.primary.usedPercent}% used · resets {new Date(p.quota.primary.resetsAt * 1000).toLocaleString()}<br /></>}{p.quota.secondary && <>Week: {p.quota.secondary.usedPercent}% used · resets {new Date(p.quota.secondary.resetsAt * 1000).toLocaleString()}<br /></>}Codex credits: {p.quota.credits?.balance ?? 'not reported'}</p>}
      {p.quotaError && <p className="muted small">Plan balance unavailable: {p.quotaError}</p>}
      {p.id === 'gemini' && <p className="muted small">Remaining Google plan quota is not reported by this connection. Check Antigravity for its live limits.</p>}
      {p.id !== 'claude' && <label className="check"><input type="checkbox" checked={p.enabled} disabled={busy} onChange={(e) => void update('PATCH', 'api/providers', { id: p.id, enabled: e.target.checked })} />Use in OfficeX</label>}
      {p.id === 'codex' && p.state !== 'connected' && <p className="muted small">Sign in through the official Codex app or CLI, then check again.</p>}
      {p.id === 'gemini' && p.state !== 'connected' && <p className="muted small">Sign in through Antigravity on this laptop, then check again.</p>}
      {data?.usage.totals[p.id] && <p className="mono small">{data.usage.totals[p.id].requests} requests · {data.usage.totals[p.id].input.toLocaleString()} input / {data.usage.totals[p.id].output.toLocaleString()} output tokens · {data.usage.totals[p.id].unreported} unreported · {data.usage.totals[p.id].failed} failed</p>}
    </article>)}
    <button className="btn btn--ghost" disabled={busy} onClick={() => void update('POST', 'api/providers/refresh', {})}>{busy ? 'Checking…' : 'Check connections & refresh usage'}</button>
    {error && <p role="alert" className="np__error">{error}</p>}
    <p className="muted small">No API keys or paid fallback. Google extra AI-credit spending is disabled for these runs. Your normal subscription limits still apply. {data?.usage.scope}</p>
    <p className="muted small">OfficeX tools work across providers. Claude’s Chrome integration and imported Claude advisor sessions remain Claude-only. Other app plugins are not automatically copied.</p>
  </section>;
}
