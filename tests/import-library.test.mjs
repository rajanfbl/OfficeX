import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { importLibrary } from '../server/import-library.mjs';

test('import library groups chats, preserves message order and reports shortened exports', () => {
  const company = fs.mkdtempSync(path.join(os.tmpdir(), 'officex-library-'));
  try {
    const root = path.join(company, 'imports', 'codex-chatgpt-2026-11-02');
    fs.mkdirSync(path.join(root, 'chatgpt'), { recursive: true });
    const id = '11111111-1111-4111-8111-111111111111';
    const write = (file, value) => fs.writeFileSync(path.join(root, file), JSON.stringify(value));
    write('projects.json', [{ projectId: 'project-one', label: 'One' }]);
    write('chatgpt-index.json', [{ id, title: 'Chat', projectId: 'project-one' }]);
    write(`chatgpt/${id}.json`, { truncated: true, pages: [{ turns: [
      { startedAt: 2, items: [{ id: 'answer', type: 'agentMessage', text: 'Later', truncated: true }] },
      { startedAt: 1, items: [{ id: 'question', type: 'userMessage', content: [{ type: 'text', text: 'First' }] }] },
    ] }] });
    assert.equal(importLibrary(company).entries[0].projectId, 'project-one');
    assert.equal(importLibrary(company).entries[0].available, true);
    const chat = importLibrary(company, id);
    assert.deepEqual(chat.messages.map(m => m.text), ['First', 'Later']);
    assert.equal(chat.truncated, true);
    assert.throws(() => importLibrary(company, '../../auth.json'), /Invalid chat ID/);
    assert.throws(() => importLibrary(company, '00000000-0000-0000-0000-000000000000'), /not finished importing/);
  } finally { fs.rmSync(company, { recursive: true, force: true }); }
});
