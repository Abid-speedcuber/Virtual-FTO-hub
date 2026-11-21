import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (!existsSync('dist/index.html')) throw Error('Run npm run build before npm run test:built.');
for (const name of ['standalone-browser', 'recording-averages', 'account-dialogs']) {
  const result = spawnSync(process.execPath, [`tests/${name}.mjs`], {
    stdio: 'inherit',
    timeout: 300_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
