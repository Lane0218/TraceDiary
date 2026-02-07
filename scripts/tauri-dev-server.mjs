import { spawn, spawnSync } from 'node:child_process';
import { platform } from 'node:os';

const PORT = 1420;

const normalize = (value) => value.replaceAll('/', '\\').toLowerCase();

const parseListeningPidsWindows = (netstatOutput) => {
  const pids = new Set();
  const lines = netstatOutput.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.includes(`:${PORT}`)) continue;
    if (!trimmed.includes('LISTENING')) continue;
    const parts = trimmed.split(/\s+/);
    const pid = Number(parts[parts.length - 1]);
    if (Number.isInteger(pid) && pid > 0) {
      pids.add(pid);
    }
  }
  return [...pids];
};

const getListeningPidsWindows = () => {
  const result = spawnSync('netstat', ['-ano'], {
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  return parseListeningPidsWindows(result.stdout ?? '');
};

const getProcessCommandLineWindows = (pid) => {
  const ps = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CommandLine`,
    ],
    { encoding: 'utf8' },
  );
  if (ps.error) return '';
  return (ps.stdout ?? '').trim();
};

const killProcessTreeWindows = (pid) => {
  const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
    stdio: 'inherit',
  });
  return result.status === 0;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRepoViteProcess = (commandLine) => {
  if (!commandLine) return false;
  const line = normalize(commandLine);
  const cwd = normalize(process.cwd());
  return line.includes('vite') && line.includes(cwd);
};

const releasePortIfNeeded = async () => {
  if (platform() !== 'win32') return;

  const pids = getListeningPidsWindows();
  if (pids.length === 0) return;

  const unknownOwners = [];
  for (const pid of pids) {
    const commandLine = getProcessCommandLineWindows(pid);
    if (isRepoViteProcess(commandLine)) {
      console.log(`[dev:tauri] 释放端口 ${PORT}，清理残留进程 PID=${pid}`);
      killProcessTreeWindows(pid);
      continue;
    }
    unknownOwners.push({ pid, commandLine });
  }

  if (unknownOwners.length > 0) {
    console.error(`[dev:tauri] 端口 ${PORT} 被非本仓库进程占用，已停止启动。`);
    for (const owner of unknownOwners) {
      console.error(`[dev:tauri] PID=${owner.pid} CMD=${owner.commandLine || '<unknown>'}`);
    }
    process.exit(1);
  }

  for (let i = 0; i < 20; i += 1) {
    const again = getListeningPidsWindows();
    if (again.length === 0) return;
    await sleep(250);
  }

  console.error(`[dev:tauri] 端口 ${PORT} 清理后仍被占用，停止启动。`);
  process.exit(1);
};

const run = async () => {
  await releasePortIfNeeded();

  const child =
    platform() === 'win32'
      ? spawn('cmd.exe', ['/d', '/s', '/c', 'npm run dev'], {
          stdio: 'inherit',
          env: process.env,
        })
      : spawn('npm', ['run', 'dev'], {
          stdio: 'inherit',
          env: process.env,
        });

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  child.on('exit', (code, signal) => {
    if (typeof code === 'number') process.exit(code);
    process.exit(signal ? 1 : 0);
  });
};

run().catch((error) => {
  console.error('[dev:tauri] 启动失败:', error);
  process.exit(1);
});
