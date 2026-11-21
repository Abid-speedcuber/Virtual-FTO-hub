import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

// These cover the whole network's homepage/account integration, not just this repo.
const publicRoot = process.env.FTOERS_PUBLIC_ROOT;
if (!publicRoot || !existsSync(join(publicRoot, 'index.html'))) {
  throw Error(
    'Set FTOERS_PUBLIC_ROOT to the FTOers checkout’s public directory, then run npm run test:network.',
  );
}
for (const name of ['network-browser', 'polish-browser', 'manual-leaderboard-browser']) {
  const result = spawnSync(process.execPath, [resolve(`tests/network-integration/${name}.mjs`)], {
    stdio: 'inherit',
    env: { ...process.env, FTOERS_PUBLIC_ROOT: resolve(publicRoot) },
    timeout: 180_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
