import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, statSync } from 'fs';
import { SystemStats } from '@/types';
import { logger } from './logger';

const execAsync = promisify(exec);

export class SystemMonitor {
  private previousNetStats?: { rx: number; tx: number; timestamp: number };

  async getSystemStats(): Promise<SystemStats> {
    const [cpu, memory, disk, network] = await Promise.all([
      this.getCpuStats(),
      this.getMemoryStats(),
      this.getDiskStats(),
      this.getNetworkStats(),
    ]);

    return { cpu, memory, disk, network };
  }

  private async getCpuStats(): Promise<SystemStats['cpu']> {
    try {
      const { stdout } = await execAsync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'");
      const usage = parseFloat(stdout.trim().replace('%us,', ''));

      let temperature: number | undefined;
      try {
        const tempData = readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
        temperature = parseInt(tempData.trim()) / 1000;
      } catch {
        // Temperature reading not available
      }

      return { usage, temperature };
    } catch (error) {
      logger.error('Failed to get CPU stats', error);
      return { usage: 0 };
    }
  }

  private async getMemoryStats(): Promise<SystemStats['memory']> {
    try {
      const meminfo = readFileSync('/proc/meminfo', 'utf8');
      const lines = meminfo.split('\n');
      
      const getMemValue = (key: string): number => {
        const line = lines.find((l) => l.startsWith(key));
        if (!line) return 0;
        return parseInt(line.split(/\s+/)[1]) * 1024; // Convert KB to bytes
      };

      const total = getMemValue('MemTotal:');
      const free = getMemValue('MemFree:');
      const buffers = getMemValue('Buffers:');
      const cached = getMemValue('Cached:');
      
      const available = free + buffers + cached;
      const used = total - available;
      const percentage = (used / total) * 100;

      return {
        total: Math.round(total / (1024 * 1024)), // MB
        used: Math.round(used / (1024 * 1024)),
        free: Math.round(available / (1024 * 1024)),
        percentage: Math.round(percentage * 10) / 10,
      };
    } catch (error) {
      logger.error('Failed to get memory stats', error);
      return { total: 0, used: 0, free: 0, percentage: 0 };
    }
  }

  private async getDiskStats(): Promise<SystemStats['disk']> {
    try {
      const { stdout } = await execAsync("df -B1 / | tail -1 | awk '{print $2,$3,$4,$5}'");
      const [total, used, free, percentage] = stdout.trim().split(' ');

      return {
        total: Math.round(parseInt(total) / (1024 * 1024 * 1024)), // GB
        used: Math.round(parseInt(used) / (1024 * 1024 * 1024)),
        free: Math.round(parseInt(free) / (1024 * 1024 * 1024)),
        percentage: parseFloat(percentage.replace('%', '')),
      };
    } catch (error) {
      logger.error('Failed to get disk stats', error);
      return { total: 0, used: 0, free: 0, percentage: 0 };
    }
  }

  private async getNetworkStats(): Promise<SystemStats['network']> {
    try {
      const netstat = readFileSync('/proc/net/dev', 'utf8');
      const lines = netstat.split('\n').slice(2); // Skip headers
      
      let totalRx = 0;
      let totalTx = 0;
      
      lines.forEach((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 10 && !parts[0].startsWith('lo:')) {
          totalRx += parseInt(parts[1]);
          totalTx += parseInt(parts[9]);
        }
      });

      const now = Date.now();
      let rxRate = 0;
      let txRate = 0;

      if (this.previousNetStats) {
        const timeDiff = (now - this.previousNetStats.timestamp) / 1000; // seconds
        rxRate = (totalRx - this.previousNetStats.rx) / timeDiff;
        txRate = (totalTx - this.previousNetStats.tx) / timeDiff;
      }

      this.previousNetStats = { rx: totalRx, tx: totalTx, timestamp: now };

      return {
        rx: totalRx,
        tx: totalTx,
        rxRate: Math.round(rxRate),
        txRate: Math.round(txRate),
      };
    } catch (error) {
      logger.error('Failed to get network stats', error);
      return { rx: 0, tx: 0, rxRate: 0, txRate: 0 };
    }
  }

  async checkDiskSpace(path: string = '/'): Promise<{ free: number; percentage: number }> {
    try {
      const { stdout } = await execAsync(`df -B1 ${path} | tail -1 | awk '{print $4,$5}'`);
      const [free, percentage] = stdout.trim().split(' ');
      
      return {
        free: parseInt(free),
        percentage: parseFloat(percentage.replace('%', '')),
      };
    } catch (error) {
      logger.error('Failed to check disk space', error);
      return { free: 0, percentage: 100 };
    }
  }

  async getUptime(): Promise<number> {
    try {
      const uptime = readFileSync('/proc/uptime', 'utf8');
      return parseFloat(uptime.split(' ')[0]);
    } catch (error) {
      logger.error('Failed to get uptime', error);
      return 0;
    }
  }

  async checkProcessHealth(processName: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`pgrep -f ${processName}`);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }
}

export const systemMonitor = new SystemMonitor();