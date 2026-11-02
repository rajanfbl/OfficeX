import { useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { MODELS, type ModelId, type ProviderConnection } from '../types';
const fallbackProvider = (id: string) => id.startsWith('gpt-') ? 'codex' : id.startsWith('gemini-') ? 'gemini' : 'claude';
export function ModelPicker({ model, onChange, lockedClaude = false, id = 'model' }: { model: ModelId; onChange: (model: ModelId) => void; lockedClaude?: boolean; id?: string }) {
  const providers = useStore(s => s.providers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const providerOf = (value: string) => Object.values(providers || {}).find(p => p.models.includes(value))?.id || fallbackProvider(value);
  const provider = providerOf(model);
  const list = (which: string) => {
    const p = providers?.[which];
    return p?.models.length ? p.models.map(value => ({ id: value, label: p.modelCatalog?.find(m => m.id === value)?.label || MODELS.find(m => m.id === value)?.label || value })) : MODELS.filter(m => fallbackProvider(m.id) === which);
  };
  const options = list(provider);
  if (!options.some(m => m.id === model)) options.push({ id: model, label: `${model} (saved model; not in latest list)` });
  async function refresh() {
    setBusy(true); setError('');
    try { const r = await api<{ providers: Record<string, ProviderConnection> }>('POST', 'api/providers/refresh', {}); useStore.setState({ providers: r.providers }); }
    catch(e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="model-picker">
    <div><label htmlFor={`${id}-provider`}>AI provider</label><select id={`${id}-provider`} className="input" value={provider} disabled={lockedClaude} onChange={e => { const next = list(e.target.value)[0]; if (next) onChange(next.id); }}>
      <option value="codex">ChatGPT / Codex</option><option value="gemini">Google Gemini</option><option value="claude">Claude Code</option>
    </select></div>
    <div><label htmlFor={id}>Model</label><select id={id} className="input" value={model} onChange={(e) => onChange(e.target.value as ModelId)}>
      {options.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
    </select></div>
    <button className="btn btn--ghost" disabled={busy} onClick={() => void refresh()}>{busy ? 'Refreshing models…' : 'Refresh available models'}</button>
    {providers?.[provider]?.modelCatalogNote && <p className="muted small">{providers[provider].modelCatalogNote}</p>}
    {error && <p role="alert">{error}</p>}
    {lockedClaude && <p className="muted small">This advisor imports a Claude conversation. Create a fresh advisor to use another provider.</p>}
  </div>;
}
