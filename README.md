# Bluetooth & WiFi Passive Detection System

A TypeScript-based passive detection system for Raspberry Pi that monitors Bluetooth and WiFi signals to detect nearby devices and trigger game cameras.

## Overview

This system runs on a Raspberry Pi 4 and uses passive detection techniques to identify mobile devices through their Bluetooth and WiFi emissions. When unauthorized devices are detected, it can trigger external systems (like game cameras) via LoRa communication.

## Hardware Requirements

- **Raspberry Pi 4 (4GB)**
- **Dual-band WiFi USB Adapter** (AWUS036ACS) - supports monitor mode
- **Bluetooth 5.0 USB Dongle** - for extended Bluetooth detection
- **LoRa Module** (TTGO ESP32) - for long-range trigger signals
- **Real-Time Clock Module** (DS3231) - for accurate timestamps when offline
- **32GB microSD Card**
- **5V 3A Power Supply**

## Features

- Concurrent WiFi and Bluetooth monitoring
- MAC address randomization detection
- Signal strength-based proximity estimation
- Device whitelisting for authorized devices
- Time-based detection profiles
- Low power consumption mode
- Offline operation with RTC
- LoRa-based trigger system for game cameras
- Web-based monitoring dashboard

## Tech Stack

- **Runtime**: Node.js 18+ with TypeScript
- **Database**: SQLite with Prisma ORM
- **WiFi Monitoring**: pcap libraries with TypeScript bindings
- **Bluetooth**: noble/bleno libraries
- **Web Interface**: Express + React
- **Process Management**: PM2
- **Testing**: Jest + Supertest

## Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/BPDevice.git
cd BPDevice

# Install dependencies
npm install

# Set up the database
npm run db:setup

# Configure your settings
cp .env.example .env
# Edit .env with your configuration

# Build the TypeScript code
npm run build

# Run the application
npm start
```

## Documentation

- [Hardware Setup Guide](docs/HARDWARE_SETUP.md)
- [Software Architecture](docs/ARCHITECTURE.md)
- [Implementation Guide](docs/IMPLEMENTATION.md)
- [Configuration Reference](docs/CONFIGURATION.md)
- [API Documentation](docs/API.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## Project Structure

```
BPDevice/
├── src/
│   ├── detection/      # Detection modules
│   ├── alerts/         # Alert and trigger systems
│   ├── config/         # Configuration management
│   ├── database/       # Database models and migrations
│   ├── api/           # REST API endpoints
│   ├── utils/         # Utility functions
│   └── index.ts       # Main application entry
├── web/               # Web dashboard (React)
├── tests/             # Test suites
├── scripts/           # Setup and maintenance scripts
└── docs/              # Documentation
```

## License

MIT License - See [LICENSE](LICENSE) file for details