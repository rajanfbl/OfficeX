import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function parseWhatsApp(text) {
  if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text, 'utf8') > 2_000_000 || text.includes('\0')) throw Error('Choose a non-empty WhatsApp text export under 2 MB.');
  const messages = [];
  for (const line of text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')) {
    const clean = line.replace(/[\u200e\u200f\u202a-\u202e]/g, '');
    const match = clean.match(/^(?:\[([^\]]{6,50})\]\s+|([\d][\d/.,\s:APMapm\u202f-]{5,50})\s+-\s+)(.*)$/);
    if (match) {
      const body = match[3], sender = body.match(/^([^:]{1,120}):\s?(.*)$/);
      messages.push({ timestampLabel: match[1] || match[2], sender: sender?.[1] || '', text: sender ? sender[2] : body });
    } else if (messages.length) messages.at(-1).text += '\n' + line;
    else if (line.trim()) messages.push({ timestampLabel: '', sender: '', text: line });
  }
  return messages;
}
export function whatsappLibrary(companyRoot) {
  if (!companyRoot) throw Error('Choose an OfficeX company folder first.');
  const root = path.join(companyRoot, 'imports', 'whatsapp');
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const folder = kind => path.join(root, kind);
  const scopeOf = value => { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(value)) throw Error('Choose a valid project scope.'); return value; };
  const fileOf = (kind, id) => { if (!/^[a-f0-9]{24}$/.test(id || '')) throw Error('Invalid saved item.'); return path.join(folder(kind), id + '.json'); };
  const list = kind => fs.existsSync(folder(kind)) ? fs.readdirSync(folder(kind)).filter(n => /^[a-f0-9]{24}\.json$/.test(n)).map(n => { const item = read(path.join(folder(kind), n)); return kind === 'chats' ? { id: item.id, name: item.name, scope: item.scope, count: item.messages.length, createdAt: item.createdAt } : item; }).sort((a,b) => b.createdAt.localeCompare(a.createdAt)) : [];
  const save = (kind, item) => { fs.mkdirSync(folder(kind), { recursive: true }); fs.writeFileSync(fileOf(kind, item.id), JSON.stringify(item), { encoding: 'utf8', flag: 'wx' }); return item; };
  return {
    list: () => ({ chats: list('chats'), drafts: list('drafts'), mode: 'manual-and-export', liveSync: false }),
    get: id => read(fileOf('chats', id)),
    import(body) {
      const scope = scopeOf(body.scope || 'personal');
      const messages = parseWhatsApp(body.text);
      const id = crypto.createHash('sha256').update(scope + '\0' + body.text).digest('hex').slice(0,24);
      if (fs.existsSync(fileOf('chats', id))) return { ...read(fileOf('chats', id)), duplicate: true };
      return save('chats', { id, scope, name: String(body.name || 'WhatsApp chat').slice(0,120), createdAt: new Date().toISOString(), messages });
    },
    draft(body) {
      const scope = scopeOf(body.scope || 'personal');
      const phone = String(body.phone || '').replace(/[ +()-]/g, '');
      if (!/^[1-9]\d{6,14}$/.test(phone)) throw Error('Use the full phone number with country code, for example 628123456789.');
      if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 1000) throw Error('Enter a message of 1–1000 characters.');
      return save('drafts', { id: crypto.randomBytes(12).toString('hex'), scope, phone, text: body.text, createdAt: new Date().toISOString() });
    },
  };
}
