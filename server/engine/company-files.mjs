import fs from 'node:fs';
import path from 'node:path';

export function companyFilePath(root, ownFolder, canReadCompany, requested) {
  if (typeof requested !== 'string' || !requested) throw new Error('A company-relative path is required');
  const abs = path.resolve(root, requested);
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Path is outside the company');
  const parts = rel.replaceAll('\\', '/').toLowerCase().split('/');
  if (parts.some((p) => ['office', '.officex', '.agents', '.claude', '.git', '.env'].includes(p)) || parts.some((p) => /credentials|oauth|account\.json/.test(p))) throw new Error('App settings and credentials are private');
  const real = fs.realpathSync(abs);
  const realParts = path.relative(fs.realpathSync(root), real).replaceAll('\\', '/').toLowerCase().split('/');
  if (realParts.some((p) => ['office', '.officex', '.agents', '.claude', '.git', '.env'].includes(p)) || realParts.some((p) => /credentials|oauth|account\.json/.test(p))) throw new Error('Linked app settings and credentials are private');
  const allowedRoot = fs.realpathSync(canReadCompany ? root : ownFolder);
  const allowedRel = path.relative(allowedRoot, real);
  if (allowedRel.startsWith('..') || path.isAbsolute(allowedRel)) throw new Error('Read permission does not cover this path or linked target');
  return real;
}
export function readCompanyFile(root, ownFolder, canReadCompany, requested) {
  const file = companyFilePath(root, ownFolder, canReadCompany, requested);
  if (!fs.statSync(file).isFile() || fs.statSync(file).size > 150000) throw new Error('Choose a text file smaller than 150 KB');
  const data = fs.readFileSync(file);
  if (data.includes(0)) throw new Error('Binary files need an office-file tool; this reader accepts text only');
  return data.toString('utf8');
}
