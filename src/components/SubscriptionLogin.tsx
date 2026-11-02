import { useEffect, useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';

interface LoginState { provider: string; phase: 'idle' | 'starting' | 'waiting' | 'verifying' | 'connected' | 'failed' | 'cancelled' | 'expired'; message: string; url?: string; userCode?: string; expiresAt?: number }
export function SubscriptionLogin({ provider }: { provider: 'codex' | 'gemini' }) {
  const [state, setState] = useState<LoginState>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const connection = useStore((s) => s.providers?.[provider]);
  const active = state && ['starting', 'waiting', 'verifying'].includes(state.phase);
  const label = provider === 'codex' ? 'ChatGPT' : 'Google';
  useEffect(() => {
    let alive = true;
    async function refresh() {
      try { const s = await api<LoginState>('GET', `api/provider-login?provider=${provider}`); if (alive) setState(s); }
      catch (err) { if (alive) setError((err as Error).message); }
    }
    void refresh();
    const interval = window.setInterval(refresh, 1500);
    return () => { alive = false; window.clearInterval(interval); };
  }, [provider]);
  async function act(action: string, fields = {}) {
    setBusy(true); setError('');
    try { setState(await api<LoginState>('POST', 'api/provider-login', { provider, action, ...fields })); setCode(''); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="subscription-login">
    <h3>{provider === 'codex' ? 'ChatGPT subscription through Codex' : 'Gemini subscription through Antigravity'}</h3>
    <p>Sign in with your {label} account. The official tool handles authorization and stores the login securely. OfficeX does not need your password or an API key.</p>
    <p role="status">{state?.message || (connection?.state === 'connected' ? 'Your subscription is already connected.' : 'Ready to start sign-in.')}</p>
    {!active && <div className="acct__row">
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
    <p className="muted small">An existing OAuth login is reused without signing you out. {provider === 'gemini' ? 'Google authorization codes belong in this panel, not in your AI chat. To change Google accounts, sign out in Antigravity first.' : 'If the browser is on another device, use the device-code option when available.'} No model request is made just to sign in.</p>
  </section>;
}
