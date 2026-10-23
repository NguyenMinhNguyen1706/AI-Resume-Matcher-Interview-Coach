import { spawnSync } from 'child_process';
import fs from 'fs';

const winK6 = 'C:\\Program Files\\k6\\k6.exe';
const k6Bin = process.platform === 'win32' && fs.existsSync(winK6) ? winK6 : 'k6';

const args = ['run', 'tests/load/api_load_test.js', ...process.argv.slice(2)];

const result = spawnSync(k6Bin, args, {
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 0);
