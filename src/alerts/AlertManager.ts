import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import { LoraTransmitter } from './LoraTransmitter';
import { Device, Alert, AlertRule, SystemConfig } from '@/types';
import { createModuleLogger } from '@/utils/logger';
import * as schedule from 'node-schedule';

const logger = createModuleLogger('AlertManager');

interface AlertEvent {
  device: Device;
  type: string;
  metadata: any;
}

interface AlertCooldown {
  deviceId: string;
  alertType: string;
  until: Date;
}

export class AlertManager extends EventEmitter {
  private prisma: PrismaClient;
  private loraTransmitter: LoraTransmitter;
  private config: SystemConfig['alerts'];
  private cooldowns: Map<string, AlertCooldown> = new Map();
  private detectionCounts: Map<string, number> = new Map();
  private scheduleJobs: Map<string, schedule.Job> = new Map();
  private alertQueue: AlertEvent[] = [];
  private processingInterval: NodeJS.Timer | null = null;

  constructor(
    prisma: PrismaClient,
    loraTransmitter: LoraTransmitter,
    config: SystemConfig['alerts']
  ) {
    super();
    this.prisma = prisma;
    this.loraTransmitter = loraTransmitter;
    this.config = config;
  }

  async start(): Promise<void> {
    logger.info('Starting alert manager');

    this.setupSchedules();
    this.startProcessingQueue();

    logger.info('Alert manager started', {
      enabled: this.config.enabled,
      rules: this.config.rules.length,
    });
  }

  private setupSchedules(): void {
    this.config.rules.forEach((rule) => {
      if (rule.schedule && rule.enabled) {
        this.setupScheduledRule(rule);
      }
    });
  }

  private setupScheduledRule(rule: AlertRule): void {
    const { startTime, endTime, days } = rule.schedule!;
    
    const startJob = schedule.scheduleJob(`${startTime.split(':')[1]} ${startTime.split(':')[0]} * * ${days.join(',')}`, () => {
      logger.info('Scheduled rule activated', { rule: rule.name });
      rule.enabled = true;
    });

    const endJob = schedule.scheduleJob(`${endTime.split(':')[1]} ${endTime.split(':')[0]} * * ${days.join(',')}`, () => {
      logger.info('Scheduled rule deactivated', { rule: rule.name });
      rule.enabled = false;
    });

    this.scheduleJobs.set(`${rule.name}-start`, startJob);
    this.scheduleJobs.set(`${rule.name}-end`, endJob);
  }

  async evaluateDevice(device: Device): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    for (const rule of this.config.rules) {
      if (rule.enabled) {
        await this.evaluateRule(device, rule);
      }
    }
  }

  private async evaluateRule(device: Device, rule: AlertRule): Promise<void> {
    const cooldownKey = `${device.id}-${rule.type}`;
    
    if (this.isInCooldown(cooldownKey)) {
      return;
    }

    let shouldTrigger = false;
    const metadata: any = {
      rule: rule.name,
      device: {
        mac: device.macAddress,
        manufacturer: device.manufacturer,
        signalStrength: device.signalStrength,
      },
    };

    switch (rule.type) {
      case 'new_device':
        if (!device.isWhitelisted && this.isNewDevice(device)) {
          shouldTrigger = await this.checkDetectionThreshold(device, rule);
          metadata.detectionCount = this.detectionCounts.get(device.id) || 0;
        }
        break;

      case 'proximity':
        if (!device.isWhitelisted && device.signalStrength >= (rule.conditions.signalStrength || -60)) {
          shouldTrigger = true;
          metadata.proximity = 'close';
        }
        break;

      case 'signal_threshold':
        if (!device.isWhitelisted && device.signalStrength >= (rule.conditions.signalStrength || -70)) {
          shouldTrigger = await this.checkDetectionThreshold(device, rule);
        }
        break;

      default:
        logger.warn('Unknown alert rule type', { type: rule.type });
    }

    if (shouldTrigger) {
      this.queueAlert({
        device,
        type: rule.type,
        metadata: { ...metadata, actions: rule.actions },
      });

      this.setCooldown(cooldownKey, this.config.cooldownMinutes);
    }
  }

  private isNewDevice(device: Device): boolean {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return device.firstSeen > fiveMinutesAgo;
  }

  private async checkDetectionThreshold(device: Device, rule: AlertRule): Promise<boolean> {
    const count = (this.detectionCounts.get(device.id) || 0) + 1;
    this.detectionCounts.set(device.id, count);

    const requiredCount = rule.conditions.detectionCount || this.config.requiredDetections;
    const timeWindow = rule.conditions.timeWindow || 60;

    setTimeout(() => {
      const currentCount = this.detectionCounts.get(device.id) || 0;
      this.detectionCounts.set(device.id, Math.max(0, currentCount - 1));
    }, timeWindow * 1000);

    return count >= requiredCount;
  }

  private isInCooldown(key: string): boolean {
    const cooldown = this.cooldowns.get(key);
    if (!cooldown) return false;

    if (new Date() > cooldown.until) {
      this.cooldowns.delete(key);
      return false;
    }

    return true;
  }

  private setCooldown(key: string, minutes: number): void {
    const until = new Date();
    until.setMinutes(until.getMinutes() + minutes);

    this.cooldowns.set(key, {
      deviceId: key.split('-')[0],
      alertType: key.split('-')[1],
      until,
    });
  }

  private queueAlert(event: AlertEvent): void {
    this.alertQueue.push(event);
  }

  private startProcessingQueue(): void {
    this.processingInterval = setInterval(() => {
      this.processAlertQueue();
    }, 1000);
  }

  private async processAlertQueue(): Promise<void> {
    if (this.alertQueue.length === 0) {
      return;
    }

    const batch = this.alertQueue.splice(0, 10);

    for (const event of batch) {
      try {
        await this.processAlert(event);
      } catch (error) {
        logger.error('Failed to process alert', { error, event });
      }
    }
  }

  private async processAlert(event: AlertEvent): Promise<void> {
    const alert = await this.createAlert(event);

    if (!alert) {
      return;
    }

    logger.info('Alert triggered', {
      type: alert.type,
      deviceId: event.device.id,
      mac: event.device.macAddress,
    });

    this.emit('alert-triggered', {
      alert,
      device: event.device,
    });

    const actions = event.metadata.actions || ['lora', 'log'];

    for (const action of actions) {
      await this.executeAction(action, alert, event);
    }
  }

  private async createAlert(event: AlertEvent): Promise<Alert | null> {
    try {
      const alert = await this.prisma.alert.create({
        data: {
          type: event.type,
          deviceId: event.device.id,
          triggered: true,
          metadata: JSON.stringify(event.metadata),
        },
      });

      return {
        ...alert,
        metadata: event.metadata,
      } as Alert;
    } catch (error) {
      logger.error('Failed to create alert', error);
      return null;
    }
  }

  private async executeAction(action: string, alert: Alert, event: AlertEvent): Promise<void> {
    switch (action) {
      case 'lora':
        await this.sendLoraAlert(alert, event);
        break;

      case 'log':
        logger.warn('SECURITY ALERT', {
          type: alert.type,
          device: event.device.macAddress,
          manufacturer: event.device.manufacturer,
          signal: event.device.signalStrength,
          metadata: event.metadata,
        });
        break;

      case 'webhook':
        await this.sendWebhookAlert(alert, event);
        break;

      default:
        logger.warn('Unknown alert action', { action });
    }
  }

  private async sendLoraAlert(alert: Alert, event: AlertEvent): Promise<void> {
    try {
      await this.loraTransmitter.sendTrigger(
        event.device.id,
        alert.type,
        {
          mac: event.device.macAddress,
          signal: event.device.signalStrength,
          timestamp: alert.timestamp,
        }
      );
    } catch (error) {
      logger.error('Failed to send LoRa alert', error);
    }
  }

  private async sendWebhookAlert(alert: Alert, event: AlertEvent): Promise<void> {
    logger.info('Webhook alert would be sent here', { alert, event });
  }

  async acknowledgeAlert(alertId: string): Promise<Alert | null> {
    try {
      const alert = await this.prisma.alert.update({
        where: { id: alertId },
        data: {
          acknowledged: true,
          acknowledgedAt: new Date(),
        },
      });

      logger.info('Alert acknowledged', { alertId });
      return alert as Alert;
    } catch (error) {
      logger.error('Failed to acknowledge alert', error);
      return null;
    }
  }

  async getActiveAlerts(): Promise<Alert[]> {
    const alerts = await this.prisma.alert.findMany({
      where: {
        triggered: true,
        acknowledged: false,
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 100,
    });

    return alerts as Alert[];
  }

  async stop(): Promise<void> {
    logger.info('Stopping alert manager');

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    this.scheduleJobs.forEach((job) => job.cancel());
    this.scheduleJobs.clear();

    this.cooldowns.clear();
    this.detectionCounts.clear();
    this.alertQueue = [];

    logger.info('Alert manager stopped');
  }

  getCooldowns(): Map<string, AlertCooldown> {
    return new Map(this.cooldowns);
  }

  getQueueSize(): number {
    return this.alertQueue.length;
  }
}