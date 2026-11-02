import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import type { ProviderConnection } from '../types';

interface LoginState { provider: string; phase: 'idle' | 'starting' | 'waiting' | 'verifying' | 'connected' | 'failed' | 'cancelled' | 'expired'; message: string; url?: string; userCode?: string; expiresAt?: number }
export function SubscriptionLogin({ provider }: { provider: 'codex' | 'gemini' }) {
  const [state, setState] = useState<LoginState>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const working = useRef(false);
  const connection = useStore((s) => s.providers?.[provider]);
  const active = state && ['starting', 'waiting', 'verifying'].includes(state.phase);
  const label = provider === 'codex' ? 'ChatGPT' : 'Google';
  const connected = !active && connection?.state === 'connected';
  useEffect(() => {
    let alive = true;
    async function refresh() {
      if (working.current) return;
      try { const s = await api<LoginState>('GET', `api/provider-login?provider=${provider}`); if (alive && !working.current) setState(s); }
      catch (err) { if (alive) setError((err as Error).message); }
    }
    void refresh();
    const interval = window.setInterval(refresh, 1500);
    return () => { alive = false; window.clearInterval(interval); };
  }, [provider]);
  async function act(action: string, fields = {}) {
    if (working.current) return;
    working.current = true; setBusy(true); setError(''); setFeedback('');
    try { const result = await api<LoginState>('POST', 'api/provider-login', { provider, action, ...fields }); setState(result); setCode(''); if (result.phase === 'connected') setFeedback(`${label} is already connected and ready to use.`); }
    catch (err) { setError((err as Error).message); }
    finally { working.current = false; setBusy(false); }
  }
  async function checkConnection() {
    if (working.current) return;
    working.current = true; setBusy(true); setError(''); setFeedback('');
    try {
      const result = await api<{ providers: Record<string, ProviderConnection> }>('POST', 'api/providers/refresh', {});
      useStore.setState({ providers: result.providers });
      const ready = result.providers[provider]?.state === 'connected';
      setFeedback(ready ? `Checked at ${new Date().toLocaleTimeString()}: ${label} is connected and ready to use.` : `${label} is not connected. Use the sign-in button below.`);
      if (!ready) setState(undefined);
    } catch (err) { setError((err as Error).message); }
    finally { working.current = false; setBusy(false); }
  }
  return <section className="subscription-login">
    <h3>{provider === 'codex' ? 'ChatGPT subscription through Codex' : 'Gemini subscription through Antigravity'}</h3>
    <p>Sign in with your {label} account. The official tool handles authorization and stores the login securely. OfficeX does not need your password or an API key.</p>
    <p role="status">{connected ? `✓ ${label} is connected. You can use it now—no sign-in is needed.` : state?.phase === 'connected' ? 'Check your connection or sign in below.' : state?.message || 'Ready to start sign-in.'}</p>
    {connected && <div className="acct__row acct__row--wrap">
      <button className="btn btn--primary" disabled={busy} onClick={() => void checkConnection()}>{busy ? 'Checking…' : 'Check connection'}</button>
      {provider === 'codex' && <button className="btn btn--ghost" disabled={busy} onClick={() => void act('start', { force: true })}>Sign in again / change account</button>}
    </div>}
    {!active && !connected && <div className="acct__row">
      <button className="btn btn--primary" disabled={busy} onClick={() => void act('start')}>{busy ? 'Starting…' : `Sign in with ${label}`}</button>
      {provider === 'codex' && connection?.state !== 'connected' && <button className="btn btn--ghost" disabled={busy} onClick={() => void act('start', { deviceCode: true })}>Use device code instead</button>}
    </div>}
    {state?.url && <a className="btn btn--primary" href={state.url} target="_blank" rel="noopener noreferrer">Open {label} sign-in</a>}
    {state?.userCode && <p>Enter this device code on the official page: <strong className="mono">{state.userCode}</strong></p>}
    {provider === 'gemini' && state?.phase === 'waiting' && <form className="acct__row" onSubmit={(e) => { e.preventDefault(); void act('code', { code }); }}>
      <label>Google authorization code<input className="input" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" placeholder="Paste the new code from Google" /></label>
      <button className="btn btn--primary" disabled={busy || !code.trim()} type="submit">Finish sign-in</button>
    </form>}
    {active && <button className="btn btn--ghost" disabled={busy} onClick={() => void act('cancel')}>Cancel sign-in</button>}
    {error && <p className="np__error" role="alert">{error}</p>}
    {feedback && <p role="status">{feedback}</p>}
    <p className="muted small">An existing OAuth login is reused without signing you out. {provider === 'gemini' ? 'Google authorization codes belong in this panel, not in your AI chat. To change Google accounts, sign out in Antigravity first.' : 'If the browser is on another device, use the device-code option when available.'} No model request is made just to sign in.</p>
  </section>;
}
