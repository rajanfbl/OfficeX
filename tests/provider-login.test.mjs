import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { ProviderLogin, allowedLoginUrl } from '../server/engine/provider-login.mjs';
const tick = () => new Promise((r) => setTimeout(r, 10));
async function until(fn) { for (let i = 0; i < 100; i++) { if (fn()) return; await tick(); } throw Error('Login test timed out'); }
function fixture({ existing = false, accountType = 'chatgpt', provider = 'codex', timeoutMs = 2000 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'officex-oauth-'));
  const calls = []; let authenticated = existing;
  const providers = {
    bins: { codex: 'official-codex.exe', gemini: 'official-agy.exe' },
    state: { codex: { state: 'disconnected' }, gemini: { state: 'disconnected' } },
    enable() {},
    async refresh() { this.state[provider].state = authenticated ? 'connected' : 'disconnected'; },
    ready() { return authenticated; },
  };
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => { child.killed = true; };
  child.stdin = new EventEmitter(); child.stdin.end = () => {};
  const emit = (value) => child.stdout.write(JSON.stringify(value) + '\n');
  child.stdin.write = (line) => {
    const m = JSON.parse(line); calls.push(m);
    if (!m.method) return true;
    queueMicrotask(() => {
      if (m.method === 'initialize') emit({ id: m.id, result: {} });
      if (m.method === 'account/login/start') emit({ id: m.id, result: m.params.type === 'chatgptDeviceCode' ? { loginId: 'login-1', verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'TEST-1234' } : { loginId: 'login-1', authUrl: 'https://auth.openai.com/authorize?state=test' } });
      if (m.method === 'account/read') { authenticated = accountType === 'chatgpt'; emit({ id: m.id, result: { account: { type: accountType } } }); }
      if (m.method === 'account/login/cancel') emit({ id: m.id, result: {} });
    }); return true;
  };
  let spawnOptions;
  const login = new ProviderLogin({ providers, cfg: { companyRoot: root, python: 'python.exe' }, appRoot: root, timeoutMs, spawnProcess: (bin, args, opts) => { spawnOptions = { bin, args, opts }; return child; } });
  return { login, child, calls, emit, providers, options: () => spawnOptions, authenticate: () => { authenticated = true; } };
}
test('OAuth URLs are restricted to the actual provider origins', () => {
  assert.equal(allowedLoginUrl('codex', 'https://auth.openai.com/authorize?state=abc'), true);
  assert.equal(allowedLoginUrl('gemini', 'https://accounts.google.com/o/oauth2/v2/auth?state=abc'), true);
  for (const url of ['http://auth.openai.com/authorize', 'https://auth.openai.com.evil.test/a', 'https://user:secret@auth.openai.com/a', 'javascript:alert(1)']) assert.equal(allowedLoginUrl('codex', url), false);
  assert.equal(allowedLoginUrl('gemini', 'https://accounts.google.com/something-else'), false);
});
test('existing OAuth account is reused without spawning a login or logging out', async () => {
  const f = fixture({ existing: true }); const s = await f.login.start('codex');
  assert.equal(s.phase, 'connected'); assert.equal(f.options(), undefined); assert.deepEqual(f.calls, []);
  await f.login.stop();
  assert.equal(f.login.snapshot('codex').phase, 'connected');
});
test('ChatGPT browser OAuth completes through official app-server events without exposing tokens', async () => {
  const f = fixture(); await f.login.start('codex');
  await until(() => f.login.snapshot('codex').phase === 'waiting');
  assert.equal(f.options().args[0], 'app-server');
  assert.equal(f.options().opts.env.OPENAI_API_KEY, undefined);
  f.emit({ method: 'account/login/completed', params: { loginId: 'login-1', success: true } });
  await until(() => f.login.snapshot('codex').phase === 'connected');
  assert.equal(f.login.snapshot('codex').url, undefined);
  assert.ok(!JSON.stringify(f.login.snapshot('codex')).includes('accessToken'));
  assert.ok(!f.calls.some((r) => /turn\/|thread\/|logout/.test(r.method || '')));
});
test('API-key account is rejected after login; device code and cancellation stay scoped', async () => {
  const f = fixture({ accountType: 'apiKey' }); await f.login.start('codex', { deviceCode: true });
  await until(() => f.login.snapshot('codex').phase === 'waiting');
  assert.equal(f.login.snapshot('codex').userCode, 'TEST-1234');
  f.emit({ method: 'account/login/completed', params: { loginId: 'login-1', success: true } });
  await until(() => f.login.snapshot('codex').phase === 'failed');
  const c = fixture(); await c.login.start('codex'); await until(() => c.login.snapshot('codex').phase === 'waiting');
  assert.equal((await c.login.cancel('codex')).phase, 'cancelled');
  assert.ok(c.calls.some((r) => r.method === 'account/login/cancel'));
  assert.ok(!c.calls.some((r) => r.method === 'account/logout'));
});
test('Google code is accepted only for an active official URL and never placed in public state', async () => {
  const f = fixture({ provider: 'gemini' }); await f.login.start('gemini');
  assert.throws(() => f.login.submit('gemini', '4/abcdefghijklmnop'), /fresh/);
  f.emit({ event: 'url', url: 'https://accounts.google.com/o/oauth2/auth?state=test' });
  await until(() => f.login.snapshot('gemini').phase === 'waiting');
  assert.throws(() => f.login.submit('gemini', 'password'), /authorization code/);
  f.login.submit('gemini', '4/abcdefghijklmnop');
  assert.equal(f.login.snapshot('gemini').phase, 'verifying');
  assert.ok(!JSON.stringify(f.login.snapshot('gemini')).includes('4/abcdefghijklmnop'));
  f.authenticate(); f.emit({ event: 'connected' });
  await until(() => f.login.snapshot('gemini').phase === 'connected');
});
test('expired or redirected Google login fails closed', async () => {
  const f = fixture({ provider: 'gemini', timeoutMs: 40 }); await f.login.start('gemini');
  await until(() => f.login.snapshot('gemini').phase === 'expired');
  assert.throws(() => f.login.submit('gemini', '4/abcdefghijklmnop'), /fresh/);
  const g = fixture({ provider: 'gemini' }); await g.login.start('gemini');
  g.emit({ event: 'url', url: 'https://evil.test/oauth' });
  await until(() => g.login.snapshot('gemini').phase === 'failed');
  assert.equal(g.login.snapshot('gemini').url, undefined);
});
test('Google success is verified even if the official terminal redraws without a success sentence', async () => {
  const f = fixture({ provider: 'gemini' }); await f.login.start('gemini');
  f.emit({ event: 'url', url: 'https://accounts.google.com/o/oauth2/auth?state=test' });
  await until(() => f.login.snapshot('gemini').phase === 'waiting');
  f.login.submit('gemini', '4/abcdefghijklmnop'); f.authenticate(); f.login.check('gemini');
  await until(() => f.login.snapshot('gemini').phase === 'connected');
});
