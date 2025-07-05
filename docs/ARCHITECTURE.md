# Software Architecture

## Overview

The BPDevice system is built with TypeScript/Node.js following a modular, event-driven architecture optimized for real-time passive detection and low resource usage on Raspberry Pi hardware.

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Web Dashboard                         │
│                    (React + TypeScript)                      │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP/WebSocket
┌────────────────────────────┴────────────────────────────────┐
│                      API Gateway                             │
│                  (Express + Socket.io)                       │
└────────────────────────────┬────────────────────────────────┘
                             │
┌─────────────────────────────────────────────────────────────┐
│                    Core Application                          │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │  Detection   │  │    Alert     │  │   Database      │   │
│  │   Engine     │  │   Manager    │  │   Service       │   │
│  └──────┬──────┘  └──────┬───────┘  └────────┬────────┘   │
│         │                 │                    │             │
│  ┌──────┴───────────────┴─────────────────────┴────────┐   │
│  │              Event Bus (EventEmitter)                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                             │
┌─────────────────┬───────────┴───────────┬───────────────────┐
│   WiFi Module   │   Bluetooth Module    │   LoRa Module     │
│  (pcap binding) │  (noble + custom)     │  (SerialPort)     │
└─────────────────┴───────────────────────┴───────────────────┘
```

## Core Components

### 1. Detection Engine (`src/detection/`)

The heart of the system that manages all detection operations.

#### Components:
- **DetectionManager**: Orchestrates all detection modules
- **WiFiDetector**: Handles WiFi packet capture and analysis
- **BluetoothDetector**: Manages BLE and classic Bluetooth scanning
- **DeviceTracker**: Maintains device state and history

#### Key Features:
- Concurrent detection streams
- MAC address normalization
- Signal strength analysis
- Device fingerprinting

### 2. Alert System (`src/alerts/`)

Manages detection events and triggers.

#### Components:
- **AlertManager**: Processes detection events
- **TriggerEngine**: Evaluates trigger conditions
- **LoRaTransmitter**: Sends trigger signals
- **NotificationService**: Local and remote notifications

#### Key Features:
- Rule-based triggering
- Alert cooldown periods
- Priority queuing
- Delivery confirmation

### 3. Database Layer (`src/database/`)

Persistent storage using SQLite with Prisma ORM.

#### Schema:
```typescript
// Device Model
model Device {
  id            String    @id
  macAddress    String    @unique
  type          String    // 'wifi' | 'bluetooth'
  firstSeen     DateTime
  lastSeen      DateTime
  manufacturer  String?
  isWhitelisted Boolean   @default(false)
  detections    Detection[]
}

// Detection Model
model Detection {
  id           String   @id
  deviceId     String
  timestamp    DateTime
  signalStrength Int
  frequency    Float?
  location     String?
  metadata     Json?
  device       Device   @relation(fields: [deviceId], references: [id])
}

// Alert Model
model Alert {
  id          String   @id
  timestamp   DateTime
  type        String
  deviceId    String
  triggered   Boolean
  metadata    Json?
}
```

### 4. Configuration System (`src/config/`)

Flexible configuration management.

#### Components:
- **ConfigManager**: Runtime configuration
- **WhitelistManager**: Authorized device management
- **ScheduleManager**: Time-based profiles

#### Configuration Structure:
```typescript
interface SystemConfig {
  detection: {
    wifi: {
      enabled: boolean;
      interface: string;
      channels: number[];
      dwellTime: number;
    };
    bluetooth: {
      enabled: boolean;
      interfaces: string[];
      scanInterval: number;
      scanWindow: number;
    };
  };
  alerts: {
    cooldownPeriod: number;
    minSignalStrength: number;
    requiredDetections: number;
  };
  whitelist: {
    devices: string[];
    networks: string[];
  };
}
```

### 5. API Layer (`src/api/`)

RESTful API with real-time updates.

#### Endpoints:
- `GET /api/devices` - List all detected devices
- `GET /api/devices/:id` - Device details
- `POST /api/whitelist` - Add to whitelist
- `GET /api/alerts` - Alert history
- `GET /api/stats` - System statistics
- `WS /api/live` - Real-time updates

### 6. Utilities (`src/utils/`)

Supporting utilities and helpers.

#### Components:
- **Logger**: Winston-based logging
- **Metrics**: Performance monitoring
- **SystemMonitor**: Resource usage tracking
- **MACParser**: MAC address utilities

## Data Flow

### Detection Flow
```
1. Hardware Interface captures packets/signals
2. Raw data parsed by detector modules
3. MAC addresses extracted and normalized
4. Device tracked in DeviceTracker
5. Detection event emitted to EventBus
6. Database updated with detection record
7. AlertManager evaluates trigger conditions
8. If triggered, LoRa signal sent
9. Web dashboard updated via WebSocket
```

### Event System

The application uses Node.js EventEmitter for internal communication:

```typescript
// Event Types
interface SystemEvents {
  'device.detected': { device: Device; signal: number };
  'device.lost': { device: Device };
  'alert.triggered': { alert: Alert };
  'config.updated': { config: SystemConfig };
  'system.error': { error: Error; module: string };
}
```

## Security Considerations

### 1. Input Validation
- All MAC addresses validated and sanitized
- Configuration inputs strictly typed
- API endpoints protected with validation middleware

### 2. Data Privacy
- No packet payload inspection
- Only metadata stored
- Optional data anonymization

### 3. Access Control
- API authentication via JWT
- Role-based permissions
- Audit logging

## Performance Optimization

### 1. Memory Management
- Streaming packet processing
- Circular buffer for recent detections
- Periodic database cleanup

### 2. CPU Optimization
- Worker threads for heavy processing
- Debounced database writes
- Efficient packet filtering

### 3. Power Management
- Adaptive scanning intervals
- CPU throttling during idle
- Wake-on-detection modes

## Deployment Architecture

### Production Setup
```
├── Application (PM2 managed)
│   ├── Main Process
│   ├── WiFi Worker
│   └── Bluetooth Worker
├── Database (SQLite)
├── Logs (rotating files)
└── Web Server (nginx reverse proxy)
```

### Development Setup
```
├── TypeScript Compiler (watch mode)
├── Nodemon (auto-restart)
├── SQLite (in-memory for tests)
└── React Dev Server
```

## Technology Stack Details

### Core Technologies
- **Node.js 18+**: Runtime environment
- **TypeScript 5+**: Type safety and modern JavaScript
- **Express 4**: Web framework
- **Socket.io**: Real-time communication
- **Prisma**: Database ORM
- **SQLite**: Embedded database

### Detection Libraries
- **pcap**: Native packet capture bindings
- **@abandonware/noble**: BLE scanning
- **node-bluetooth**: Classic Bluetooth
- **serialport**: LoRa communication

### Development Tools
- **Jest**: Unit and integration testing
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **PM2**: Process management
- **Winston**: Logging

## Scalability Considerations

### Horizontal Scaling
- Multiple Pi devices can form a mesh
- Centralized data aggregation
- Distributed detection zones

### Vertical Scaling
- Supports Pi 4 (4GB/8GB)
- Optimized for ARM architecture
- GPU acceleration for packet processing

## Next Steps

1. Review the [Implementation Guide](IMPLEMENTATION.md) for step-by-step setup
2. Configure your system using [Configuration Reference](CONFIGURATION.md)
3. Explore the [API Documentation](API.md) for integration options