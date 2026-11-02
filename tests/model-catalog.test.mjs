import test from 'node:test';
import assert from 'node:assert/strict';
import tools from '../server/engine/model-catalog.cjs';
test('model discovery includes regular models and excludes internal, duplicate and malformed entries', () => {
  assert.deepEqual(tools.modelCatalog({ data: [
    { model: 'gpt-6-astra', displayName: 'GPT-6-Astra' },
    { model: 'gpt-6.1-terra', displayName: 'GPT-6.1 Terra' },
    { model: 'gpt-6-astra' }, { model: 'codex-auto-review', hidden: true }, { model: '--invalid' },
  ] }), [{ id: 'gpt-6-astra', label: 'GPT-6-Astra' }, { id: 'gpt-6.1-terra', label: 'GPT-6.1 Terra' }]);
  assert.deepEqual(tools.modelCatalog(null), []);
});
