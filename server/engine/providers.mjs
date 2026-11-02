// Official local CLIs own authentication. OfficeX never copies their login tokens.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync, execFileSync, execFile } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import statusTools from './codex-status.cjs';

export const EXTRA_MODELS = ['gpt-6.1-sol', 'gemini-3.8-flash-medium', 'gemini-3.8-flash-low', 'gemini-3.8-flash-high'];
export const providerFor = (model) => model?.startsWith('gemini-') ? 'gemini' : model?.startsWith('gpt-') ? 'codex' : 'claude';
export const DEFAULT_MODEL = 'gpt-6.1-sol';
export function localEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'ANTHROPIC_API_KEY', 'CLAUDECODE', 'CLAUDE_CODE_SESSION_ID']) delete env[key];
  for (const key of Object.keys(env)) if (env[key] == null) delete env[key];
  return env;
}
const run = (bin, args, timeout = 15000) => new Promise((resolve, reject) => execFile(bin, args, { env: localEnv(), windowsHide: true, timeout, maxBuffer: 1000000 }, (err, stdout, stderr) => err ? reject(new Error(String(stderr || err.message).slice(0, 400))) : resolve(String(stdout) + '\n' + String(stderr))));
function findExe(configured, name) {
  if (configured && fs.existsSync(configured)) return configured;
  try { return execFileSync('where.exe', [name], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/).find((p) => p.endsWith('.exe')) || ''; } catch { return ''; }
}
export function assertGoogleSubscription() {
  const file = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'settings.json');
  if (!fs.existsSync(file)) return;
  const settings = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  if (settings.modelProvider === 'gemini') throw new Error('Gemini is configured for paid API access. Select the subscription login in Antigravity first.');
}

export function createProviders({ cfg, companyRoot, appRoot }) {
  const file = path.join(companyRoot, 'office', 'providers.json');
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first start */ }
  const state = {
    codex: { id: 'codex', label: 'Codex / ChatGPT', enabled: saved.codex !== false, state: 'disconnected', detail: 'Not checked', models: ['gpt-6.1-sol'] },
    gemini: { id: 'gemini', label: 'Gemini / Antigravity', enabled: saved.gemini !== false, state: 'disconnected', detail: 'Not checked', models: EXTRA_MODELS.filter((m) => m.startsWith('gemini-')) },
  };
  const bins = {
    codex: findExe(cfg.codexPath, 'codex.exe'),
    gemini: findExe(cfg.geminiPath, 'agy.exe'),
  };
  const ledger = path.join(companyRoot, 'office', 'provider-usage.jsonl');
  let refreshing;
  async function refresh(withQuota = false) {
    if (refreshing) return refreshing;
    refreshing = Promise.all(Object.values(state).map(async (p) => {
      p.checkedAt = Date.now();
      if (!p.enabled) { p.state = 'disconnected'; p.identity = undefined; p.detail = 'Disabled in OfficeX'; return; }
      if (!bins[p.id]) { p.state = 'disconnected'; p.identity = undefined; p.detail = 'Local CLI not found'; return; }
      try {
        if (p.id === 'codex') {
          const status = await run(bins.codex, ['login', 'status']);
          if (!/ChatGPT/i.test(status)) throw new Error('Sign in to Codex with ChatGPT. API-key accounts are not enabled here.');
          p.detail = 'Existing ChatGPT login; plan limits apply';
          p.identity = undefined;
          try {
              const q = await statusTools.codexStatus(bins.codex);
              p.identity = q.account || undefined;
              p.identityNote = q.accountError || (q.account?.email ? '' : 'Codex did not provide an account email.');
              if (withQuota) {
              const limits = q.limits?.rateLimits;
              p.quota = limits ? { primary: limits.primary, secondary: limits.secondary, credits: limits.credits, checkedAt: Date.now() } : undefined;
              p.quotaError = q.limitsError;
              }
          } catch (e) { p.identityNote = 'Account details could not be checked. Try Check connection again.'; if (withQuota) p.quotaError = e.message; }
        } else {
          assertGoogleSubscription();
          const models = await run(bins.gemini, ['models']);
          const available = models.split(/\r?\n/).map((s) => s.split(/\s/)[0]).filter((s) => s.startsWith('gemini-'));
          if (!available.length) throw new Error('Sign in to Antigravity with your Google account first.');
          p.models = available;
          p.detail = 'Existing Google login; extra AI-credit spending disabled';
          p.identityNote = 'This Antigravity connection check does not return the signed-in Google email. Check the account in Antigravity.';
        }
        p.state = 'connected';
      } catch (err) { p.state = 'disconnected'; p.identity = undefined; p.detail = err.message; }
    })).finally(() => { refreshing = null; });
    return refreshing;
  }
  function record(model, result) {
    fs.mkdirSync(path.dirname(ledger), { recursive: true });
    fs.appendFileSync(ledger, JSON.stringify({ at: Date.now(), provider: providerFor(model), model, ok: result.ok, usage: result.usage ?? null }) + '\n');
  }
  function usage() {
    const totals = {};
    if (fs.existsSync(ledger)) for (const line of fs.readFileSync(ledger, 'utf8').split('\n').filter(Boolean)) {
      try {
        const r = JSON.parse(line);
        const p = totals[r.provider] ??= { requests: 0, failed: 0, input: 0, output: 0, unreported: 0 };
        p.requests++; if (!r.ok) p.failed++;
        if (r.usage) { p.input += r.usage.input_tokens ?? 0; p.output += r.usage.output_tokens ?? 0; } else p.unreported++;
      } catch { /* tolerate interrupted last append */ }
    }
    return { totals, scope: 'OfficeX requests only. Missing token counts are unknown. Tokens are not money or remaining plan credits.' };
  }
  return {
    state, bins, refresh, record, usage,
    ready: (model) => state[providerFor(model)]?.state === 'connected',
    enable(id, enabled) {
      if (!state[id] || typeof enabled !== 'boolean') throw new Error('Unknown provider or invalid enabled value');
      state[id].enabled = enabled;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(Object.fromEntries(Object.values(state).map((p) => [p.id, p.enabled])), null, 2));
    },
    invalidate(model, detail) { const p = state[providerFor(model)]; if (p) { p.state = 'disconnected'; p.identity = undefined; p.detail = detail; } },
  };
}

export function buildLaunch({ provider, model, effort, cwd, session, mcp, permissions = [], role, companyRoot }) {
  const writable = role !== 'advisor' && (permissions.includes('write_workspace') || permissions.includes('write_projects') || role === 'manager' || role === 'secretary');
  if (provider === 'codex') {
    const args = ['exec', ...(session ? ['resume'] : []), '--ignore-user-config', '--skip-git-repo-check', '--json', '-m', model];
    const config = { model_provider: 'openai', model_reasoning_effort: effort || 'medium', sandbox_mode: writable ? 'workspace-write' : 'read-only', approval_policy: 'never' };
    config['features.shell_tool'] = permissions.includes('run_commands') || permissions.includes('office_files');
    config['features.multi_agent'] = false;
    config['features.hooks'] = false;
    config['features.apps'] = false;
    config['features.remote_plugin'] = false;
    config.web_search = permissions.includes('web') ? 'live' : 'disabled';
    for (const [key, value] of Object.entries(config)) args.push('-c', `${key}=${JSON.stringify(value)}`);
    if (permissions.includes('write_projects') && role !== 'advisor') args.push('-c', `sandbox_workspace_write.writable_roots=${JSON.stringify([path.join(companyRoot, 'projects')])}`);
    for (const [name, server] of Object.entries(mcp)) {
      // Only the OfficeX server: other providers' browser plugins are not silently inherited.
      if (name !== 'officex') continue;
      args.push('-c', `mcp_servers.${name}.command=${JSON.stringify(server.command)}`, '-c', `mcp_servers.${name}.args=${JSON.stringify(server.args)}`);
      for (const [k, v] of Object.entries(server.env ?? {})) if (k !== 'OFFICEX_TURN_TOKEN') args.push('-c', `mcp_servers.${name}.env.${k}=${JSON.stringify(v)}`);
      args.push('-c', `mcp_servers.${name}.env_vars=["OFFICEX_TURN_TOKEN"]`);
      for (const tool of ['read_file', 'list_files']) args.push('-c', `mcp_servers.${name}.tools.${tool}.approval_mode="approve"`);
      // Pre-authorize only this app's local operations. Engine role, project and turn-token checks still apply.
      // External Telegram sending remains subject to provider approval.
      for (const tool of ['send_message', 'list_team', 'remember', 'forget', 'plan_usage', 'show_on_projector', 'show_live_chart', 'ask_team', 'send_to_secretary', 'schedule_add', 'schedule_list', 'schedule_remove', 'schedule_enable', 'create_project', 'move_file', 'reminder_add', 'reminder_list', 'reminder_cancel']) args.push('-c', `mcp_servers.${name}.tools.${tool}.approval_mode="approve"`);
    }
    if (session) args.push(session);
    args.push('-');
    return { args, input: (prompt) => prompt };
  }
  assertGoogleSubscription();
  const allow = ['mcp(officex/*)'];
  const deny = [];
  if (!permissions.includes('run_commands') && !permissions.includes('office_files')) deny.push('command(*)');
  if (!writable) deny.push('write_file(*)');
  if (!permissions.includes('web')) deny.push('read_url(*)');
  const settings = { useG1Credits: false, modelProvider: '', allowNonWorkspaceAccess: false, toolPermission: 'request-review', permissions: { allow, deny } };
  const args = ['--mode', writable ? 'accept-edits' : 'plan', '--settings', JSON.stringify(settings), '--model', model, '--effort', effort || 'medium', '--input-format', 'stream-json', '--output-format', 'stream-json'];
  if (session) args.push('--conversation', session);
  if (permissions.includes('write_projects') && role !== 'advisor') args.push('--add-dir', path.join(companyRoot, 'projects'));
  // Workspace-scoped MCP config; per-turn bearer token is inherited from the worker environment.
  const agentDir = path.join(cwd, '.agents');
  fs.mkdirSync(agentDir, { recursive: true });
  const localMcp = structuredClone(mcp.officex);
  delete localMcp.env.OFFICEX_TURN_TOKEN;
  fs.writeFileSync(path.join(agentDir, 'mcp_config.json'), JSON.stringify({ mcpServers: { officex: localMcp } }, null, 2));
  return { args, input: (prompt) => JSON.stringify({ event: 'user', message: { content: prompt } }) + '\n' };
}

export function runLocalTurn({ bin, provider, launch, cwd, prompt, env, timeoutMs, cb = {} }) {
  if (provider === 'codex') {
    const login = spawnSync(bin, ['login', 'status'], { env: localEnv(), windowsHide: true, encoding: 'utf8', timeout: 10000 });
    if (login.status !== 0 || !/Logged in using ChatGPT/i.test(String(login.stdout) + String(login.stderr))) throw new Error('Codex requires the existing ChatGPT subscription login; paid API credentials are not used.');
  }
  const child = spawn(bin, launch.args, { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: localEnv(env) });
  const result = { ok: false, text: '', error: '', stderr: '', usage: null, context: 0 };
  const decoder = new StringDecoder('utf8');
  let buffer = '', completed = false, settled = false;
  function event(e) {
    if (provider === 'codex') {
      if (e.type === 'thread.started') cb.onInit?.(e.thread_id);
      if (e.type === 'item.completed' && e.item?.type === 'agent_message' && e.item.phase !== 'commentary') result.text += (result.text ? '\n\n' : '') + (e.item.text || '');
      if (e.type === 'item.started' && e.item?.type === 'mcp_tool_call') cb.onTool?.({ tool: e.item.tool, detail: String(e.item.server || ''), kind: 'Read' });
      if (e.type === 'item.started' && e.item?.type === 'command_execution') cb.onTool?.({ tool: 'Bash', detail: e.item.command || '', kind: 'Bash' });
      if (e.type === 'turn.completed') { completed = true; result.usage = e.usage ?? null; }
      if (e.type === 'error' || e.type === 'turn.failed') result.error = String(e.message || e.error?.message || 'Codex turn failed');
    } else {
      if (e.event === 'step_update') {
        const s = e.step_update ?? {};
        if (s.conversation_id) cb.onInit?.(s.conversation_id);
        if (s.tool_name && s.state === 'ACTIVE') cb.onTool?.({ tool: s.tool_name, detail: '', kind: 'Read' });
        if (s.text_delta) cb.onText?.(s.text_delta);
      }
      if (e.event === 'result') {
        const r = e.result ?? e;
        if (r.conversation_id) cb.onInit?.(r.conversation_id);
        completed = r.status === 'SUCCESS'; result.text = r.response || ''; result.usage = r.usage ?? null;
        if (!completed) result.error = String(r.error || r.status || 'Gemini turn failed');
      }
    }
  }
  const done = new Promise((resolve) => {
    const finish = () => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      result.ok = completed && !result.error;
      if (!result.ok && !result.error) result.error = result.stderr.slice(-1500) || 'Worker stopped before completing';
      // Context and billable token totals differ; do not turn cumulative usage into context size.
      resolve(result);
    };
    const timer = setTimeout(() => { result.error = 'Turn timed out'; child.kill(); finish(); }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      buffer += decoder.write(chunk);
      if (buffer.length > 4_000_000) { result.error = 'Worker output exceeded limit'; child.kill(); return finish(); }
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, i); buffer = buffer.slice(i + 1); try { event(JSON.parse(line)); } catch { /* non-JSON diagnostics */ } }
    });
    child.stderr.on('data', (c) => { result.stderr = (result.stderr + c.toString()).slice(-4000); });
    child.on('error', (e) => { result.error = e.message; finish(); });
    child.on('close', (code) => {
      buffer += decoder.end(); if (buffer.trim()) { try { event(JSON.parse(buffer)); } catch { /* diagnostics */ } }
      if (code !== 0 && !result.error) result.error = `Worker exited ${code}: ${result.stderr.slice(-1000)}`;
      finish();
    });
    child.stdin.on('error', () => {});
    child.stdin.end(launch.input(prompt));
  });
  return { child, done };
}
