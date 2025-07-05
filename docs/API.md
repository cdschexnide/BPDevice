# API Documentation

The BPDevice system provides a RESTful API with WebSocket support for real-time updates.

## Base URL

```
http://localhost:3000/api
```

## Authentication

The API uses JWT (JSON Web Token) authentication. Include the token in the Authorization header:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

### Obtain a Token

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your-password"
}
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": "24h"
}
```

## Endpoints

### Devices

#### List All Devices

```http
GET /api/devices?page=1&limit=20&type=wifi&isWhitelisted=false
```

Query Parameters:
- `page` (number): Page number for pagination
- `limit` (number): Items per page (max: 100)
- `type` (string): Filter by device type ('wifi' | 'bluetooth')
- `isWhitelisted` (boolean): Filter by whitelist status
- `lastSeenAfter` (ISO 8601): Filter devices seen after this time
- `signalStrength` (number): Minimum signal strength

Response:
```json
{
  "data": [
    {
      "id": "clh3k4j0f0001qwer5d4h7f9s",
      "macAddress": "AA:BB:CC:DD:EE:FF",
      "type": "wifi",
      "manufacturer": "Apple Inc.",
      "firstSeen": "2024-01-15T10:30:00Z",
      "lastSeen": "2024-01-15T14:45:30Z",
      "isWhitelisted": false,
      "detectionCount": 42,
      "avgSignalStrength": -75
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

#### Get Device Details

```http
GET /api/devices/:id
```

Response:
```json
{
  "id": "clh3k4j0f0001qwer5d4h7f9s",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "type": "wifi",
  "manufacturer": "Apple Inc.",
  "firstSeen": "2024-01-15T10:30:00Z",
  "lastSeen": "2024-01-15T14:45:30Z",
  "isWhitelisted": false,
  "detections": [
    {
      "id": "clh3k5m1g0002qwer6e5i8g0t",
      "timestamp": "2024-01-15T14:45:30Z",
      "signalStrength": -72,
      "frequency": 2437,
      "channel": 6
    }
  ],
  "alerts": [
    {
      "id": "clh3k6n2h0003qwer7f6j9h1u",
      "timestamp": "2024-01-15T10:31:00Z",
      "type": "new_device",
      "triggered": true
    }
  ]
}
```

#### Delete Device

```http
DELETE /api/devices/:id
```

Response:
```json
{
  "message": "Device deleted successfully"
}
```

### Detections

#### Get Recent Detections

```http
GET /api/detections?limit=100&deviceId=clh3k4j0f0001qwer5d4h7f9s
```

Query Parameters:
- `limit` (number): Number of recent detections (max: 1000)
- `deviceId` (string): Filter by specific device
- `startTime` (ISO 8601): Start time for time range
- `endTime` (ISO 8601): End time for time range
- `minSignalStrength` (number): Minimum signal strength

Response:
```json
{
  "data": [
    {
      "id": "clh3k5m1g0002qwer6e5i8g0t",
      "deviceId": "clh3k4j0f0001qwer5d4h7f9s",
      "device": {
        "macAddress": "AA:BB:CC:DD:EE:FF",
        "type": "wifi",
        "manufacturer": "Apple Inc."
      },
      "timestamp": "2024-01-15T14:45:30Z",
      "signalStrength": -72,
      "frequency": 2437,
      "channel": 6,
      "metadata": {
        "ssid": "hidden",
        "capabilities": ["WPA2", "WPS"]
      }
    }
  ]
}
```

#### Get Detection Statistics

```http
GET /api/detections/stats?period=hour&groupBy=type
```

Query Parameters:
- `period` (string): Time period ('hour' | 'day' | 'week' | 'month')
- `groupBy` (string): Group results by ('type' | 'manufacturer' | 'hour')

Response:
```json
{
  "period": "hour",
  "groupBy": "type",
  "stats": [
    {
      "group": "wifi",
      "count": 156,
      "uniqueDevices": 23,
      "avgSignalStrength": -76.5
    },
    {
      "group": "bluetooth",
      "count": 89,
      "uniqueDevices": 15,
      "avgSignalStrength": -82.3
    }
  ]
}
```

### Alerts

#### List Alerts

```http
GET /api/alerts?triggered=true&type=new_device&limit=50
```

Query Parameters:
- `triggered` (boolean): Filter by trigger status
- `type` (string): Alert type filter
- `deviceId` (string): Filter by device
- `startTime` (ISO 8601): Start time for time range
- `limit` (number): Number of alerts (max: 100)

Response:
```json
{
  "data": [
    {
      "id": "clh3k6n2h0003qwer7f6j9h1u",
      "timestamp": "2024-01-15T10:31:00Z",
      "type": "new_device",
      "triggered": true,
      "device": {
        "id": "clh3k4j0f0001qwer5d4h7f9s",
        "macAddress": "AA:BB:CC:DD:EE:FF",
        "manufacturer": "Apple Inc."
      },
      "metadata": {
        "signalStrength": -68,
        "detectionCount": 3,
        "location": "Front Gate"
      }
    }
  ]
}
```

#### Acknowledge Alert

```http
PUT /api/alerts/:id/acknowledge
```

Response:
```json
{
  "id": "clh3k6n2h0003qwer7f6j9h1u",
  "acknowledged": true,
  "acknowledgedAt": "2024-01-15T10:35:00Z"
}
```

### Whitelist

#### Get Whitelist

```http
GET /api/whitelist
```

Response:
```json
{
  "devices": [
    {
      "id": "clh3k7o3i0004qwer8g7k0i2v",
      "macAddress": "AA:BB:CC:DD:EE:FF",
      "name": "Owner's iPhone",
      "addedAt": "2024-01-10T08:00:00Z"
    }
  ]
}
```

#### Add to Whitelist

```http
POST /api/whitelist
Content-Type: application/json

{
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "name": "Friend's Phone",
  "type": "permanent"
}
```

Response:
```json
{
  "id": "clh3k8p4j0005qwer9h8l1j3w",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "name": "Friend's Phone",
  "type": "permanent",
  "addedAt": "2024-01-15T15:00:00Z"
}
```

#### Remove from Whitelist

```http
DELETE /api/whitelist/:macAddress
```

### Configuration

#### Get Current Configuration

```http
GET /api/config
```

Response:
```json
{
  "detection": {
    "wifi": {
      "enabled": true,
      "interface": "wlan1",
      "channels": [1, 6, 11],
      "dwellTime": 250
    },
    "bluetooth": {
      "enabled": true,
      "scanInterval": 10000,
      "scanWindow": 5000
    }
  },
  "alerts": {
    "enabled": true,
    "cooldownMinutes": 5,
    "minSignalStrength": -80
  }
}
```

#### Update Configuration

```http
PATCH /api/config
Content-Type: application/json

{
  "detection": {
    "wifi": {
      "channels": [1, 6, 11, 36, 40, 44]
    }
  }
}
```

### System

#### Health Check

```http
GET /api/health
```

Response:
```json
{
  "status": "healthy",
  "uptime": 86400,
  "components": {
    "wifi": {
      "status": "operational",
      "interface": "wlan1",
      "packetsReceived": 15234
    },
    "bluetooth": {
      "status": "operational",
      "interfaces": ["hci0", "hci1"],
      "devicesScanned": 234
    },
    "database": {
      "status": "operational",
      "size": "45.2 MB",
      "deviceCount": 156
    },
    "lora": {
      "status": "operational",
      "connected": true,
      "lastTransmission": "2024-01-15T14:30:00Z"
    }
  }
}
```

#### System Statistics

```http
GET /api/stats/system
```

Response:
```json
{
  "cpu": {
    "usage": 23.5,
    "temperature": 45.2
  },
  "memory": {
    "total": 4096,
    "used": 1234,
    "free": 2862,
    "percentage": 30.1
  },
  "disk": {
    "total": 32768,
    "used": 5432,
    "free": 27336,
    "percentage": 16.6
  },
  "network": {
    "rx": 123456789,
    "tx": 98765432,
    "rxRate": 1234.5,
    "txRate": 876.5
  }
}
```

## WebSocket API

Connect to the WebSocket endpoint for real-time updates:

```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'YOUR_JWT_TOKEN'
  }
});
```

### Events

#### Device Detection

```javascript
socket.on('device:detected', (data) => {
  console.log('New device detected:', data);
  // {
  //   device: { id, macAddress, type, signalStrength },
  //   timestamp: '2024-01-15T14:45:30Z'
  // }
});
```

#### Alert Triggered

```javascript
socket.on('alert:triggered', (data) => {
  console.log('Alert triggered:', data);
  // {
  //   alert: { id, type, deviceId },
  //   device: { macAddress, manufacturer },
  //   timestamp: '2024-01-15T14:45:30Z'
  // }
});
```

#### System Status

```javascript
socket.on('system:status', (data) => {
  console.log('System status update:', data);
  // {
  //   wifi: { status, packetsPerSecond },
  //   bluetooth: { status, devicesInRange },
  //   alerts: { pending, triggered }
  // }
});
```

### Subscriptions

Subscribe to specific device updates:

```javascript
socket.emit('subscribe:device', { deviceId: 'clh3k4j0f0001qwer5d4h7f9s' });

socket.on('device:update', (data) => {
  console.log('Device update:', data);
});
```

## Error Responses

All errors follow a consistent format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid MAC address format",
    "details": {
      "field": "macAddress",
      "value": "invalid-mac"
    }
  }
}
```

Common error codes:
- `AUTHENTICATION_ERROR`: Invalid or missing token
- `AUTHORIZATION_ERROR`: Insufficient permissions
- `VALIDATION_ERROR`: Invalid request data
- `NOT_FOUND`: Resource not found
- `RATE_LIMIT`: Too many requests
- `INTERNAL_ERROR`: Server error

## Rate Limiting

The API implements rate limiting:
- Default: 100 requests per 15 minutes
- Authenticated users: 1000 requests per 15 minutes
- WebSocket connections: 10 per IP address

Headers included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642334567
```

## SDK Examples

### JavaScript/TypeScript

```typescript
import { BPDeviceClient } from '@bpdevice/sdk';

const client = new BPDeviceClient({
  baseUrl: 'http://localhost:3000',
  token: 'YOUR_JWT_TOKEN'
});

// Get devices
const devices = await client.devices.list({
  type: 'wifi',
  isWhitelisted: false
});

// Subscribe to real-time updates
client.on('device:detected', (device) => {
  console.log('New device:', device);
});

client.connect();
```

### Python

```python
from bpdevice import BPDeviceClient

client = BPDeviceClient(
    base_url='http://localhost:3000',
    token='YOUR_JWT_TOKEN'
)

# Get recent detections
detections = client.detections.list(limit=100)

# Add to whitelist
client.whitelist.add(
    mac_address='AA:BB:CC:DD:EE:FF',
    name='My Device'
)
```

### cURL Examples

```bash
# Get all devices
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/devices

# Add to whitelist
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"macAddress":"AA:BB:CC:DD:EE:FF","name":"Test Device"}' \
  http://localhost:3000/api/whitelist

# Get system health
curl http://localhost:3000/api/health
```

## Webhooks

Configure webhooks to receive alerts:

```json
{
  "url": "https://your-server.com/webhook",
  "events": ["device.new", "alert.triggered"],
  "secret": "your-webhook-secret"
}
```

Webhook payload includes HMAC signature in header:
```
X-BPDevice-Signature: sha256=abcd1234...
```

Verify webhook signature:
```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return digest === signature;
}
```