#!/usr/bin/env node
import { spawnSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const MIN_MAJOR = 22;

function parseNodeVersion(v) {
  if (!v) return null;
  const m = v.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function nodeVersionAt(nodePath) {
  try {
    const r = spawnSync(nodePath, ['--version'], { encoding: 'utf8', timeout: 5000 });
    if (r.error) return null;
    return parseNodeVersion(r.stdout || r.stderr);
  } catch { return null; }
}

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function readdirSafe(p) {
  try { return fs.readdirSync(p); } catch { return []; }
}

function nvmWindowsCandidates() {
  // nvm-windows stores versions under %APPDATA%\nvm\v<ver>
  const nvmHome = process.env.NVM_HOME || path.join(process.env.APPDATA || '', 'nvm');
  const candidates = [];
  for (const entry of readdirSafe(nvmHome)) {
    const ver = parseNodeVersion(entry);
    if (ver && ver.major >= MIN_MAJOR) {
      candidates.push({ path: path.join(nvmHome, entry, 'node.exe'), ver });
    }
  }
  // prefer highest version
  candidates.sort((a, b) => b.ver.major - a.ver.major || b.ver.minor - a.ver.minor || b.ver.patch - a.ver.patch);
  return candidates.map(c => c.path);
}

function nvsCandidates() {
  // nvs stores versions under %LOCALAPPDATA%\nvs\node\<ver>\x64
  const nvsHome = process.env.NVS_HOME || path.join(process.env.LOCALAPPDATA || '', 'nvs');
  const nodeDir = path.join(nvsHome, 'node');
  const candidates = [];
  for (const entry of readdirSafe(nodeDir)) {
    const ver = parseNodeVersion(entry);
    if (ver && ver.major >= MIN_MAJOR) {
      candidates.push({ path: path.join(nodeDir, entry, 'x64', 'node.exe'), ver });
    }
  }
  candidates.sort((a, b) => b.ver.major - a.ver.major || b.ver.minor - a.ver.minor || b.ver.patch - a.ver.patch);
  return candidates.map(c => c.path);
}

function voltaCandidates() {
  const voltaHome = process.env.VOLTA_HOME || path.join(process.env.LOCALAPPDATA || '', 'Volta');
  const imgDir = path.join(voltaHome, 'tools', 'image', 'node');
  const candidates = [];
  for (const entry of readdirSafe(imgDir)) {
    const ver = parseNodeVersion(entry);
    if (ver && ver.major >= MIN_MAJOR) {
      candidates.push({ path: path.join(imgDir, entry, 'node.exe'), ver });
    }
  }
  candidates.sort((a, b) => b.ver.major - a.ver.major || b.ver.minor - a.ver.minor || b.ver.patch - a.ver.patch);
  return candidates.map(c => c.path);
}

function posixNvmCandidates() {
  const nvmDir = process.env.NVM_DIR || path.join(process.env.HOME || '', '.nvm');
  const versionsDir = path.join(nvmDir, 'versions', 'node');
  const candidates = [];
  for (const entry of readdirSafe(versionsDir)) {
    const ver = parseNodeVersion(entry);
    if (ver && ver.major >= MIN_MAJOR) {
      candidates.push({ path: path.join(versionsDir, entry, 'bin', 'node'), ver });
    }
  }
  candidates.sort((a, b) => b.ver.major - a.ver.major || b.ver.minor - a.ver.minor || b.ver.patch - a.ver.patch);
  return candidates.map(c => c.path);
}

function findNode22() {
  const tryPaths = [];
  const isWin = process.platform === 'win32';

  // 1. explicit env override
  if (process.env.NODE_22_PATH) tryPaths.push(process.env.NODE_22_PATH);

  // 2. version-manager directories (highest version first)
  if (isWin) {
    tryPaths.push(...nvmWindowsCandidates());
    tryPaths.push(...nvsCandidates());
    tryPaths.push(...voltaCandidates());
  } else {
    tryPaths.push(...posixNvmCandidates());
  }

  // 3. default install location
  if (isWin) {
    tryPaths.push(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'));
  } else {
    tryPaths.push('/usr/local/bin/node');
  }

  // 4. `where`/`which` output
  try {
    const r = spawnSync(isWin ? 'where' : 'which', [isWin ? 'node.exe' : 'node'], { encoding: 'utf8', timeout: 5000 });
    (r.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach(p => tryPaths.push(p));
  } catch {}

  // 5. scan PATH
  const PATH = process.env.PATH || process.env.Path || '';
  const exe = isWin ? 'node.exe' : 'node';
  PATH.split(path.delimiter).forEach(dir => { if (dir) tryPaths.push(path.join(dir, exe)); });

  const seen = new Set();
  for (const p of tryPaths) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    if (!exists(p)) continue;
    const v = nodeVersionAt(p);
    if (v && v.major >= MIN_MAJOR) return p;
  }
  return null;
}

function runWithNode(nodeExe) {
  const env = { ...process.env };
  if (nodeExe) {
    const nodeDir = path.dirname(nodeExe);
    env.PATH = `${nodeDir}${path.delimiter}${env.PATH || ''}`;
  }
  // Corporate TLS-inspecting proxies sometimes issue a CA cert whose Basic
  // Constraints extension isn't marked critical, which Node's bundled
  // OpenSSL rejects outright. --use-system-ca defers to the OS (Windows)
  // trust store/validation instead, which is typically more lenient.
  if (!process.env.TRUEFORGE_SKIP_SYSTEM_CA) {
    const existingOpts = env.NODE_OPTIONS || '';
    if (!existingOpts.includes('--use-system-ca')) {
      env.NODE_OPTIONS = `${existingOpts} --use-system-ca`.trim();
    }
  }
  // On Windows, register an ESM loader hook that converts raw C:\ paths to file:// URLs
  if (process.platform === 'win32') {
    const loaderPath = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1')), 'win-esm-loader.js');
    const existing = env.NODE_OPTIONS || '';
    const loaderUrl = `file:///${loaderPath.replace(/\\/g, '/').replace(/^\//, '')}`;
    if (!existing.includes('win-esm-loader')) {
      env.NODE_OPTIONS = `${existing} --import ${loaderUrl}`.trim();
    }
  }
  const args = process.argv.slice(2);
  const npxArgs = args.length ? args : ['@truefoundry/trueforge'];
  const child = spawn('npx', npxArgs, { stdio: 'inherit', env, shell: true });
  child.on('exit', code => process.exit(code ?? 0));
}

function main() {
  const cur = parseNodeVersion(process.version);
  if (cur && cur.major >= MIN_MAJOR) {
    console.log(`[trueforge] Node v${cur.major}.${cur.minor}.${cur.patch} (>=22) ✓`);
    return runWithNode();
  }

  console.log(`[trueforge] Active Node is v${cur?.major ?? '?'} — scanning for Node >=22 …`);
  const found = findNode22();
  if (found) {
    const v = nodeVersionAt(found);
    console.log(`[trueforge] Found Node ${v ? `v${v.major}.${v.minor}.${v.patch}` : '>=22'} at ${found}`);
    return runWithNode(found);
  }

  console.error('[trueforge] ERROR: Node >=22 not found.');
  console.error('  • Install from https://nodejs.org/ (LTS 22)');
  console.error('  • Or set NODE_22_PATH=/path/to/node');
  console.error('  • Or use nvm / volta / nvs to install Node 22');
  process.exit(1);
}

main();
