import { EventEmitter } from 'events';
import * as noble from '@abandonware/noble';
import { Device, DetectionEvent } from '@/types';
import { createModuleLogger } from '@/utils/logger';
import { parseMacAddress, getManufacturer, isRandomizedMac } from '@/utils/macParser';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const logger = createModuleLogger('BluetoothDetector');

interface BluetoothDevice {
  address: string;
  name?: string;
  rssi: number;
  advertisement?: any;
  lastSeen: Date;
}

export class BluetoothDetector extends EventEmitter {
  private isRunning: boolean = false;
  private classicScanner: NodeJS.Timer | null = null;
  private scanInterval: number;
  private scanWindow: number;
  private rssiThreshold: number;
  private detectedDevices: Map<string, BluetoothDevice> = new Map();
  private bleReady: boolean = false;

  constructor(scanInterval: number = 10000, scanWindow: number = 5000, rssiThreshold: number = -90) {
    super();
    this.scanInterval = scanInterval;
    this.scanWindow = scanWindow;
    this.rssiThreshold = rssiThreshold;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Bluetooth detector is already running');
      return;
    }

    try {
      await this.checkBluetoothAvailability();
      
      this.setupBLEScanning();
      this.startClassicScanning();
      
      this.isRunning = true;
      logger.info('Bluetooth detector started', {
        scanInterval: this.scanInterval,
        scanWindow: this.scanWindow,
        rssiThreshold: this.rssiThreshold
      });
      
      this.emit('started');
    } catch (error) {
      logger.error('Failed to start Bluetooth detector', error);
      throw error;
    }
  }

  private async checkBluetoothAvailability(): Promise<void> {
    try {
      const { stdout } = await execAsync('hciconfig');
      if (!stdout.includes('UP RUNNING')) {
        await execAsync('sudo hciconfig hci0 up');
      }
      logger.info('Bluetooth interface is up');
    } catch (error) {
      throw new Error(`Bluetooth interface not available: ${error}`);
    }
  }

  private setupBLEScanning(): void {
    noble.on('stateChange', (state: string) => {
      logger.info('BLE state changed', { state });
      
      if (state === 'poweredOn') {
        this.bleReady = true;
        this.startBLEScanning();
      } else {
        this.bleReady = false;
        noble.stopScanning();
      }
    });

    noble.on('discover', this.handleBLEDevice.bind(this));
    
    noble.on('warning', (warning: string) => {
      logger.warn('Noble warning', { warning });
    });

    noble.on('error', (error: Error) => {
      logger.error('Noble error', error);
      this.emit('error', error);
    });
  }

  private startBLEScanning(): void {
    if (!this.bleReady || !this.isRunning) {
      return;
    }

    logger.debug('Starting BLE scan');
    
    noble.startScanning([], true, (error?: Error) => {
      if (error) {
        logger.error('Failed to start BLE scanning', error);
        this.emit('error', error);
      }
    });

    if (this.scanWindow < this.scanInterval) {
      setTimeout(() => {
        if (this.isRunning) {
          noble.stopScanning(() => {
            setTimeout(() => {
              if (this.isRunning) {
                this.startBLEScanning();
              }
            }, this.scanInterval - this.scanWindow);
          });
        }
      }, this.scanWindow);
    }
  }

  private handleBLEDevice(peripheral: noble.Peripheral): void {
    try {
      if (peripheral.rssi < this.rssiThreshold) {
        return;
      }

      const macAddress = parseMacAddress(peripheral.address);
      const now = new Date();

      const existingDevice = this.detectedDevices.get(macAddress);
      if (existingDevice && now.getTime() - existingDevice.lastSeen.getTime() < 1000) {
        existingDevice.lastSeen = now;
        existingDevice.rssi = peripheral.rssi;
        return;
      }

      const deviceInfo: BluetoothDevice = {
        address: macAddress,
        name: peripheral.advertisement?.localName,
        rssi: peripheral.rssi,
        advertisement: peripheral.advertisement,
        lastSeen: now,
      };

      this.detectedDevices.set(macAddress, deviceInfo);

      if (isRandomizedMac(macAddress)) {
        logger.debug('Detected randomized BLE MAC', { mac: macAddress });
      }

      const device: Partial<Device> = {
        macAddress,
        type: 'bluetooth',
        manufacturer: getManufacturer(macAddress),
        signalStrength: peripheral.rssi,
        lastSeen: now,
      };

      const detectionEvent: DetectionEvent = {
        device,
        timestamp: now,
        source: 'bluetooth',
      };

      logger.debug('BLE device detected', {
        mac: device.macAddress,
        name: deviceInfo.name,
        signal: device.signalStrength,
        manufacturer: device.manufacturer,
      });

      this.emit('device-detected', detectionEvent);
    } catch (error) {
      logger.error('Error handling BLE device', error);
    }
  }

  private startClassicScanning(): void {
    this.classicScanner = setInterval(async () => {
      if (!this.isRunning) {
        return;
      }

      try {
        await this.scanClassicDevices();
      } catch (error) {
        logger.error('Classic Bluetooth scan failed', error);
      }
    }, this.scanInterval);

    this.scanClassicDevices().catch((error) => {
      logger.error('Initial classic scan failed', error);
    });
  }

  private async scanClassicDevices(): Promise<void> {
    try {
      const scanDuration = Math.floor(this.scanWindow / 1000);
      const { stdout } = await execAsync(`sudo timeout ${scanDuration}s hcitool scan`);
      
      const lines = stdout.split('\n').slice(1);
      const now = new Date();

      for (const line of lines) {
        const match = line.match(/([0-9A-F:]{17})\s+(.*)/i);
        if (!match) continue;

        const [, rawMac, name] = match;
        const macAddress = parseMacAddress(rawMac);

        const existingDevice = this.detectedDevices.get(macAddress);
        if (existingDevice && now.getTime() - existingDevice.lastSeen.getTime() < 5000) {
          existingDevice.lastSeen = now;
          continue;
        }

        const rssi = await this.getClassicDeviceRSSI(macAddress);

        if (rssi < this.rssiThreshold) {
          continue;
        }

        const deviceInfo: BluetoothDevice = {
          address: macAddress,
          name: name.trim(),
          rssi,
          lastSeen: now,
        };

        this.detectedDevices.set(macAddress, deviceInfo);

        const device: Partial<Device> = {
          macAddress,
          type: 'bluetooth',
          manufacturer: getManufacturer(macAddress),
          signalStrength: rssi,
          lastSeen: now,
        };

        const detectionEvent: DetectionEvent = {
          device,
          timestamp: now,
          source: 'bluetooth',
        };

        logger.debug('Classic Bluetooth device detected', {
          mac: device.macAddress,
          name: deviceInfo.name,
          signal: device.signalStrength,
          manufacturer: device.manufacturer,
        });

        this.emit('device-detected', detectionEvent);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        return;
      }
      throw error;
    }
  }

  private async getClassicDeviceRSSI(macAddress: string): Promise<number> {
    try {
      const { stdout } = await execAsync(`sudo hcitool rssi ${macAddress}`);
      const match = stdout.match(/RSSI return value: (-?\d+)/);
      if (match) {
        return parseInt(match[1]);
      }
    } catch (error) {
      logger.debug('Failed to get RSSI for classic device', { macAddress });
    }
    return -70;
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.bleReady) {
      noble.stopScanning();
    }

    if (this.classicScanner) {
      clearInterval(this.classicScanner);
      this.classicScanner = null;
    }

    this.detectedDevices.clear();

    logger.info('Bluetooth detector stopped');
    this.emit('stopped');
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getDetectedDevices(): BluetoothDevice[] {
    return Array.from(this.detectedDevices.values());
  }

  cleanupOldDevices(maxAge: number = 300000): void {
    const now = Date.now();
    const toRemove: string[] = [];

    this.detectedDevices.forEach((device, mac) => {
      if (now - device.lastSeen.getTime() > maxAge) {
        toRemove.push(mac);
      }
    });

    toRemove.forEach((mac) => {
      this.detectedDevices.delete(mac);
    });

    if (toRemove.length > 0) {
      logger.debug('Cleaned up old devices', { count: toRemove.length });
    }
  }
}