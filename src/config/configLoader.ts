import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { SystemConfig } from '@/types';
import { logger } from '@/utils/logger';

const DEFAULT_CONFIG: SystemConfig = {
  system: {
    name: 'BPDevice-01',
    location: 'Default Location',
    timezone: 'UTC',
  },
  detection: {
    wifi: {
      enabled: true,
      interface: 'wlan1',
      channels: [1, 6, 11],
      dwellTime: 250,
      signalThreshold: -90,
    },
    bluetooth: {
      enabled: true,
      interfaces: ['hci0'],
      scanInterval: 10000,
      scanWindow: 5000,
      rssiThreshold: -90,
    },
  },
  alerts: {
    enabled: true,
    cooldownMinutes: 5,
    minSignalStrength: -80,
    requiredDetections: 3,
    rules: [
      {
        name: 'New Device Alert',
        type: 'new_device',
        enabled: true,
        conditions: {
          signalStrength: -80,
          detectionCount: 3,
          timeWindow: 60,
        },
        actions: ['lora', 'log'],
      },
      {
        name: 'Proximity Alert',
        type: 'proximity',
        enabled: true,
        conditions: {
          signalStrength: -60,
          detectionCount: 1,
        },
        actions: ['lora', 'log'],
      },
    ],
  },
  lora: {
    enabled: true,
    port: '/dev/ttyAMA0',
    baudRate: 115200,
    deviceId: 'BP001',
  },
  whitelist: {
    devices: [],
    manufacturers: [],
  },
};

export async function loadConfig(): Promise<SystemConfig> {
  let config = { ...DEFAULT_CONFIG };

  const configPath = join(process.cwd(), 'config', 'config.json');
  if (existsSync(configPath)) {
    try {
      const fileConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      config = mergeConfig(config, fileConfig);
      logger.info('Configuration loaded from file', { path: configPath });
    } catch (error) {
      logger.error('Failed to load config file', error);
    }
  }

  config = mergeConfigFromEnv(config);

  validateConfig(config);

  logger.info('Configuration loaded', {
    wifi: config.detection.wifi.enabled,
    bluetooth: config.detection.bluetooth.enabled,
    alerts: config.alerts.enabled,
    lora: config.lora.enabled,
  });

  return config;
}

function mergeConfig(base: SystemConfig, override: any): SystemConfig {
  return {
    system: { ...base.system, ...override.system },
    detection: {
      wifi: { ...base.detection.wifi, ...override.detection?.wifi },
      bluetooth: { ...base.detection.bluetooth, ...override.detection?.bluetooth },
    },
    alerts: {
      ...base.alerts,
      ...override.alerts,
      rules: override.alerts?.rules || base.alerts.rules,
    },
    lora: { ...base.lora, ...override.lora },
    whitelist: {
      devices: override.whitelist?.devices || base.whitelist.devices,
      manufacturers: override.whitelist?.manufacturers || base.whitelist.manufacturers,
    },
  };
}

function mergeConfigFromEnv(config: SystemConfig): SystemConfig {
  if (process.env.WIFI_INTERFACE) {
    config.detection.wifi.interface = process.env.WIFI_INTERFACE;
  }

  if (process.env.WIFI_CHANNELS) {
    config.detection.wifi.channels = process.env.WIFI_CHANNELS.split(',').map(Number);
  }

  if (process.env.WIFI_ENABLED !== undefined) {
    config.detection.wifi.enabled = process.env.WIFI_ENABLED === 'true';
  }

  if (process.env.BLUETOOTH_ENABLED !== undefined) {
    config.detection.bluetooth.enabled = process.env.BLUETOOTH_ENABLED === 'true';
  }

  if (process.env.LORA_PORT) {
    config.lora.port = process.env.LORA_PORT;
  }

  if (process.env.LORA_BAUD_RATE) {
    config.lora.baudRate = parseInt(process.env.LORA_BAUD_RATE);
  }

  if (process.env.ALERT_COOLDOWN_MINUTES) {
    config.alerts.cooldownMinutes = parseInt(process.env.ALERT_COOLDOWN_MINUTES);
  }

  if (process.env.ALERT_MIN_SIGNAL_STRENGTH) {
    config.alerts.minSignalStrength = parseInt(process.env.ALERT_MIN_SIGNAL_STRENGTH);
  }

  return config;
}

function validateConfig(config: SystemConfig): void {
  if (!config.detection.wifi.interface && config.detection.wifi.enabled) {
    throw new Error('WiFi interface is required when WiFi detection is enabled');
  }

  if (config.detection.wifi.channels.length === 0 && config.detection.wifi.enabled) {
    throw new Error('At least one WiFi channel must be specified');
  }

  if (!config.lora.port && config.lora.enabled) {
    throw new Error('LoRa port is required when LoRa is enabled');
  }

  if (config.lora.baudRate <= 0) {
    throw new Error('Invalid LoRa baud rate');
  }

  if (config.alerts.cooldownMinutes < 0) {
    throw new Error('Alert cooldown must be non-negative');
  }

  if (config.detection.wifi.signalThreshold > 0 || config.detection.wifi.signalThreshold < -100) {
    throw new Error('WiFi signal threshold must be between -100 and 0');
  }
}