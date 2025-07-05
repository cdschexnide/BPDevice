# Configuration Reference

This document details all configuration options for the BPDevice system.

## Configuration Files

The system uses multiple configuration sources with the following priority:
1. Environment variables (highest priority)
2. `.env` file
3. `config.json` file
4. Default values (lowest priority)

## Environment Variables

Create a `.env` file in the project root:

```bash
# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL="file:./data/bpdevice.db"

# WiFi Detection
WIFI_INTERFACE=wlan1
WIFI_CHANNELS=1,6,11
WIFI_DWELL_TIME=250

# Bluetooth Detection
BLUETOOTH_ENABLED=true
BLUETOOTH_SCAN_INTERVAL=10000
BLUETOOTH_SCAN_WINDOW=5000

# LoRa Communication
LORA_PORT=/dev/ttyAMA0
LORA_BAUD_RATE=115200

# Alert Settings
ALERT_COOLDOWN_MINUTES=5
ALERT_MIN_SIGNAL_STRENGTH=-80
ALERT_REQUIRED_DETECTIONS=3

# API Security
JWT_SECRET=your-secret-key-here
API_KEY=your-api-key-here
```

## Configuration File (config.json)

Create `config/config.json` for detailed settings:

```json
{
  "system": {
    "name": "BPDevice-01",
    "location": "Front Gate",
    "timezone": "America/New_York",
    "coordinates": {
      "latitude": 40.7128,
      "longitude": -74.0060
    }
  },
  "detection": {
    "wifi": {
      "enabled": true,
      "interface": "wlan1",
      "channels": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      "dwellTime": 250,
      "hopPattern": "sequential",
      "packetFilter": "type mgt subtype probe-req or subtype probe-resp",
      "signalThreshold": -90,
      "vendorFilter": {
        "enabled": false,
        "allowedVendors": [],
        "blockedVendors": []
      }
    },
    "bluetooth": {
      "enabled": true,
      "interfaces": ["hci0", "hci1"],
      "scanInterval": 10000,
      "scanWindow": 5000,
      "scanMode": "active",
      "bleEnabled": true,
      "classicEnabled": true,
      "nameResolution": true,
      "rssiThreshold": -90
    }
  },
  "alerts": {
    "enabled": true,
    "rules": [
      {
        "name": "New Device Alert",
        "type": "new_device",
        "enabled": true,
        "conditions": {
          "signalStrength": -80,
          "detectionCount": 3,
          "timeWindow": 60
        },
        "actions": ["lora", "log", "webhook"]
      },
      {
        "name": "Proximity Alert",
        "type": "proximity",
        "enabled": true,
        "conditions": {
          "signalStrength": -60,
          "detectionCount": 1
        },
        "actions": ["lora", "log"]
      },
      {
        "name": "Scheduled Alert",
        "type": "scheduled",
        "enabled": true,
        "schedule": {
          "startTime": "22:00",
          "endTime": "06:00",
          "days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        },
        "conditions": {
          "signalStrength": -85
        },
        "actions": ["lora", "webhook"]
      }
    ],
    "cooldown": {
      "globalMinutes": 5,
      "perDeviceMinutes": 15,
      "maxAlertsPerHour": 20
    },
    "webhooks": [
      {
        "name": "Primary Webhook",
        "url": "https://your-server.com/webhook",
        "method": "POST",
        "headers": {
          "Authorization": "Bearer your-token"
        },
        "retries": 3,
        "timeout": 5000
      }
    ]
  },
  "whitelist": {
    "devices": [
      {
        "macAddress": "AA:BB:CC:DD:EE:FF",
        "name": "Owner's Phone",
        "type": "permanent"
      },
      {
        "macAddress": "11:22:33:44:55:66",
        "name": "Guest Device",
        "type": "temporary",
        "expiresAt": "2024-12-31T23:59:59Z"
      }
    ],
    "networks": [
      {
        "ssid": "HomeNetwork",
        "type": "permanent"
      }
    ],
    "manufacturers": [
      "Apple Inc.",
      "Samsung Electronics"
    ]
  },
  "lora": {
    "enabled": true,
    "port": "/dev/ttyAMA0",
    "baudRate": 115200,
    "deviceId": "BP001",
    "encryption": {
      "enabled": true,
      "key": "your-encryption-key"
    },
    "protocol": {
      "version": "1.0",
      "messageFormat": "json",
      "acknowledgment": true,
      "retries": 3,
      "timeout": 5000
    }
  },
  "database": {
    "retentionDays": 30,
    "vacuumSchedule": "0 3 * * *",
    "backupEnabled": true,
    "backupPath": "/backup/bpdevice/",
    "backupSchedule": "0 2 * * *",
    "maxDetectionsPerDevice": 10000
  },
  "logging": {
    "level": "info",
    "outputs": ["console", "file"],
    "file": {
      "path": "./logs/bpdevice.log",
      "maxSize": "10m",
      "maxFiles": 5,
      "compress": true
    },
    "syslog": {
      "enabled": false,
      "host": "localhost",
      "port": 514,
      "protocol": "udp4"
    }
  },
  "api": {
    "enabled": true,
    "port": 3000,
    "cors": {
      "enabled": true,
      "origins": ["http://localhost:3001"],
      "credentials": true
    },
    "rateLimit": {
      "enabled": true,
      "windowMs": 900000,
      "max": 100
    },
    "authentication": {
      "enabled": true,
      "type": "jwt",
      "expiresIn": "24h"
    }
  },
  "monitoring": {
    "enabled": true,
    "metrics": {
      "enabled": true,
      "interval": 60000,
      "include": [
        "detectionRate",
        "alertRate",
        "cpuUsage",
        "memoryUsage",
        "diskUsage",
        "networkTraffic"
      ]
    },
    "healthCheck": {
      "enabled": true,
      "interval": 30000,
      "timeout": 5000,
      "endpoints": [
        {
          "name": "WiFi Adapter",
          "type": "system",
          "command": "iwconfig wlan1"
        },
        {
          "name": "Bluetooth",
          "type": "system",
          "command": "hciconfig"
        },
        {
          "name": "LoRa Module",
          "type": "serial",
          "port": "/dev/ttyAMA0"
        }
      ]
    }
  },
  "performance": {
    "maxConcurrentDetections": 1000,
    "detectionQueueSize": 5000,
    "workerThreads": 2,
    "gcInterval": 300000,
    "cpuThreshold": 80,
    "memoryThreshold": 80
  }
}
```

## Schedule Configuration

The system supports cron-style scheduling for various operations:

```json
{
  "schedules": {
    "scanning": {
      "wifi": {
        "active": [
          {
            "start": "06:00",
            "end": "22:00",
            "mode": "normal",
            "channels": [1, 6, 11]
          },
          {
            "start": "22:00",
            "end": "06:00",
            "mode": "aggressive",
            "channels": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
          }
        ]
      },
      "bluetooth": {
        "active": [
          {
            "days": ["Mon", "Tue", "Wed", "Thu", "Fri"],
            "start": "08:00",
            "end": "18:00",
            "interval": 5000
          },
          {
            "days": ["Sat", "Sun"],
            "start": "10:00",
            "end": "20:00",
            "interval": 10000
          }
        ]
      }
    },
    "maintenance": {
      "databaseCleanup": "0 3 * * *",
      "logRotation": "0 0 * * *",
      "systemRestart": "0 4 * * 0"
    }
  }
}
```

## Advanced Configuration

### MAC Address Filtering

```json
{
  "filtering": {
    "mac": {
      "randomized": {
        "detect": true,
        "track": false,
        "alert": false
      },
      "patterns": {
        "allow": [
          "^00:1B:44",  // Cisco devices
          "^AC:CF:5C"   // Apple devices
        ],
        "block": [
          "^02:",       // Locally administered
          "^06:",       // Multicast
          "^0A:"        // Private
        ]
      }
    }
  }
}
```

### Signal Processing

```json
{
  "signal": {
    "processing": {
      "smoothing": {
        "enabled": true,
        "algorithm": "exponential",
        "factor": 0.8
      },
      "calibration": {
        "wifi": {
          "offset": -5,
          "multiplier": 1.0
        },
        "bluetooth": {
          "offset": -3,
          "multiplier": 1.0
        }
      },
      "distanceEstimation": {
        "enabled": true,
        "model": "path-loss",
        "parameters": {
          "referenceRssi": -60,
          "pathLossExponent": 2.0
        }
      }
    }
  }
}
```

### Integration Configuration

```json
{
  "integrations": {
    "mqtt": {
      "enabled": false,
      "broker": "mqtt://localhost:1883",
      "username": "",
      "password": "",
      "topics": {
        "detection": "bpdevice/detection",
        "alert": "bpdevice/alert",
        "status": "bpdevice/status"
      }
    },
    "influxdb": {
      "enabled": false,
      "url": "http://localhost:8086",
      "token": "",
      "org": "bpdevice",
      "bucket": "detections"
    },
    "homeassistant": {
      "enabled": false,
      "url": "http://localhost:8123",
      "token": "",
      "deviceName": "BPDevice Sensor"
    }
  }
}
```

## Configuration Validation

The system validates configuration on startup. Invalid configurations will prevent the application from starting.

### Validation Rules

1. **Required Fields**
   - WiFi interface must exist
   - LoRa port must be accessible
   - Database path must be writable

2. **Value Ranges**
   - Signal strength: -100 to 0 dBm
   - Channels: 1-14 (2.4GHz), 36-165 (5GHz)
   - Intervals: > 0 milliseconds

3. **Dependencies**
   - If alerts enabled, LoRa must be configured
   - If webhooks enabled, valid URLs required
   - If authentication enabled, JWT secret required

## Runtime Configuration Changes

Some settings can be changed at runtime via the API:

```bash
# Update detection settings
curl -X PATCH http://localhost:3000/api/config/detection \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "wifi": {
      "channels": [1, 6, 11],
      "dwellTime": 500
    }
  }'

# Add to whitelist
curl -X POST http://localhost:3000/api/whitelist \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "macAddress": "AA:BB:CC:DD:EE:FF",
    "name": "New Device",
    "type": "permanent"
  }'

# Update alert rules
curl -X PUT http://localhost:3000/api/config/alerts/rules \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{
    "name": "Night Mode",
    "type": "proximity",
    "enabled": true,
    "conditions": {
      "signalStrength": -70
    }
  }]'
```

## Best Practices

1. **Security**
   - Always use strong JWT secrets
   - Enable HTTPS for API endpoints
   - Regularly rotate API keys
   - Use encrypted LoRa communication

2. **Performance**
   - Limit channels for faster scanning
   - Adjust detection intervals based on needs
   - Enable database cleanup for long-term operation
   - Use appropriate retention periods

3. **Reliability**
   - Enable health checks
   - Configure proper logging
   - Set up automated backups
   - Use systemd for process management

4. **Privacy**
   - Consider legal requirements for WiFi/Bluetooth monitoring
   - Implement data retention policies
   - Anonymize MAC addresses if required
   - Document your monitoring practices

## Environment-Specific Configurations

### Development
```json
{
  "NODE_ENV": "development",
  "LOG_LEVEL": "debug",
  "DATABASE_URL": "file:./data/dev.db",
  "API_PORT": 3001
}
```

### Testing
```json
{
  "NODE_ENV": "test",
  "LOG_LEVEL": "error",
  "DATABASE_URL": ":memory:",
  "MOCK_HARDWARE": true
}
```

### Production
```json
{
  "NODE_ENV": "production",
  "LOG_LEVEL": "info",
  "DATABASE_URL": "file:/var/lib/bpdevice/prod.db",
  "API_PORT": 3000
}
```