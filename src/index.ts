import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { WifiDetector } from './detection/WifiDetector';
import { BluetoothDetector } from './detection/BluetoothDetector';
import { DetectionManager } from './detection/DetectionManager';
import { AlertManager } from './alerts/AlertManager';
import { LoraTransmitter } from './alerts/LoraTransmitter';
import { createApiServer } from './api/server';
import { logger } from './utils/logger';
import { loadConfig } from './config/configLoader';
import bcrypt from 'bcrypt';

dotenv.config();

const prisma = new PrismaClient();

async function createDefaultUser(): Promise<void> {
  const adminUser = await prisma.user.findUnique({
    where: { username: 'admin' },
  });

  if (!adminUser) {
    const passwordHash = await bcrypt.hash('changeme', 10);
    await prisma.user.create({
      data: {
        username: 'admin',
        passwordHash,
        role: 'admin',
      },
    });
    logger.info('Default admin user created (username: admin, password: changeme)');
  }
}

async function main(): Promise<void> {
  try {
    logger.info('Starting BPDevice system...');

    const config = await loadConfig();

    await createDefaultUser();

    const wifiDetector = new WifiDetector(
      config.detection.wifi.interface,
      config.detection.wifi.channels,
      config.detection.wifi.dwellTime
    );

    const bluetoothDetector = new BluetoothDetector(
      config.detection.bluetooth.scanInterval,
      config.detection.bluetooth.scanWindow,
      config.detection.bluetooth.rssiThreshold
    );

    const loraTransmitter = new LoraTransmitter({
      port: config.lora.port,
      baudRate: config.lora.baudRate,
      deviceId: config.lora.deviceId,
    });

    const detectionManager = new DetectionManager(
      prisma,
      wifiDetector,
      bluetoothDetector
    );

    const alertManager = new AlertManager(
      prisma,
      loraTransmitter,
      config.alerts
    );

    detectionManager.on('new-device', (device) => {
      alertManager.evaluateDevice(device);
    });

    detectionManager.on('device-detected', ({ device }) => {
      alertManager.evaluateDevice(device);
    });

    if (config.lora.enabled) {
      await loraTransmitter.connect();
    }

    await detectionManager.start();
    await alertManager.start();

    const apiServer = createApiServer(prisma, detectionManager, alertManager);
    const port = process.env.PORT || 3000;
    
    apiServer.listen(port, () => {
      logger.info(`API server listening on port ${port}`);
      logger.info('BPDevice system started successfully', {
        wifi: config.detection.wifi.enabled,
        bluetooth: config.detection.bluetooth.enabled,
        alerts: config.alerts.enabled,
        lora: config.lora.enabled,
      });
    });

    process.on('SIGINT', async () => {
      logger.info('Shutting down BPDevice system...');
      
      await detectionManager.stop();
      await alertManager.stop();
      
      if (config.lora.enabled) {
        await loraTransmitter.disconnect();
      }
      
      await prisma.$disconnect();
      
      logger.info('BPDevice system shut down successfully');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      
      await detectionManager.stop();
      await alertManager.stop();
      
      if (config.lora.enabled) {
        await loraTransmitter.disconnect();
      }
      
      await prisma.$disconnect();
      
      process.exit(0);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start BPDevice system', error);
    process.exit(1);
  }
}

main();