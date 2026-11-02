import { MODELS, type ModelId } from '../types';
const providerOf = (id: string) => id.startsWith('gpt-') ? 'codex' : id.startsWith('gemini-') ? 'gemini' : 'claude';
export function ModelPicker({ model, onChange, lockedClaude = false, id = 'model' }: { model: ModelId; onChange: (model: ModelId) => void; lockedClaude?: boolean; id?: string }) {
  const provider = providerOf(model);
  return <div className="model-picker">
    <div><label htmlFor={`${id}-provider`}>AI provider</label><select id={`${id}-provider`} className="input" value={provider} disabled={lockedClaude} onChange={(e) => onChange(MODELS.find((m) => providerOf(m.id) === e.target.value)!.id)}>
      <option value="codex">ChatGPT / Codex</option><option value="gemini">Google Gemini</option><option value="claude">Claude Code</option>
    </select></div>
    <div><label htmlFor={id}>Model</label><select id={id} className="input" value={model} onChange={(e) => onChange(e.target.value as ModelId)}>
      {MODELS.filter((m) => providerOf(m.id) === provider).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
    </select></div>
    {lockedClaude && <p className="muted small">This advisor imports a Claude conversation. Create a fresh advisor to use another provider.</p>}
  </div>;
}
