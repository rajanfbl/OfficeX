import { useEffect, useState } from 'react';
import { api } from '../api';
import { Markdown } from './Markdown';

type Entry = { id: string; title: string; source: string; projectId: string; available: boolean };
type Index = { entries: Entry[]; projects: { projectId: string; label: string; instructionsPath?: string }[]; scope: string; statusMessage?: string };
type Chat = { entry: Entry; messages: { id: string; role: string; text: string; truncated?: boolean }[]; truncated: boolean };
export function ImportLibrary({ close }: { close: () => void }) {
  const [index, setIndex] = useState<Index>();
  const [chat, setChat] = useState<Chat>();
  const [query, setQuery] = useState('');
  const [project, setProject] = useState('all');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(50);
  useEffect(() => { const refresh = () => { void api<Index>('GET', 'api/import-library').then(setIndex).catch(e => setError(e.message)); }; refresh(); const timer = setInterval(refresh, 15000); return () => clearInterval(timer); }, []);
  async function open(id: string) { setBusy(true); setError(''); try { setChat(await api<Chat>('GET', `api/import-library?id=${encodeURIComponent(id)}`)); setVisible(50); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } }
  const entries = index?.entries.filter(e => (project === 'all' || e.projectId === project) && e.title.toLowerCase().includes(query.toLowerCase())) || [];
  const instructions = index?.projects.find(p => p.projectId === project)?.instructionsPath;
  return <div className="import-library" role="dialog" aria-modal="true" aria-label="Imported chats">
    <header><div><strong>Imported chats & projects</strong><div className="muted small">{index?.entries.filter(e => e.available).length || 0} of {index?.entries.length || 0} chats imported · copies on this laptop</div></div><button className="btn" onClick={close}>Close</button></header>
    <div className="import-library__body"><aside>
      {index?.statusMessage && <p className="small" role="status">{index.statusMessage}</p>}
      <input className="input" placeholder="Search chat titles" aria-label="Search imported chats" value={query} onChange={e => setQuery(e.target.value)} />
      <select className="input" aria-label="Imported project" value={project} onChange={e => setProject(e.target.value)}><option value="all">All projects & chats</option><option value="">Other chats</option>{index?.projects.map(p => <option key={p.projectId} value={p.projectId}>{p.label}</option>)}</select>
      {instructions && <a href={`api/files?path=${encodeURIComponent(instructions)}`} target="_blank" rel="noreferrer">View copied project instructions</a>}
      <div className="import-library__list">{entries.map(e => <button key={e.id} className={`btn ${chat?.entry.id === e.id ? 'btn--primary' : 'btn--ghost'}`} disabled={!e.available || busy} onClick={() => void open(e.id)}><span>{e.title}</span><small>{e.source === 'codex' ? 'Codex' : 'ChatGPT'}{!e.available ? ' · pending import' : ''}</small></button>)}</div>
    </aside><main>{error && <p role="alert">{error}</p>}{busy ? <p>Opening chat…</p> : chat ? <><h2>{chat.entry.title}</h2><p className="muted small">Imported history · {chat.entry.source}. This copy does not sync or start an AI task.</p>{chat.truncated && <p role="note">Some long messages were shortened by the source export.</p>}{chat.messages.length > visible && <button className="btn" onClick={() => setVisible(visible + 50)}>Show 50 older messages</button>}{chat.messages.slice(-visible).map((m, i) => <article key={`${m.id}-${i}`} className="import-library__message"><strong>{m.role === 'user' ? 'You' : 'Assistant'}</strong><Markdown text={m.text || '[Attachment or empty message]'} />{m.truncated && <p className="muted">[Message shortened by source]</p>}</article>)}</> : <><h2>Your chat library</h2><p>Select a project and chat to read its history.</p><p>{index?.scope}</p><p>PLN, Finance and other chats keep their original groups. No history is sent to an AI provider just by opening it.</p></>}</main></div>
  </div>;
}
