import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import { WifiDetector } from './WifiDetector';
import { BluetoothDetector } from './BluetoothDetector';
import { Device, Detection, DetectionEvent } from '@/types';
import { createModuleLogger } from '@/utils/logger';
import { normalizeSignalStrength } from '@/utils/macParser';

const logger = createModuleLogger('DetectionManager');

export class DetectionManager extends EventEmitter {
  private prisma: PrismaClient;
  private wifiDetector: WifiDetector;
  private bluetoothDetector: BluetoothDetector;
  private deviceCache: Map<string, Device> = new Map();
  private detectionQueue: DetectionEvent[] = [];
  private processingInterval: NodeJS.Timer | null = null;
  private cleanupInterval: NodeJS.Timer | null = null;

  constructor(
    prisma: PrismaClient,
    wifiDetector: WifiDetector,
    bluetoothDetector: BluetoothDetector
  ) {
    super();
    this.prisma = prisma;
    this.wifiDetector = wifiDetector;
    this.bluetoothDetector = bluetoothDetector;

    this.setupDetectorListeners();
  }

  private setupDetectorListeners(): void {
    this.wifiDetector.on('device-detected', this.handleDetection.bind(this));
    this.bluetoothDetector.on('device-detected', this.handleDetection.bind(this));

    this.wifiDetector.on('error', (error) => {
      logger.error('WiFi detector error', error);
      this.emit('error', { source: 'wifi', error });
    });

    this.bluetoothDetector.on('error', (error) => {
      logger.error('Bluetooth detector error', error);
      this.emit('error', { source: 'bluetooth', error });
    });
  }

  async start(): Promise<void> {
    logger.info('Starting detection manager');

    await this.loadDeviceCache();

    await Promise.all([
      this.wifiDetector.start(),
      this.bluetoothDetector.start(),
    ]);

    this.startProcessingQueue();
    this.startCleanupTask();

    logger.info('Detection manager started');
    this.emit('started');
  }

  private async loadDeviceCache(): Promise<void> {
    try {
      const devices = await this.prisma.device.findMany();
      devices.forEach((device) => {
        this.deviceCache.set(device.macAddress, device as Device);
      });
      logger.info('Device cache loaded', { count: devices.length });
    } catch (error) {
      logger.error('Failed to load device cache', error);
    }
  }

  private handleDetection(event: DetectionEvent): void {
    this.detectionQueue.push(event);
  }

  private startProcessingQueue(): void {
    this.processingInterval = setInterval(() => {
      this.processDetectionQueue();
    }, 1000);
  }

  private async processDetectionQueue(): Promise<void> {
    if (this.detectionQueue.length === 0) {
      return;
    }

    const batch = this.detectionQueue.splice(0, 100);
    
    for (const event of batch) {
      try {
        await this.processDetection(event);
      } catch (error) {
        logger.error('Failed to process detection', { error, event });
      }
    }
  }

  private async processDetection(event: DetectionEvent): Promise<void> {
    const { device: detectedDevice, timestamp, source } = event;
    
    if (!detectedDevice.macAddress) {
      return;
    }

    let device = this.deviceCache.get(detectedDevice.macAddress);
    
    if (!device) {
      device = await this.createDevice(detectedDevice, source);
      if (device) {
        this.emit('new-device', device);
      }
    } else {
      await this.updateDevice(device, detectedDevice);
    }

    if (device) {
      await this.recordDetection(device, detectedDevice, timestamp);
      
      this.emit('device-detected', {
        device,
        detection: {
          timestamp,
          signalStrength: detectedDevice.signalStrength || -100,
          source,
        },
      });
    }
  }

  private async createDevice(
    detectedDevice: Partial<Device>,
    source: 'wifi' | 'bluetooth'
  ): Promise<Device | null> {
    try {
      const isWhitelisted = await this.checkWhitelist(detectedDevice.macAddress!);
      
      const device = await this.prisma.device.create({
        data: {
          macAddress: detectedDevice.macAddress!,
          type: source,
          manufacturer: detectedDevice.manufacturer,
          firstSeen: new Date(),
          lastSeen: new Date(),
          isWhitelisted,
        },
      });

      const fullDevice = device as Device;
      fullDevice.signalStrength = detectedDevice.signalStrength || -100;
      
      this.deviceCache.set(device.macAddress, fullDevice);
      
      logger.info('New device created', {
        mac: device.macAddress,
        type: device.type,
        manufacturer: device.manufacturer,
      });

      return fullDevice;
    } catch (error) {
      logger.error('Failed to create device', error);
      return null;
    }
  }

  private async updateDevice(
    device: Device,
    detectedDevice: Partial<Device>
  ): Promise<void> {
    try {
      device.lastSeen = new Date();
      device.signalStrength = detectedDevice.signalStrength || device.signalStrength;

      await this.prisma.device.update({
        where: { id: device.id },
        data: { lastSeen: device.lastSeen },
      });
    } catch (error) {
      logger.error('Failed to update device', error);
    }
  }

  private async recordDetection(
    device: Device,
    detectedDevice: Partial<Device>,
    timestamp: Date
  ): Promise<void> {
    try {
      await this.prisma.detection.create({
        data: {
          deviceId: device.id,
          timestamp,
          signalStrength: detectedDevice.signalStrength || -100,
          metadata: JSON.stringify({
            source: device.type,
            normalizedSignal: normalizeSignalStrength(
              detectedDevice.signalStrength || -100,
              device.type as 'wifi' | 'bluetooth'
            ),
          }),
        },
      });
    } catch (error) {
      logger.error('Failed to record detection', error);
    }
  }

  private async checkWhitelist(macAddress: string): Promise<boolean> {
    try {
      const whitelist = await this.prisma.whitelist.findUnique({
        where: { macAddress },
      });
      return !!whitelist;
    } catch (error) {
      logger.error('Failed to check whitelist', error);
      return false;
    }
  }

  private startCleanupTask(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldDetections();
      this.bluetoothDetector.cleanupOldDevices();
    }, 300000);
  }

  private async cleanupOldDetections(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await this.prisma.detection.deleteMany({
        where: {
          timestamp: {
            lt: thirtyDaysAgo,
          },
        },
      });

      if (result.count > 0) {
        logger.info('Cleaned up old detections', { count: result.count });
      }
    } catch (error) {
      logger.error('Failed to cleanup old detections', error);
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping detection manager');

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    await Promise.all([
      this.wifiDetector.stop(),
      this.bluetoothDetector.stop(),
    ]);

    this.deviceCache.clear();
    this.detectionQueue = [];

    logger.info('Detection manager stopped');
    this.emit('stopped');
  }

  async getDeviceStats(): Promise<{
    total: number;
    active: number;
    wifi: number;
    bluetooth: number;
  }> {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const [total, active, wifi, bluetooth] = await Promise.all([
      this.prisma.device.count(),
      this.prisma.device.count({
        where: { lastSeen: { gte: fiveMinutesAgo } },
      }),
      this.prisma.device.count({ where: { type: 'wifi' } }),
      this.prisma.device.count({ where: { type: 'bluetooth' } }),
    ]);

    return { total, active, wifi, bluetooth };
  }

  getDetectionQueueSize(): number {
    return this.detectionQueue.length;
  }

  getDeviceCache(): Map<string, Device> {
    return new Map(this.deviceCache);
  }
}