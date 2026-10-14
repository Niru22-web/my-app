import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const nodeBin = process.execPath;

const services = [
  {
    name: 'api',
    color: '\x1b[36m', // cyan
    cwd: path.join(rootDir, 'backend'),
    args: [
      path.join(rootDir, 'backend', 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      'watch',
      'src/server.ts',
    ],
  },
  {
    name: 'web',
    color: '\x1b[35m', // magenta
    cwd: path.join(rootDir, 'frontend'),
    args: [
      path.join(rootDir, 'frontend', 'node_modules', 'next', 'dist', 'bin', 'next'),
      'dev',
    ],
  },
];

const reset = '\x1b[0m';
const children = [];
let shuttingDown = false;

function prefixStream(stream, prefix, target) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      target.write(`${prefix} ${line}\n`);
    }
  });
  stream.on('end', () => {
    if (buffer.length > 0) {
      target.write(`${prefix} ${buffer}\n`);
      buffer = '';
    }
  });
}

for (const svc of services) {
  const prefix = `${svc.color}[${svc.name.padEnd(3)}]${reset}`;
  console.log(`${prefix} Starting in ${svc.cwd}...`);
  const child = spawn(nodeBin, svc.args, {
    cwd: svc.cwd,
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);

  prefixStream(child.stdout, prefix, process.stdout);
  prefixStream(child.stderr, prefix, process.stderr);

  child.on('exit', (code, signal) => {
    console.log(`${prefix} Exited (${signal ?? `code ${code ?? 0}`})`);
    if (!shuttingDown && code && code !== 0) {
      shutdown(code);
    }
  });
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(exitCode), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
