import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import policy from '../desktop/policy.cjs';

test('desktop connects only to its local office page', () => {
  const settings = { origin: 'http://127.0.0.1:4180', url: 'http://127.0.0.1:4180/OfficeX/' };
  assert.equal(policy.mainNavigation(settings.url, settings), true);
  assert.equal(policy.mainNavigation(settings.url + '#chat', settings), true);
  for (const value of ['https://evil.test/', 'http://127.0.0.1:4181/OfficeX/', 'http://127.0.0.1:4180/api/files', 'file:///C:/secret', 'javascript:alert(1)']) assert.equal(policy.mainNavigation(value, settings), false);
});
test('external links permit HTTPS and office attachments, never native executable protocols', () => {
  const settings = { origin: 'http://127.0.0.1:4180' };
  assert.equal(policy.externalLink('https://accounts.google.com/o/oauth2/auth?state=example', settings), true);
  assert.equal(policy.externalLink('http://127.0.0.1:4180/OfficeX/api/files?path=test.pdf', settings), true);
  for (const value of ['file:///C:/secret', 'javascript:alert(1)', 'ms-settings:privacy', 'http://evil.test/', 'https://user:secret@example.com/', 'http://127.0.0.1:4180/api/shutdown']) assert.equal(policy.externalLink(value, settings), false);
});
test('desktop reads the existing company configuration without creating or moving data', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'officex-desktop-'));
  fs.mkdirSync(path.join(root, 'server'));
  fs.writeFileSync(path.join(root, 'server/serve.mjs'), '// fixture only');
  const file = path.join(root, 'server.json');
  fs.writeFileSync(file, JSON.stringify({ companyRoot: path.join(root, 'company'), port: 4180, basePath: '/OfficeX' }));
  const instance = path.join(root, 'instance.json');
  fs.writeFileSync(instance, JSON.stringify({ sourceRoot: root, serverConfig: file, nodePath: 'trusted-node.exe' }));
  const before = fs.readFileSync(file, 'utf8');
  const settings = policy.loadSettings(instance);
  assert.equal(settings.url, 'http://127.0.0.1:4180/OfficeX/');
  assert.equal(settings.nodePath, 'trusted-node.exe');
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(fs.existsSync(path.join(root, 'company')), false);
  fs.writeFileSync(file, JSON.stringify({ companyRoot: 'example', port: 99999 }));
  assert.throws(() => policy.loadSettings(instance), /invalid local port/);
});
