# Hardware Setup Guide

This guide covers the complete hardware setup for the Bluetooth & WiFi Passive Detection System.

## Hardware Components Overview

### 1. Raspberry Pi 4 (4GB)
- **Purpose**: Main processing unit
- **Requirements**: 
  - Raspberry Pi OS Lite (64-bit recommended)
  - Minimum 4GB RAM for concurrent monitoring
  - All 4 USB ports will be utilized

### 2. Dual-band WiFi Adapter (AWUS036ACS)
- **Purpose**: Passive WiFi monitoring in monitor mode
- **Key Features**:
  - Supports 2.4GHz and 5GHz bands
  - Monitor mode capability
  - External antenna for better range
  - Realtek RTL8811AU chipset

### 3. Bluetooth 5.0 USB Dongle
- **Purpose**: Extended Bluetooth detection range
- **Features**:
  - Bluetooth 5.0 support
  - Low Energy (BLE) scanning
  - Classic Bluetooth detection
  - Works alongside Pi's built-in Bluetooth

### 4. LoRa Module (TTGO ESP32 915MHz)
- **Purpose**: Long-range communication to trigger game cameras
- **Specifications**:
  - 915MHz frequency (US band)
  - ESP32 based with built-in OLED display
  - Range: up to 10km line of sight
  - Low power consumption

### 5. Real-Time Clock Module (DS3231)
- **Purpose**: Maintain accurate time when offline
- **Features**:
  - I2C interface
  - Battery backup (CR2032)
  - Temperature compensated
  - High accuracy (±2ppm)

## Physical Connections

### GPIO Pin Assignments

```
RTC Module (I2C):
- SDA → GPIO 2 (Pin 3)
- SCL → GPIO 3 (Pin 5)
- VCC → 3.3V (Pin 1)
- GND → Ground (Pin 6)

LoRa Module (UART):
- TX → GPIO 14 (Pin 8)
- RX → GPIO 15 (Pin 10)
- VCC → 5V (Pin 2)
- GND → Ground (Pin 9)
```

### USB Connections
1. **USB 3.0 Port 1**: WiFi Adapter (AWUS036ACS)
2. **USB 3.0 Port 2**: Bluetooth 5.0 Dongle
3. **USB 2.0 Port 1**: Reserved for keyboard during setup
4. **USB 2.0 Port 2**: Reserved for future expansion

## Initial Hardware Setup

### Step 1: Prepare the Raspberry Pi
```bash
# Flash Raspberry Pi OS Lite to microSD
# Use Raspberry Pi Imager: https://www.raspberrypi.com/software/

# Enable SSH and WiFi during imaging
# Or create these files in boot partition:
# - ssh (empty file)
# - wpa_supplicant.conf (with your WiFi credentials)
```

### Step 2: Connect RTC Module
1. Power off the Raspberry Pi
2. Connect RTC module to GPIO pins as specified above
3. Insert CR2032 battery into RTC module
4. Power on Raspberry Pi

### Step 3: Configure RTC
```bash
# Enable I2C
sudo raspi-config
# Navigate to: Interface Options → I2C → Enable

# Install RTC tools
sudo apt-get update
sudo apt-get install -y i2c-tools

# Verify RTC detection (should show 68)
sudo i2cdetect -y 1

# Configure RTC
echo "dtoverlay=i2c-rtc,ds3231" | sudo tee -a /boot/config.txt
sudo reboot

# After reboot, remove fake-hwclock
sudo apt-get -y remove fake-hwclock
sudo update-rc.d -f fake-hwclock remove

# Set system time from RTC
sudo hwclock -r
```

### Step 4: Install WiFi Adapter Drivers
```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install required packages
sudo apt-get install -y dkms git build-essential bc

# Clone and install RTL8811AU drivers
git clone https://github.com/aircrack-ng/rtl8812au.git
cd rtl8812au
sudo make dkms_install

# Verify adapter is recognized
iwconfig

# Enable monitor mode
sudo ip link set wlan1 down
sudo iw wlan1 set monitor control
sudo ip link set wlan1 up
```

### Step 5: Configure Bluetooth
```bash
# Install Bluetooth tools
sudo apt-get install -y bluetooth bluez libbluetooth-dev

# Disable built-in Bluetooth for dedicated dongle use (optional)
echo "dtoverlay=disable-bt" | sudo tee -a /boot/config.txt

# Or keep both active for extended range
# Built-in: Close range detection
# USB Dongle: Extended range detection

# Verify Bluetooth interfaces
hciconfig -a
```

### Step 6: Connect LoRa Module
1. Connect LoRa module via UART pins
2. The ESP32 module can be programmed separately
3. Default communication will be via serial at 115200 baud

## Power Considerations

### Power Requirements
- Raspberry Pi 4: ~3A at 5V under load
- WiFi Adapter: ~500mA
- Bluetooth Dongle: ~100mA
- LoRa Module: ~150mA
- **Total**: Use 5V 3A minimum power supply

### Outdoor Deployment
For outdoor deployment, consider:
1. Weatherproof enclosure
2. Power over Ethernet (PoE) HAT
3. Solar panel with battery backup
4. Cooling solution for hot climates

## Testing Hardware

### WiFi Adapter Test
```bash
# Scan for networks (normal mode)
sudo iwlist wlan1 scan

# Monitor mode test
sudo tcpdump -i wlan1 -n

# Check for packet reception
# You should see 802.11 frames
```

### Bluetooth Test
```bash
# Scan for devices
sudo hcitool scan

# BLE scan
sudo hcitool lescan

# Check both interfaces if using two
sudo hcitool -i hci0 scan
sudo hcitool -i hci1 scan
```

### LoRa Module Test
```bash
# Test serial connection
screen /dev/ttyAMA0 115200

# Send AT commands to verify
# AT+VER (should return version)
```

### RTC Test
```bash
# Read time from RTC
sudo hwclock -r

# Set RTC from system time
sudo hwclock -w

# Verify persistence (remove power, wait, reconnect)
sudo hwclock -r
```

## Troubleshooting

### WiFi Adapter Not Detected
- Check USB connection
- Verify drivers installed: `lsmod | grep 8812au`
- Try different USB port
- Check power supply adequacy

### Bluetooth Issues
- Ensure no Bluetooth service conflicts
- Check permissions: `sudo usermod -a -G bluetooth pi`
- Reset Bluetooth: `sudo systemctl restart bluetooth`

### I2C/RTC Not Working
- Verify I2C enabled: `lsmod | grep i2c`
- Check connections with multimeter
- Verify pull-up resistors (usually on module)

### LoRa Communication Failed
- Check UART enabled: `ls /dev/tty*`
- Verify baud rate settings
- Check 3.3V/5V logic levels
- Test with simple echo program

## Next Steps

Once hardware is set up and tested:
1. Proceed to [Software Architecture](ARCHITECTURE.md)
2. Follow the [Implementation Guide](IMPLEMENTATION.md)
3. Configure the system using [Configuration Reference](CONFIGURATION.md)