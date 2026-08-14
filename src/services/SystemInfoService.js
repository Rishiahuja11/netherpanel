const fs = require('fs');
const { exec } = require('child_process');

class SystemInfoService {
  static execPromise(cmd) {
    return new Promise((resolve, reject) => {
      exec(cmd, { timeout: 10000 }, (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve(stdout.trim());
      });
    });
  }

  static async getSystemInfo() {
    const [cpu, memory, disk, uptime, loadavg, platform] = await Promise.all([
      this.getCpuInfo(),
      this.getMemoryInfo(),
      this.getDiskInfo(),
      this.getUptimeInfo(),
      this.getLoadAvg(),
      this.getPlatformInfo(),
    ]);
    return { cpu, memory, disk, uptime, loadavg, platform };
  }

  static async getCpuInfo() {
    try {
      let modelName = 'Unknown';
      let cores = 1;
      let usage = 0;

      try {
        const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
        const modelMatch = cpuinfo.match(/^model name\s*:\s*(.+)$/m);
        if (modelMatch) modelName = modelMatch[1].trim();
        const coreMatch = cpuinfo.match(/^cpu cores\s*:\s*(\d+)$/m);
        if (coreMatch) cores = parseInt(coreMatch[1], 10);
        else {
          const procCount = (cpuinfo.match(/^processor\s*:/gm) || []).length;
          if (procCount > 0) cores = procCount;
        }
      } catch {}

      try {
        const stat = fs.readFileSync('/proc/stat', 'utf8');
        const cpuLine = stat.split('\n')[0];
        const parts = cpuLine.split(/\s+/).slice(1).map(Number);
        const idle = parts[3] + (parts[4] || 0);
        const total = parts.reduce((a, b) => a + b, 0);
        usage = total > 0 ? Math.round(((total - idle) / total) * 10000) / 100 : 0;
      } catch {}

      return { modelName, cores, usage };
    } catch {
      return { modelName: 'Unknown', cores: 1, usage: 0 };
    }
  }

  static async getMemoryInfo() {
    try {
      let total = 0, used = 0, free = 0;

      try {
        const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
        const get = (key) => {
          const m = meminfo.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'));
          return m ? parseInt(m[1], 10) * 1024 : 0;
        };
        total = get('MemTotal');
        free = get('MemAvailable') || get('MemFree');
        used = total - free;
      } catch {
        const freeOut = await this.execPromise('free -b');
        const memLine = freeOut.split('\n').find(l => l.startsWith('Mem:'));
        if (memLine) {
          const parts = memLine.split(/\s+/);
          total = parseInt(parts[1], 10) || 0;
          used = parseInt(parts[2], 10) || 0;
          free = parseInt(parts[3], 10) || 0;
        }
      }

      const percentage = total > 0 ? Math.round((used / total) * 10000) / 100 : 0;
      return { total, used, free, percentage };
    } catch {
      return { total: 0, used: 0, free: 0, percentage: 0 };
    }
  }

  static async getDiskInfo() {
    try {
      let total = 0, used = 0, free = 0;

      try {
        const statOut = await this.execPromise('stat -f --format="%S %b %a" /data/data/com.termux');
        const parts = statOut.split(/\s+/);
        const blockSize = parseInt(parts[0], 10) || 4096;
        const totalBlocks = parseInt(parts[1], 10) || 0;
        const availBlocks = parseInt(parts[2], 10) || 0;
        total = totalBlocks * blockSize;
        free = availBlocks * blockSize;
        used = total - free;
      } catch {
        try {
          const dfOut = await this.execPromise('df -B1 /data 2>/dev/null || df -B1 .');
          const lines = dfOut.split('\n');
          const dataLine = lines[1];
          if (dataLine) {
            const p = dataLine.split(/\s+/);
            total = parseInt(p[1], 10) || 0;
            used = parseInt(p[2], 10) || 0;
            free = parseInt(p[3], 10) || 0;
          }
        } catch {}
      }

      const percentage = total > 0 ? Math.round((used / total) * 10000) / 100 : 0;
      return { total, used, free, percentage };
    } catch {
      return { total: 0, used: 0, free: 0, percentage: 0 };
    }
  }

  static async getUptimeInfo() {
    try {
      let seconds = 0;

      try {
        const uptimeStr = fs.readFileSync('/proc/uptime', 'utf8');
        seconds = Math.floor(parseFloat(uptimeStr.split(/\s+/)[0]) || 0);
      } catch {
        const uptimeOut = await this.execPromise('uptime -p');
        const match = uptimeOut.match(/up\s+(.+)/i);
        if (match) {
          const s = match[1];
          const days = (s.match(/(\d+)\s*day/) || [0, 0])[1];
          const hours = (s.match(/(\d+)\s*hour/) || [0, 0])[1];
          const mins = (s.match(/(\d+)\s*min/) || [0, 0])[1];
          seconds = days * 86400 + hours * 3600 + mins * 60;
        }
      }

      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return { seconds, formatted: `${days}d ${hours}h ${mins}m` };
    } catch {
      return { seconds: 0, formatted: '0d 0h 0m' };
    }
  }

  static async getLoadAvg() {
    try {
      const loadavg = fs.readFileSync('/proc/loadavg', 'utf8');
      const parts = loadavg.split(/\s+/);
      return {
        '1min': parseFloat(parts[0]) || 0,
        '5min': parseFloat(parts[1]) || 0,
        '15min': parseFloat(parts[2]) || 0,
      };
    } catch {
      return { '1min': 0, '5min': 0, '15min': 0 };
    }
  }

  static async getPlatformInfo() {
    try {
      const uname = fs.readFileSync('/proc/version', 'utf8');
      const parts = uname.split(/\s+/);
      return {
        os: parts[0] || 'Linux',
        release: parts[2] || 'unknown',
        arch: parts.length > 10 ? parts[parts.length - 1] : 'unknown',
      };
    } catch {
      return { os: 'Unknown', release: 'unknown', arch: 'unknown' };
    }
  }

  static async getServerResources(serverId) {
    try {
      const { getDb } = require('../database');
      const db = getDb();
      const server = db.prepare('SELECT pid FROM servers WHERE id = ?').get(serverId);
      if (!server || !server.pid) {
        return { pid: null, memory: 0, cpu: 0, uptime: '0m' };
      }
      const pid = server.pid;

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
    } catch {
      return { pid: null, memory: 0, cpu: 0, uptime: '0m' };
    }
  }
}

module.exports = SystemInfoService;
