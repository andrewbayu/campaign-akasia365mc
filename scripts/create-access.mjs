import { mkdir, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../server/core.mjs';
await mkdir('.local', { recursive: true });
try { await access('.local/results-access.txt'); console.log('Existing access file retained.'); }
catch {
  const password = randomBytes(24).toString('base64url');
  await writeFile('.local/results-access.txt', `Akasia 365mc — akses internal\n\nhttps://campaign-akasia365mc.vercel.app/result\nhttps://akasia.netlify.app/result\n\nPassword: ${password}\n\nSimpan untuk tim yang berwenang. Jangan masukkan password ke GitHub.\n`, { mode: 0o600 });
  await writeFile('.local/password-record.json', JSON.stringify(await hashPassword(password)), { mode: 0o600 });
  console.log('Random password saved to ignored local access file; password hash prepared.');
}
