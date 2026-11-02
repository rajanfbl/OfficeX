const fs = require('node:fs');
const path = require('node:path');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
function loadSettings(instanceFile) {
  const instance = fs.existsSync(instanceFile) ? readJson(instanceFile) : {};
  const sourceRoot = path.resolve(instance.sourceRoot || path.join(__dirname, '..'));
  const configFile = path.resolve(instance.serverConfig || path.join(sourceRoot, 'server.json'));
  const server = readJson(configFile);
  const port = Number(server.port ?? 80);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('OfficeX has an invalid local port.');
  const basePath = '/' + String(server.basePath ?? 'OfficeX').replace(/^\/+|\/+$/g, '');
  if (/[?#\\\x00-\x1f]/.test(basePath)) throw Error('OfficeX has an invalid URL path.');
  if (!server.companyRoot) throw Error('Choose a company folder in OfficeX server.json first.');
  if (!fs.existsSync(path.join(sourceRoot, 'server', 'serve.mjs'))) throw Error('OfficeX server files were not found.');
  const origin = `http://127.0.0.1:${port}`;
  return { sourceRoot, configFile, server, origin, url: `${origin}${basePath === '/' ? '/' : basePath + '/'}`, basePath, nodePath: instance.nodePath || 'node' };
}
function mainNavigation(value, settings) {
  try {
    const u = new URL(value);
    return u.origin === settings.origin && u.pathname === new URL(settings.url).pathname && !u.username && !u.password;
  } catch { return false; }
}
function externalLink(value, settings) {
  try {
    const u = new URL(value);
    if (u.username || u.password || value.length > 16000) return false;
    if (u.protocol === 'https:') return true;
    return u.origin === settings.origin && /\/api\/files$/.test(u.pathname);
  } catch { return false; }
}
module.exports = { loadSettings, mainNavigation, externalLink };
