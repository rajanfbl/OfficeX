// Login transport only. Official CLIs own OAuth clients, callbacks, token storage and refresh.
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import fs from 'node:fs';
import path from 'node:path';
import { localEnv } from './providers.mjs';

export function allowedLoginUrl(provider, value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password) return false;
    if (provider === 'codex') return ['auth.openai.com', 'auth0.openai.com', 'chatgpt.com'].includes(u.hostname);
    if (provider === 'gemini') return u.hostname === 'accounts.google.com' && ['/o/oauth2/auth', '/o/oauth2/v2/auth'].includes(u.pathname);
    return false;
  } catch { return false; }
}
const ACTIVE = new Set(['starting', 'waiting', 'verifying']);
export class ProviderLogin {
  constructor({ providers, cfg, appRoot, changed = () => {}, spawnProcess = spawn, timeoutMs = 10 * 60000 }) {
    Object.assign(this, { providers, cfg, appRoot, changed, spawnProcess, timeoutMs });
    this.sessions = new Map();
    this.startLocks = new Set();
  }
  snapshot(id) { return { ...(this.sessions.get(id)?.public ?? { provider: id, phase: 'idle', message: 'Choose Connect to use your subscription.' }) }; }
  notify(s, patch) { Object.assign(s.public, patch); this.changed(); }
  isBusy(id) { return ACTIVE.has(this.snapshot(id).phase); }
  async start(id, { force = false, deviceCode = false } = {}) {
    if (this.startLocks.has(id)) return { ...this.snapshot(id), phase: 'starting', message: 'Checking the existing subscription login…' };
    this.startLocks.add(id);
    try { return await this.startSession(id, { force, deviceCode }); }
    finally { this.startLocks.delete(id); }
  }
  async startSession(id, { force = false, deviceCode = false } = {}) {
    if (!['codex', 'gemini'].includes(id)) throw new Error('Unknown login provider');
    if (this.isBusy(id)) return this.snapshot(id);
    this.providers.enable(id, true);
    await this.providers.refresh();
    // Reusing an existing OAuth login must not sign the owner out of their other applications.
    if (this.providers.ready(id === 'codex' ? 'gpt-6.1-sol' : 'gemini-3.8-flash-medium') && !force) {
      const s = { public: { provider: id, phase: 'connected', message: 'Connected with the existing official subscription login.' } };
      this.sessions.set(id, s); this.changed(); return this.snapshot(id);
    }
    if (id === 'gemini' && force) throw new Error('Google uses its shared local account. Sign out in Antigravity yourself before changing that account; OfficeX will not sign out your other apps.');
    const bin = this.providers.bins[id];
    if (!bin) throw new Error('The official provider tool is not installed.');
    const s = { public: { provider: id, phase: 'starting', message: 'Starting official subscription sign-in…', expiresAt: Date.now() + this.timeoutMs }, pending: new Map(), nextId: 0, ended: false };
    this.sessions.set(id, s); this.changed();
    const finish = async (phase, message) => {
      if (s.ended) return;
      s.ended = true; clearTimeout(s.timer);
      this.notify(s, { phase, message, url: undefined, userCode: undefined, expiresAt: undefined });
      for (const p of s.pending.values()) p.reject(new Error('Sign-in session ended')); s.pending.clear();
      if (id === 'gemini') {
        try { s.child?.stdin.end(JSON.stringify({ action: 'cancel' }) + '\n'); } catch { /* closed */ }
        const cleanup = setTimeout(() => s.child?.kill(), 1500); cleanup.unref();
      } else { try { s.child?.stdin.end(); } catch { /* closed */ } s.child?.kill(); }
      if (phase === 'connected') { await this.providers.refresh(); this.changed(); }
    };
    s.finish = finish;
    s.timer = setTimeout(() => void finish('expired', 'Sign-in expired. Start again to get a fresh link.'), this.timeoutMs);
    const cwd = path.join(this.cfg.companyRoot, 'office', 'sign-in', id);
    fs.mkdirSync(cwd, { recursive: true });
    const args = id === 'codex' ? ['app-server', '--stdio'] : [path.join(this.appRoot, 'scripts', 'gemini_login.py'), bin];
    s.child = this.spawnProcess(id === 'codex' ? bin : this.cfg.python, args, { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: localEnv({ BROWSER: 'officex-no-browser', SSH_CONNECTION: id === 'gemini' ? '127.0.0.1 1 127.0.0.1 1' : undefined }) });
    const send = (message) => s.child.stdin.write(JSON.stringify(message) + '\n');
    s.rpc = (method, params) => new Promise((resolve, reject) => {
      const requestId = ++s.nextId;
      const timer = setTimeout(() => { s.pending.delete(requestId); reject(new Error('Official login service timed out')); }, 15000);
      s.pending.set(requestId, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      send({ id: requestId, method, ...(params ? { params } : {}) });
    });
    const decoder = new StringDecoder('utf8'); let buffer = '';
    const handle = async (m) => {
      if (s.ended) return;
      if (id === 'codex') {
        if (m.id !== undefined && s.pending.has(m.id)) {
          const p = s.pending.get(m.id); s.pending.delete(m.id);
          m.error ? p.reject(new Error('Official ChatGPT login service returned an error. Try again.')) : p.resolve(m.result); return;
        }
        if (m.method === 'account/login/completed' && m.params?.loginId === s.loginId) {
          if (!m.params.success) return finish(s.cancelling ? 'cancelled' : 'failed', s.cancelling ? 'Sign-in cancelled.' : 'ChatGPT sign-in did not finish. Try again.');
          const info = await s.rpc('account/read', { refreshToken: false });
          return finish(info.account?.type === 'chatgpt' ? 'connected' : 'failed', info.account?.type === 'chatgpt' ? 'ChatGPT subscription connected.' : 'A ChatGPT subscription login is required; API-key accounts are not used.');
        }
        if (m.id !== undefined && m.method) send({ id: m.id, error: { code: -32601, message: 'This client handles subscription login only.' } });
      } else {
        if (m.event === 'url') {
          if (!allowedLoginUrl('gemini', m.url)) return finish('failed', 'The official tool returned an unexpected sign-in address.');
          this.notify(s, { phase: 'waiting', url: m.url, message: 'Open Google sign-in, then paste the authorization code here if Google provides one.' });
        } else if (m.event === 'connected') {
          await this.providers.refresh();
          return finish(this.providers.state.gemini.state === 'connected' ? 'connected' : 'failed', this.providers.state.gemini.state === 'connected' ? 'Google subscription connected.' : 'Google sign-in could not be verified. Start again.');
        } else if (m.event === 'error') return finish('failed', 'Google sign-in did not finish. Start again with a fresh link.');
      }
    };
    s.child.stdout.on('data', (chunk) => {
      buffer += decoder.write(chunk);
      if (buffer.length > 1000000) return void finish('failed', 'Unexpected login response. Start again.');
      let i; while ((i = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, i); buffer = buffer.slice(i + 1); try { void handle(JSON.parse(line)).catch(() => finish('failed', 'Could not complete sign-in. Start again.')); } catch { /* no raw diagnostics or secrets go to the UI/log */ } }
    });
    s.child.stderr.on('data', () => {}); // OAuth output can contain credentials; never log raw text.
    s.child.stdin.on('error', () => {});
    s.child.on('error', () => void finish('failed', 'Could not start the official login tool.'));
    s.child.on('close', () => { if (!s.ended) void finish('failed', 'The official login tool closed before sign-in finished.'); });
    if (id === 'codex') {
      void (async () => {
        try {
          await s.rpc('initialize', { clientInfo: { name: 'officex', title: 'OfficeX', version: '0.5.1-beta.1' } });
          send({ method: 'initialized', params: {} });
          const login = await s.rpc('account/login/start', deviceCode ? { type: 'chatgptDeviceCode' } : { type: 'chatgpt', useHostedLoginSuccessPage: true });
          s.loginId = login.loginId;
          const url = login.authUrl ?? login.verificationUrl;
          if (!allowedLoginUrl('codex', url)) return finish('failed', 'The official tool returned an unexpected sign-in address.');
          this.notify(s, { phase: 'waiting', url, userCode: login.userCode, message: deviceCode ? 'Open ChatGPT sign-in and enter the displayed device code.' : 'Open ChatGPT sign-in. OfficeX will update when the official callback finishes.' });
        } catch { await finish('failed', 'Could not start ChatGPT sign-in. Try again or choose the device-code option.'); }
      })();
    }
    return this.snapshot(id);
  }
  submit(id, code) {
    const s = this.sessions.get(id);
    if (id !== 'gemini' || !s || s.public.phase !== 'waiting' || s.ended || Date.now() > s.public.expiresAt) throw new Error('Start a fresh Google sign-in first.');
    if (typeof code !== 'string' || !/^4\/[A-Za-z0-9_-]{10,1500}$/.test(code.trim())) throw new Error('Paste only the Google authorization code shown for this sign-in.');
    s.child.stdin.write(JSON.stringify({ action: 'code', code: code.trim() }) + '\n');
    this.notify(s, { phase: 'verifying', url: undefined, message: 'Waiting for the official Google tool to finish signing in…' });
    return this.snapshot(id);
  }
  check(id) {
    const s = this.sessions.get(id);
    // The Google terminal can redraw after success without printing a success sentence.
    // Verify via its authenticated model-list command (metadata only, no inference).
    if (id === 'gemini' && s && !s.ended && ['waiting', 'verifying'].includes(s.public.phase) && !s.checking && Date.now() - (s.lastProbe ?? 0) > 5000) {
      s.lastProbe = Date.now();
      s.checking = this.providers.refresh().then(() => {
        if (!s.ended && this.providers.state.gemini.state === 'connected') return s.finish('connected', 'Google subscription connected.');
      }).catch(() => {}).finally(() => { s.checking = null; });
    }
    return this.snapshot(id);
  }
  async cancel(id) {
    const s = this.sessions.get(id); if (!s || s.ended || !s.finish) return this.snapshot(id);
    s.cancelling = true;
    if (id === 'codex' && s.loginId) { try { await s.rpc('account/login/cancel', { loginId: s.loginId }); } catch { /* service closing */ } }
    await s.finish('cancelled', 'Sign-in cancelled. Existing account credentials were not removed.');
    return this.snapshot(id);
  }
  async stop() { await Promise.all([...this.sessions.keys()].map((id) => this.cancel(id))); }
}
