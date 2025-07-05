export interface Device {
  id: string;
  macAddress: string;
  type: 'wifi' | 'bluetooth';
  manufacturer?: string;
  firstSeen: Date;
  lastSeen: Date;
  signalStrength: number;
  isWhitelisted: boolean;
}

export interface Detection {
  id: string;
  deviceId: string;
  timestamp: Date;
  signalStrength: number;
  frequency?: number;
  channel?: number;
  metadata?: Record<string, any>;
}

export interface Alert {
  id: string;
  timestamp: Date;
  type: 'intrusion' | 'new_device' | 'signal_threshold' | 'proximity';
  deviceId: string;
  triggered: boolean;
  acknowledged?: boolean;
  acknowledgedAt?: Date;
  metadata?: Record<string, any>;
}

export interface SystemConfig {
  system: {
    name: string;
    location: string;
    timezone: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
  detection: {
    wifi: {
      enabled: boolean;
      interface: string;
      channels: number[];
      dwellTime: number;
      signalThreshold: number;
    };
    bluetooth: {
      enabled: boolean;
      interfaces: string[];
      scanInterval: number;
      scanWindow: number;
      rssiThreshold: number;
    };
  };
  alerts: {
    enabled: boolean;
    cooldownMinutes: number;
    minSignalStrength: number;
    requiredDetections: number;
    rules: AlertRule[];
  };
  lora: {
    enabled: boolean;
    port: string;
    baudRate: number;
    deviceId: string;
  };
  whitelist: {
    devices: WhitelistDevice[];
    manufacturers: string[];
  };
}

export interface AlertRule {
  name: string;
  type: string;
  enabled: boolean;
  conditions: {
    signalStrength?: number;
    detectionCount?: number;
    timeWindow?: number;
  };
  actions: ('lora' | 'log' | 'webhook')[];
  schedule?: {
    startTime: string;
    endTime: string;
    days: string[];
  };
}

export interface WhitelistDevice {
  macAddress: string;
  name?: string;
  type: 'permanent' | 'temporary';
  expiresAt?: Date;
}

export interface DetectionEvent {
  device: Partial<Device>;
  timestamp: Date;
  source: 'wifi' | 'bluetooth';
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'error';
  uptime: number;
  components: {
    wifi: ComponentHealth;
    bluetooth: ComponentHealth;
    database: ComponentHealth;
    lora: ComponentHealth;
  };
}

export interface ComponentHealth {
  status: 'operational' | 'degraded' | 'error';
  lastCheck: Date;
  details?: Record<string, any>;
}

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: 'admin' | 'viewer';
  createdAt: Date;
  lastLogin?: Date;
}

export interface AuthToken {
  token: string;
  expiresIn: string;
  userId: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface DeviceStats {
  totalDevices: number;
  activeDevices: number;
  wifiDevices: number;
  bluetoothDevices: number;
  detectionRate: number;
  avgSignalStrength: number;
}

export interface SystemStats {
  cpu: {
    usage: number;
    temperature?: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  network: {
    rx: number;
    tx: number;
    rxRate: number;
    txRate: number;
  };
}