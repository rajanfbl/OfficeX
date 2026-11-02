import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildLaunch, localEnv, runLocalTurn, providerFor } from '../server/engine/providers.mjs';
import { readCompanyFile } from '../server/engine/company-files.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'officex-providers-'));
const mcp = { officex: { command: process.execPath, args: ['office-tools.mjs'], env: { OFFICEX_URL: 'http://127.0.0.1:4181', OFFICEX_TURN_TOKEN: 'test-secret' } } };
test('cross-provider file reader respects company scope and protects credentials', () => {
  const own = path.join(root, 'employees/own'); fs.mkdirSync(own, { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
  fs.mkdirSync(path.join(root, 'office'), { recursive: true });
  fs.writeFileSync(path.join(own, 'note.md'), 'own context');
  fs.writeFileSync(path.join(root, 'projects/source.md'), 'shared context');
  fs.writeFileSync(path.join(root, 'office/claude-account.json'), 'private');
  assert.equal(readCompanyFile(root, own, false, 'employees/own/note.md'), 'own context');
  assert.equal(readCompanyFile(root, own, true, 'projects/source.md'), 'shared context');
  assert.throws(() => readCompanyFile(root, own, false, 'projects/source.md'), /permission/);
  assert.throws(() => readCompanyFile(root, own, true, '../outside.txt'), /outside/);
  assert.throws(() => readCompanyFile(root, own, true, 'office/claude-account.json'), /private/);
  try {
    fs.symlinkSync(path.join(root, 'office'), path.join(own, 'linked'), 'junction');
    assert.throws(() => readCompanyFile(root, own, true, 'employees/own/linked/claude-account.json'), /private/);
  } catch (e) { if (!['EPERM', 'EACCES'].includes(e.code)) throw e; }
});
test('provider choice and paid credential isolation', () => {
  assert.equal(providerFor('gpt-6.1-sol'), 'codex');
  assert.equal(providerFor('gemini-3.8-flash-medium'), 'gemini');
  assert.equal(providerFor('claude-sonnet-5-5'), 'claude');
  const env = localEnv({ OPENAI_API_KEY: 'secret', GEMINI_API_KEY: 'secret', OFFICEX_TURN_TOKEN: 'local' });
  assert.equal(env.OPENAI_API_KEY, undefined); assert.equal(env.GEMINI_API_KEY, undefined);
  assert.equal(env.OFFICEX_TURN_TOKEN, 'local');
});
test('Codex read-only and resumed sessions retain restricted settings', () => {
  const opts = { provider: 'codex', model: 'gpt-6.1-sol', cwd: root, mcp, permissions: [], role: 'advisor', companyRoot: root };
  const fresh = buildLaunch(opts).args;
  const resumed = buildLaunch({ ...opts, session: 'specific-session' }).args;
  assert.ok(fresh.includes('sandbox_mode="read-only"'));
  assert.ok(resumed.includes('sandbox_mode="read-only"'));
  assert.ok(resumed.includes('specific-session'));
  assert.ok(fresh.includes('features.shell_tool=false'));
  assert.ok(fresh.includes('features.multi_agent=false'));
  assert.ok(fresh.includes('features.hooks=false'));
  assert.ok(!fresh.join(' ').includes('test-secret'));
  assert.ok(fresh.join(' ').includes('OFFICEX_TURN_TOKEN'));
  assert.ok(!fresh.join(' ').includes('dangerously'));
});
test('Gemini preserves local MCP without saving turn credentials or changing global settings', () => {
  const launch = buildLaunch({ provider: 'gemini', model: 'gemini-3.8-flash-medium', cwd: root, mcp, permissions: [], role: 'advisor', companyRoot: root });
  const settings = JSON.parse(launch.args[launch.args.indexOf('--settings') + 1]);
  assert.equal(settings.useG1Credits, false);
  assert.equal(settings.allowNonWorkspaceAccess, false);
  assert.ok(settings.permissions.deny.includes('command(*)'));
  assert.ok(settings.permissions.deny.includes('write_file(*)'));
  const config = fs.readFileSync(path.join(root, '.agents/mcp_config.json'), 'utf8');
  assert.ok(!config.includes('test-secret'));
  assert.equal(JSON.parse(config).mcpServers.officex.command, process.execPath);
});
test('streaming result preserves Unicode and reported usage; exit zero alone is not success', async () => {
  const script = path.join(root, 'fake.mjs');
  fs.writeFileSync(script, `const b=Buffer.from(JSON.stringify({event:'result',result:{status:'SUCCESS',response:'Hello 🌍',usage:{input_tokens:7,output_tokens:2}}})); process.stdout.write(b.subarray(0,75)); setTimeout(()=>process.stdout.end(b.subarray(75)),20);`);
  const args = { bin: process.execPath, provider: 'gemini', cwd: root, prompt: '', env: {}, timeoutMs: 3000 };
  const r = await runLocalTurn({ ...args, launch: { args: [script], input: () => '' } }).done;
  assert.equal(r.ok, true); assert.equal(r.text, 'Hello 🌍'); assert.equal(r.usage.input_tokens, 7);
  fs.writeFileSync(script, `process.stdout.write('diagnostic only');`);
  const missing = await runLocalTurn({ ...args, launch: { args: [script], input: () => '' } }).done;
  assert.equal(missing.ok, false); assert.equal(missing.usage, null);
});
test('hung worker stops with a visible timeout failure', async () => {
  const script = path.join(root, 'hang.mjs'); fs.writeFileSync(script, 'setInterval(()=>{},1000);');
  const r = await runLocalTurn({ bin: process.execPath, provider: 'gemini', cwd: root, prompt: '', env: {}, timeoutMs: 150, launch: { args: [script], input: () => '' } }).done;
  assert.equal(r.ok, false); assert.match(r.error, /timed out/);
});
