import fs from 'node:fs';
import path from 'node:path';

export function importLibrary(companyRoot, id) {
  const imports = path.join(companyRoot, 'imports');
  const snapshots = fs.existsSync(imports) ? fs.readdirSync(imports, { withFileTypes: true }).filter(d => d.isDirectory() && /^codex-chatgpt-\d{4}-\d{2}-\d{2}$/.test(d.name)).map(d => d.name).sort() : [];
  const root = path.join(imports, snapshots.at(-1) || 'empty-library');
  const read = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
  const projects = read(path.join(root, 'projects.json'), []).map(p => {
    const instructions = path.join(root, 'project-context', p.projectId, 'original-project-instructions.md');
    return { ...p, instructionsPath: fs.existsSync(instructions) ? path.relative(companyRoot, instructions).split(path.sep).join('/') : undefined };
  });
  const entries = ['codex', 'chatgpt'].flatMap(source => read(path.join(root, `${source}-index.json`), []).map(t => ({
    id: t.id, title: t.title, source, projectId: t.projectId || '', cwd: t.cwd || '', updatedAt: t.updatedAt,
    available: fs.existsSync(path.join(root, source, `${t.id}.json`)),
  })));
  const report = read(path.join(root, 'import-report.json'), null);
  if (!id) return { projects, entries, statusMessage: report?.message || '', scope: 'One-time local copies. Original chats stay unchanged. Attachments and service connections are not transferred. Some source messages may be shortened by the export service.' };
  if (!/^[a-f0-9-]{36}$/.test(id)) throw Error('Invalid chat ID');
  const entry = entries.find(t => t.id === id);
  if (!entry?.available) throw Error('This chat has not finished importing.');
  const data = read(path.join(root, entry.source, `${id}.json`), null);
  if (!data) throw Error('Could not read imported chat.');
  let messages = data.messages;
  if (!messages) {
    const seen = new Set();
    const turns = data.pages.flatMap(p => p.turns).reverse().sort((a,b) => (a.startedAt || 0) - (b.startedAt || 0));
    messages = turns.flatMap(t => t.items.filter(i => ['userMessage','agentMessage'].includes(i.type)).flatMap(i => {
      if (seen.has(i.id)) return []; seen.add(i.id);
      const text = i.type === 'agentMessage' ? i.text : (i.content || []).map(c => c.text || (c.type === 'image' ? '[Image attachment in original chat]' : '')).join('\n');
      return [{ id: i.id, role: i.type === 'userMessage' ? 'user' : 'assistant', text, truncated: !!i.truncated }];
    }));
  }
  return { entry, messages, truncated: !!data.truncated, importedAt: data.importedAt };
}
