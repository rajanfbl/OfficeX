// Whitelist display-only identity fields. Never return raw authentication responses.
function accountIdentity(account) {
  if (account?.type !== 'chatgpt') return null;
  const email = typeof account.email === 'string' && account.email.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(account.email) ? account.email : undefined;
  const plans = new Set(['free', 'go', 'plus', 'pro', 'team', 'business', 'enterprise', 'edu', 'unknown']);
  const plan = plans.has(account.planType) ? account.planType : undefined;
  return { email, plan, source: 'Codex account information' };
}
module.exports = { accountIdentity };
