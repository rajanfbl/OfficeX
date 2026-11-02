import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseWhatsApp, whatsappLibrary } from '../server/whatsapp-library.mjs';

test('WhatsApp import handles Android, iPhone, multiline and system messages without guessing date order', () => {
  const android = parseWhatsApp('02/11/26, 09:15 - Messages are encrypted\n02/11/26, 09:16 - Alex: First line\nSecond line');
  assert.equal(android[0].sender, '');
  assert.equal(android[1].timestampLabel, '02/11/26, 09:16');
  assert.equal(android[1].text, 'First line\nSecond line');
  const iphone = parseWhatsApp('\u200e[11/2/26, 9:17:05 AM] Sam: Hello');
  assert.equal(iphone[0].sender, 'Sam');
  assert.equal(iphone[0].text, 'Hello');
  assert.throws(() => parseWhatsApp('binary\0input'), /text export/);
  assert.throws(() => parseWhatsApp('x'.repeat(2_000_001)), /2 MB/);
});
test('chat copies and drafts persist locally, deduplicate within scope, and reject traversal', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'officex-whatsapp-'));
  try {
    const lib = whatsappLibrary(root), input = { text: '02/11/26, 09:16 - Alex: Hello', name: 'Test', scope: 'personal' };
    const first = lib.import(input);
    assert.equal(lib.import(input).duplicate, true);
    const other = lib.import({ ...input, scope: 'separate-project' });
    assert.notEqual(first.id, other.id);
    assert.equal(lib.get(first.id).messages[0].text, 'Hello');
    assert.equal(whatsappLibrary(root).list().chats.length, 2);
    assert.throws(() => lib.get('../../auth.json'), /Invalid/);
    assert.throws(() => lib.import({ ...input, scope: '../escape' }), /scope/);
    assert.throws(() => lib.draft({ phone: '08123', text: 'No', scope: 'personal' }), /country code/);
    lib.draft({ phone: '+62 812-3456-789', text: 'Draft only', scope: 'personal' });
    assert.equal(whatsappLibrary(root).list().drafts[0].phone, '628123456789');
    assert.equal(lib.list().liveSync, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
