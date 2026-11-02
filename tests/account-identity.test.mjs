import test from 'node:test';
import assert from 'node:assert/strict';
import identity from '../server/engine/account-identity.cjs';
test('account display whitelists identity fields and excludes credentials', () => {
  const result = identity.accountIdentity({ type: 'chatgpt', email: 'example@example.com', planType: 'plus', accessToken: 'private', refreshToken: 'private', idToken: 'private' });
  assert.deepEqual(result, { email: 'example@example.com', plan: 'plus', source: 'Codex account information' });
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(identity.accountIdentity({ type: 'apiKey', email: 'example@example.com' }), null);
  assert.equal(identity.accountIdentity({ type: 'chatgpt', email: '<invalid>', planType: 'secret-value' }).email, undefined);
  assert.equal(identity.accountIdentity({ type: 'chatgpt', planType: 'secret-value' }).plan, undefined);
});
