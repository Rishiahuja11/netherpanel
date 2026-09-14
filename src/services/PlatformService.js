const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');

const PROOT_DISTRO = 'ubuntu';
const JAVA_PATH = '/usr/lib/jvm/java-25-openjdk-arm64/bin/java';

let prootChecked = false;
let prootAvailable = false;

class PlatformService {
  static execPromise(cmd, timeout = 10000) {
    return new Promise((resolve, reject) => {
      exec(cmd, { timeout }, (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve(stdout.trim());
      });
    });
  }

  static isWindows() {
    return process.platform === 'win32';
  }

  static isTermux() {
    return fs.existsSync('/data/data/com.termux');
  }

  static cmdExists(cmd) {
    try {
      execSync(this.isWindows() ? `where ${cmd}` : `command -v ${cmd}`, { stdio: 'ignore' });
      return true;
    } catch (e) {
      return false;
    }
  }

  static isProotAvailable() {
    if (!this.isTermux()) return false;
    if (prootChecked) return prootAvailable;
    prootChecked = true;
    if (!this.cmdExists('proot-distro')) return false;
    try {
      execSync(`proot-distro login ${PROOT_DISTRO} -- true`, { timeout: 30000, stdio: 'ignore' });
      prootAvailable = true;
    } catch (e) {
      prootAvailable = false;
    }
    return prootAvailable;
  }

  static javaCommand() {
    if (this.isProotAvailable()) return [JAVA_PATH];
    return ['java'];
  }

  static buildCpuPrefix(cpuLimit) {
    const raw = String(cpuLimit || '').trim();
    if (!raw) return '';
    let range;
    if (/^\d+$/.test(raw)) {
      const cores = Math.max(1, Math.min(parseInt(raw, 10), os.cpus().length));
      range = `0-${cores - 1}`;
    } else if (/^\d+-\d+$/.test(raw)) {
      range = raw;
    } else {
      return '';
    }
    if (this.isWindows() || !this.cmdExists('taskset')) return '';
    return `taskset -c ${range} `;
  }

  static cpuAffinityArgs(cpuLimit) {
    const raw = String(cpuLimit || '').trim();
    if (this.isWindows() || !raw || !this.cmdExists('taskset')) return [];
    let range;
    if (/^\d+$/.test(raw)) {
      const cores = Math.max(1, Math.min(parseInt(raw, 10), os.cpus().length));
      range = `0-${cores - 1}`;
    } else if (/^\d+-\d+$/.test(raw)) {
      range = raw;
    } else {
      return [];
    }
    return ['taskset', '-c', range];
  }

  static shellWrap(cwd, command) {
    return `cd '${cwd}' && ${command}`;
  }

  static serverSpawnSpec({ serverDir, jarPath, exePath, phpBin, pharName, ramMax, ramMin, cpuLimit, javaArgs = [], kind }) {
    const affinity = this.cpuAffinityArgs(cpuLimit);
    const proot = this.isProotAvailable();

    if (proot) {
      const prefix = this.buildCpuPrefix(cpuLimit);
      let inner;
      switch (kind) {
        case 'java':
          inner = `${prefix}${JAVA_PATH} ${javaArgs.join(' ')} -jar server.jar nogui`;
          break;
        case 'bedrock-agent':
          inner = `cd '${serverDir}' && ${exePath}`;
          break;
        case 'pocketmine':
          inner = `${prefix}'${phpBin}' -d memory_limit=${ramMax}M ${pharName} --no-wizard`;
          break;
        default:
          inner = javaArgs.join(' ');
      }
      return {
        cmd: 'proot-distro',
        args: ['login', PROOT_DISTRO, '--', 'bash', '-c', this.shellWrap(serverDir, inner)],
        cwd: serverDir
      };
    }

    switch (kind) {
      case 'pocketmine': {
        const bin = phpBin || (this.isWindows() ? 'php.exe' : 'php');
        return {
          cmd: bin,
          args: [`-d`, `memory_limit=${ramMax}M`, pharName, '--no-wizard'],
          cwd: serverDir
        };
      }
      case 'bedrock-agent':
        return { cmd: exePath, args: [], cwd: serverDir };
      case 'java':
      default:
        return {
          cmd: 'java',
          args: [...affinity, ...javaArgs, '-jar', 'server.jar', 'nogui'],
          cwd: serverDir
        };
    }
  }

  static async runJavaInstaller(cwd, installerArgs) {
    const proot = this.isProotAvailable();
    if (this.isWindows() && !this.cmdExists('java')) {
      throw new Error('Java is required. Install the JDK and add it to PATH.');
    }
    if (proot) {
      const cmd = `proot-distro login ${PROOT_DISTRO} -- bash -c "${this.shellWrap(cwd, `${JAVA_PATH} ${installerArgs.join(' ')}`)}"`;
      await this.execPromise(cmd, 300000);
      return;
    }
    await new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      const child = spawn('java', installerArgs, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
      let errOut = '';
      child.stderr.on('data', d => { errOut += d.toString(); });
      child.on('error', err => reject(new Error(`Java not found: ${err.message}. Install a JDK and add it to PATH.`)));
      child.on('exit', code => {
        if (code === 0) resolve();
        else reject(new Error(`Installer failed (exit ${code}): ${errOut.slice(-400)}`));
      });
    });
  }

  static killProcessTree(pid, signal) {
    if (this.isWindows()) {
      try {
        const force = signal === 'SIGKILL' ? ' /F' : '';
        execSync(`taskkill /PID ${pid} /T${force}`, { stdio: 'ignore' });
        return true;
      } catch (e) {
        return false;
      }
    }
    try {
      process.kill(-pid, signal);
      return true;
    } catch (e) {
      try {
        process.kill(pid, signal);
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  static async getProcessResources(pid) {
    if (!pid) return { pid: null, memory: 0, cpu: 0, uptime: '0m' };

    if (this.isWindows()) {
      try {
        const out = await this.execPromise(
          `powershell -NoProfile -Command "$p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if($p){ '{0}|{1}|{2}' -f $p.WorkingSet64,$p.CPU,$p.StartTime.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }"`,
          10000
        );
        const [mem, cpuTotal, stime] = out.split('|');
        let uptime = '0m';
        if (stime) {
          const elapsed = (Date.now() - Date.parse(stime)) / 1000;
          uptime = elapsed > 0 ? `${Math.floor(elapsed / 60)}m` : '0m';
        }
        return { pid, memory: parseInt(mem, 10) || 0, cpu: 0, uptime };
      } catch (e) {
        return { pid, memory: 0, cpu: 0, uptime: '0m' };
      }
    }

    let memory = 0;
    try {
      const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
      const vmrss = status.match(/^VmRSS:\s+(\d+)\s+kB/m);
      if (vmrss) memory = parseInt(vmrss[1], 10) * 1024;
    } catch {
      try {
        const psOut = await this.execPromise(`ps -o rss= -p ${pid}`);
        memory = (parseInt(psOut, 10) || 0) * 1024;
      } catch {}
    }

    let cpu = 0;
    try {
      const psOut = await this.execPromise(`ps -o %cpu= -p ${pid}`);
      cpu = parseFloat(psOut) || 0;
    } catch {}

    let uptimeStr = '0m';
    try {
      const psOut = await this.execPromise(`ps -o etime= -p ${pid}`);
      uptimeStr = psOut.trim() || '0m';
    } catch {}

    return { pid, memory, cpu, uptime: uptimeStr };
  }
}

module.exports = PlatformService;