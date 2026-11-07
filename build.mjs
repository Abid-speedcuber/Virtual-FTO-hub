// Builds the Vite app into BUILD_OUT_DIR (set by update-subwebsites.sh).
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const envOut = process.env.BUILD_OUT_DIR;
if (!envOut) {
    console.error('BUILD_OUT_DIR is not set; run this via update-subwebsites.sh');
    process.exit(1);
}
const outDir = resolve(envOut);

// Guard: the output dir is wiped, so refuse the project root or any parent of it.
if (outDir === root || root.startsWith(outDir + '/') || root.startsWith(outDir + '\\')) {
    console.error(`Refusing to build into ${outDir}`);
    process.exit(1);
}

function run(cmd, args) {
    const res = spawnSync(cmd, args, {
        cwd: root,
        stdio: 'inherit',
        shell: process.platform === 'win32' && cmd === 'npm',
    });
    if (res.status !== 0) process.exit(res.status ?? 1);
}

// Install dependencies if missing or if the lockfile changed since the last install.
const installed = join(root, 'node_modules', '.package-lock.json');
const lock = join(root, 'package-lock.json');
const stale = !existsSync(installed) ||
    (existsSync(lock) && statSync(lock).mtimeMs > statSync(installed).mtimeMs);
if (stale) run('npm', ['ci']);

// Invoke Vite directly to avoid npm/shell quoting differences across platforms.
run(process.execPath, [
    join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
    'build',
    '--outDir', outDir,
    '--emptyOutDir',
]);
