// Builds dist/pdcm-careers.js: one file, no imports, ready to paste into the
// Cloudflare dashboard editor. Run with `npm run bundle`.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'pdcm-bundle-'));

try {
  execFileSync(
    process.execPath,
    [join(here, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'deploy', '--dry-run', '--outdir', out],
    { cwd: here, stdio: 'inherit' },
  );

  const header = [
    '// pdcm-careers — single-file build of worker/src, for pasting into the',
    '// Cloudflare dashboard editor. Generated; do not edit here.',
    '// Rebuild with:  cd worker && npm run bundle',
    '',
  ].join('\n');

  const body = readFileSync(join(out, 'index.js'), 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith('//# sourceMappingURL='))
    .join('\n');

  mkdirSync(join(here, 'dist'), { recursive: true });
  writeFileSync(join(here, 'dist', 'pdcm-careers.js'), header + body);
  console.log('wrote dist/pdcm-careers.js');
} finally {
  rmSync(out, { recursive: true, force: true });
}
