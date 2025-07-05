# Implementation Guide

This guide provides step-by-step instructions for implementing the Bluetooth & WiFi Passive Detection System.

## Prerequisites

- Raspberry Pi 4 with hardware configured (see [Hardware Setup](HARDWARE_SETUP.md))
- Node.js 18+ installed
- Git installed
- Basic TypeScript/JavaScript knowledge

## Phase 1: Project Setup

### Step 1: Install Node.js on Raspberry Pi

```bash
# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version

# Install build tools
sudo apt-get install -y build-essential python3
```

### Step 2: Initialize Project

```bash
# Create project directory
mkdir -p ~/BPDevice
cd ~/BPDevice

# Initialize npm project
npm init -y

# Install TypeScript and development dependencies
npm install --save-dev typescript @types/node ts-node nodemon
npm install --save-dev @typescript-eslint/parser @typescript-eslint/eslint-plugin
npm install --save-dev prettier eslint jest @types/jest ts-jest
npm install --save-dev prisma

# Install production dependencies
npm install express @types/express
npm install socket.io @types/socket.io
npm install winston @types/winston
npm install dotenv
npm install @prisma/client
npm install node-schedule @types/node-schedule
```

### Step 3: Configure TypeScript

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "types": ["node", "jest"],
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Step 4: Create Project Structure

```bash
# Create directory structure
mkdir -p src/{detection,alerts,config,database,api,utils}
mkdir -p src/types
mkdir -p tests
mkdir -p scripts
mkdir -p web
mkdir -p logs
```

## Phase 2: Core Detection Implementation

### Step 1: Install Native Dependencies

```bash
# WiFi packet capture
sudo apt-get install -y libpcap-dev
npm install pcap @types/pcap

# Bluetooth dependencies
sudo apt-get install -y bluetooth bluez libbluetooth-dev libudev-dev
npm install @abandonware/noble

# Serial port for LoRa
npm install serialport @types/serialport
```

### Step 2: Create Type Definitions

Create `src/types/index.ts`:
```typescript
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
  type: 'intrusion' | 'new_device' | 'signal_threshold';
  deviceId: string;
  triggered: boolean;
  metadata?: Record<string, any>;
}

export interface SystemConfig {
  detection: {
    wifi: {
      enabled: boolean;
      interface: string;
      channels: number[];
      dwellTime: number;
    };
    bluetooth: {
      enabled: boolean;
      scanInterval: number;
      scanWindow: number;
    };
  };
  alerts: {
    enabled: boolean;
    cooldownMinutes: number;
    minSignalStrength: number;
    requiredDetections: number;
  };
  lora: {
    enabled: boolean;
    port: string;
    baudRate: number;
  };
}
```

### Step 3: Implement WiFi Detection

Create `src/detection/WifiDetector.ts`:
```typescript
import * as pcap from 'pcap';
import { EventEmitter } from 'events';
import { Device } from '@/types';
import { logger } from '@/utils/logger';
import { parseMacAddress, getManufacturer } from '@/utils/macParser';

export class WifiDetector extends EventEmitter {
  private session: pcap.PcapSession | null = null;
  private interface: string;
  private channels: number[];
  private currentChannel: number = 1;
  private channelHopper: NodeJS.Timer | null = null;

  constructor(interfaceName: string, channels: number[] = [1, 6, 11]) {
    super();
    this.interface = interfaceName;
    this.channels = channels;
  }

  async start(): Promise<void> {
    try {
      // Enable monitor mode
      await this.enableMonitorMode();

      // Start packet capture
      this.session = pcap.createSession(this.interface, {
        filter: 'type mgt subtype probe-req or subtype probe-resp',
        buffer_timeout: 1000,
      });

      this.session.on('packet', this.handlePacket.bind(this));

      // Start channel hopping
      this.startChannelHopping();

      logger.info('WiFi detector started', { interface: this.interface });
    } catch (error) {
      logger.error('Failed to start WiFi detector', error);
      throw error;
    }
  }

  private async enableMonitorMode(): Promise<void> {
    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);

    try {
      await execAsync(`sudo ip link set ${this.interface} down`);
      await execAsync(`sudo iw ${this.interface} set monitor control`);
      await execAsync(`sudo ip link set ${this.interface} up`);
    } catch (error) {
      throw new Error(`Failed to enable monitor mode: ${error}`);
    }
  }

  private handlePacket(rawPacket: Buffer): void {
    try {
      const packet = pcap.decode.packet(rawPacket);
      const payload = packet.payload?.payload?.payload;

      if (!payload) return;

      // Extract MAC address from management frame
      const srcMac = this.extractMacAddress(payload);
      if (!srcMac) return;

      // Calculate signal strength (if available)
      const signalStrength = this.extractSignalStrength(rawPacket);

      const device: Partial<Device> = {
        macAddress: parseMacAddress(srcMac),
        type: 'wifi',
        manufacturer: getManufacturer(srcMac),
        signalStrength: signalStrength || -100,
        lastSeen: new Date(),
      };

      this.emit('device-detected', device);
    } catch (error) {
      logger.error('Error processing packet', error);
    }
  }

  private extractMacAddress(payload: any): string | null {
    // Extract source MAC from 802.11 frame
    // Implementation depends on frame structure
    return payload.shost?.toString('hex').match(/.{2}/g)?.join(':') || null;
  }

  private extractSignalStrength(packet: Buffer): number | null {
    // Extract RSSI from radiotap header if available
    // This is hardware-dependent
    return -70; // Placeholder
  }

  private startChannelHopping(): void {
    this.channelHopper = setInterval(() => {
      this.currentChannel = this.channels[
        (this.channels.indexOf(this.currentChannel) + 1) % this.channels.length
      ];
      this.setChannel(this.currentChannel);
    }, 250); // Hop every 250ms
  }

  private setChannel(channel: number): void {
    const { exec } = require('child_process');
    exec(`sudo iw ${this.interface} set channel ${channel}`, (error: any) => {
      if (error) {
        logger.error(`Failed to set channel ${channel}`, error);
      }
    });
  }

  stop(): void {
    if (this.channelHopper) {
      clearInterval(this.channelHopper);
    }
    if (this.session) {
      this.session.close();
    }
    logger.info('WiFi detector stopped');
  }
}
```

### Step 4: Implement Bluetooth Detection

Create `src/detection/BluetoothDetector.ts`:
```typescript
import * as noble from '@abandonware/noble';
import { EventEmitter } from 'events';
import { Device } from '@/types';
import { logger } from '@/utils/logger';
import { parseMacAddress, getManufacturer } from '@/utils/macParser';

export class BluetoothDetector extends EventEmitter {
  private scanning: boolean = false;
  private classicScanner: NodeJS.Timer | null = null;

  async start(): Promise<void> {
    try {
      // Start BLE scanning
      noble.on('stateChange', (state: string) => {
        if (state === 'poweredOn') {
          this.startBLEScanning();
        }
      });

      noble.on('discover', this.handleBLEDevice.bind(this));

      // Start classic Bluetooth scanning
      this.startClassicScanning();

      logger.info('Bluetooth detector started');
    } catch (error) {
      logger.error('Failed to start Bluetooth detector', error);
      throw error;
    }
  }

  private startBLEScanning(): void {
    noble.startScanning([], true); // Scan for all services, allow duplicates
    this.scanning = true;
  }

  private handleBLEDevice(peripheral: noble.Peripheral): void {
    const device: Partial<Device> = {
      macAddress: parseMacAddress(peripheral.address),
      type: 'bluetooth',
      manufacturer: getManufacturer(peripheral.address),
      signalStrength: peripheral.rssi || -100,
      lastSeen: new Date(),
    };

    this.emit('device-detected', device);
  }

  private startClassicScanning(): void {
    const { exec } = require('child_process');
    
    // Scan for classic Bluetooth devices every 10 seconds
    this.classicScanner = setInterval(() => {
      exec('sudo hcitool scan --length=5', (error: any, stdout: string) => {
        if (error) {
          logger.error('Classic Bluetooth scan failed', error);
          return;
        }

        this.parseClassicDevices(stdout);
      });
    }, 10000);
  }

  private parseClassicDevices(output: string): void {
    const lines = output.split('\n').slice(1); // Skip header
    
    lines.forEach(line => {
      const match = line.match(/([0-9A-F:]{17})\s+(.*)/i);
      if (match) {
        const [, macAddress, name] = match;
        
        const device: Partial<Device> = {
          macAddress: parseMacAddress(macAddress),
          type: 'bluetooth',
          manufacturer: getManufacturer(macAddress),
          signalStrength: -70, // Classic doesn't provide RSSI easily
          lastSeen: new Date(),
        };

        this.emit('device-detected', device);
      }
    });
  }

  stop(): void {
    if (this.scanning) {
      noble.stopScanning();
    }
    if (this.classicScanner) {
      clearInterval(this.classicScanner);
    }
    logger.info('Bluetooth detector stopped');
  }
}
```

## Phase 3: Database Setup

### Step 1: Initialize Prisma

```bash
# Initialize Prisma with SQLite
npx prisma init --datasource-provider sqlite
```

### Step 2: Define Schema

Edit `prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:../data/bpdevice.db"
}

model Device {
  id            String      @id @default(cuid())
  macAddress    String      @unique
  type          String
  manufacturer  String?
  firstSeen     DateTime    @default(now())
  lastSeen      DateTime
  isWhitelisted Boolean     @default(false)
  detections    Detection[]
  alerts        Alert[]
}

model Detection {
  id             String   @id @default(cuid())
  deviceId       String
  timestamp      DateTime @default(now())
  signalStrength Int
  frequency      Float?
  channel        Int?
  metadata       String?  // JSON string
  device         Device   @relation(fields: [deviceId], references: [id])
}

model Alert {
  id        String   @id @default(cuid())
  timestamp DateTime @default(now())
  type      String
  deviceId  String
  triggered Boolean  @default(false)
  metadata  String?  // JSON string
  device    Device   @relation(fields: [deviceId], references: [id])
}

model Whitelist {
  id         String   @id @default(cuid())
  macAddress String   @unique
  name       String?
  addedAt    DateTime @default(now())
}
```

### Step 3: Generate Prisma Client

```bash
# Create database directory
mkdir -p data

# Generate Prisma client
npx prisma generate

# Create initial migration
npx prisma migrate dev --name init
```

## Phase 4: Alert System Implementation

### Step 1: Create LoRa Transmitter

Create `src/alerts/LoraTransmitter.ts`:
```typescript
import { SerialPort } from 'serialport';
import { EventEmitter } from 'events';
import { logger } from '@/utils/logger';

export class LoraTransmitter extends EventEmitter {
  private port: SerialPort | null = null;
  private config: { port: string; baudRate: number };

  constructor(config: { port: string; baudRate: number }) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      this.port = new SerialPort({
        path: this.config.port,
        baudRate: this.config.baudRate,
      });

      this.port.on('open', () => {
        logger.info('LoRa module connected');
        this.emit('connected');
      });

      this.port.on('data', (data: Buffer) => {
        logger.debug('LoRa response:', data.toString());
      });

      this.port.on('error', (err: Error) => {
        logger.error('LoRa error:', err);
        this.emit('error', err);
      });
    } catch (error) {
      logger.error('Failed to connect to LoRa module', error);
      throw error;
    }
  }

  async sendTrigger(deviceId: string, alertType: string): Promise<void> {
    if (!this.port) {
      throw new Error('LoRa module not connected');
    }

    const message = JSON.stringify({
      cmd: 'TRIGGER',
      deviceId,
      alertType,
      timestamp: Date.now(),
    });

    return new Promise((resolve, reject) => {
      this.port!.write(message + '\n', (err) => {
        if (err) {
          reject(err);
        } else {
          logger.info('Trigger sent via LoRa', { deviceId, alertType });
          resolve();
        }
      });
    });
  }

  disconnect(): void {
    if (this.port) {
      this.port.close();
      this.port = null;
    }
  }
}
```

## Phase 5: Main Application

### Step 1: Create Main Entry Point

Create `src/index.ts`:
```typescript
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

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  try {
    // Load configuration
    const config = await loadConfig();
    
    // Initialize components
    const wifiDetector = new WifiDetector(
      config.detection.wifi.interface,
      config.detection.wifi.channels
    );
    
    const bluetoothDetector = new BluetoothDetector();
    
    const loraTransmitter = new LoraTransmitter({
      port: config.lora.port,
      baudRate: config.lora.baudRate,
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
    
    // Connect components
    detectionManager.on('new-device', (device) => {
      alertManager.evaluateDevice(device);
    });
    
    // Start services
    await loraTransmitter.connect();
    await detectionManager.start();
    
    // Start API server
    const apiServer = createApiServer(prisma, detectionManager, alertManager);
    const port = process.env.PORT || 3000;
    apiServer.listen(port, () => {
      logger.info(`API server listening on port ${port}`);
    });
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down...');
      await detectionManager.stop();
      loraTransmitter.disconnect();
      await prisma.$disconnect();
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('Failed to start application', error);
    process.exit(1);
  }
}

main();
```

## Phase 6: Package Scripts

Update `package.json`:
```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "nodemon --exec ts-node src/index.ts",
    "test": "jest",
    "lint": "eslint src/**/*.ts",
    "format": "prettier --write src/**/*.ts",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:seed": "ts-node scripts/seed.ts",
    "setup": "npm run db:generate && npm run db:migrate"
  }
}
```

## Phase 7: Production Deployment

### Step 1: Create PM2 Configuration

Create `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [{
    name: 'bpdevice',
    script: './dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  }]
};
```

### Step 2: Deploy Script

Create `scripts/deploy.sh`:
```bash
#!/bin/bash

# Build TypeScript
echo "Building application..."
npm run build

# Run database migrations
echo "Running database migrations..."
npm run db:migrate

# Start with PM2
echo "Starting application with PM2..."
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save
pm2 startup

echo "Deployment complete!"
```

### Step 3: System Service

Create `/etc/systemd/system/bpdevice.service`:
```ini
[Unit]
Description=BPDevice Passive Detection System
After=network.target

[Service]
Type=forking
User=pi
WorkingDirectory=/home/pi/BPDevice
ExecStart=/usr/bin/pm2 start ecosystem.config.js
ExecReload=/usr/bin/pm2 reload all
ExecStop=/usr/bin/pm2 stop all
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## Testing

### Unit Tests

Create `tests/detection/WifiDetector.test.ts`:
```typescript
import { WifiDetector } from '@/detection/WifiDetector';

describe('WifiDetector', () => {
  let detector: WifiDetector;

  beforeEach(() => {
    detector = new WifiDetector('wlan1', [1, 6, 11]);
  });

  afterEach(() => {
    detector.stop();
  });

  test('should emit device-detected event', (done) => {
    detector.on('device-detected', (device) => {
      expect(device.type).toBe('wifi');
      expect(device.macAddress).toBeDefined();
      done();
    });

    // Simulate packet detection
    // ... test implementation
  });
});
```

## Troubleshooting

### Common Issues

1. **Permission Errors**
   - Run with sudo for packet capture
   - Add user to bluetooth group: `sudo usermod -a -G bluetooth pi`

2. **Monitor Mode Issues**
   - Check adapter support: `iw list | grep monitor`
   - Disable NetworkManager for the interface

3. **LoRa Connection Failed**
   - Check serial port permissions: `sudo chmod 666 /dev/ttyAMA0`
   - Verify baud rate matches ESP32 configuration

4. **High CPU Usage**
   - Adjust channel hopping interval
   - Implement packet sampling
   - Use worker threads for processing

## Next Steps

1. Configure the system using [Configuration Reference](CONFIGURATION.md)
2. Review the [API Documentation](API.md) for integration
3. Set up monitoring and alerts
4. Deploy to production environment