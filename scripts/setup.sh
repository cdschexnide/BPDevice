#!/bin/bash

echo "=== BPDevice Setup Script ==="
echo

# Check if running on Raspberry Pi
if ! grep -q "Raspberry Pi" /proc/device-tree/model 2>/dev/null; then
    echo "Warning: This script is designed for Raspberry Pi"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Update system
echo "Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install system dependencies
echo "Installing system dependencies..."
sudo apt-get install -y \
    build-essential \
    python3 \
    git \
    libpcap-dev \
    bluetooth \
    bluez \
    libbluetooth-dev \
    libudev-dev \
    i2c-tools \
    dkms \
    bc

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Enable I2C for RTC
echo "Enabling I2C interface..."
sudo raspi-config nonint do_i2c 0

# Configure RTC
echo "Configuring RTC module..."
echo "dtoverlay=i2c-rtc,ds3231" | sudo tee -a /boot/config.txt

# Install WiFi adapter drivers
echo "Installing WiFi adapter drivers..."
cd /tmp
git clone https://github.com/aircrack-ng/rtl8812au.git
cd rtl8812au
sudo make dkms_install

# Create required directories
echo "Creating application directories..."
mkdir -p ~/BPDevice/{logs,data,config}

# Clone or update repository
cd ~
if [ -d "BPDevice/.git" ]; then
    echo "Updating BPDevice repository..."
    cd BPDevice
    git pull
else
    echo "Cloning BPDevice repository..."
    git clone https://github.com/yourusername/BPDevice.git
    cd BPDevice
fi

# Install npm dependencies
echo "Installing npm dependencies..."
npm install

# Copy and configure environment file
if [ ! -f .env ]; then
    echo "Creating environment configuration..."
    cp .env.example .env
    echo "Please edit .env file to configure your settings"
fi

# Setup database
echo "Setting up database..."
npm run db:generate
npm run db:migrate

# Build TypeScript
echo "Building application..."
npm run build

# Install PM2 globally
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
fi

# Create systemd service
echo "Creating systemd service..."
sudo tee /etc/systemd/system/bpdevice.service > /dev/null << EOF
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
Environment=PATH=/usr/bin:/usr/local/bin

[Install]
WantedBy=multi-user.target
EOF

# Set permissions
echo "Setting permissions..."
sudo usermod -a -G bluetooth $USER
sudo chmod 666 /dev/ttyAMA0 2>/dev/null || true

# Enable service
echo "Enabling BPDevice service..."
sudo systemctl daemon-reload
sudo systemctl enable bpdevice.service

echo
echo "=== Setup Complete ==="
echo
echo "Next steps:"
echo "1. Edit the .env file with your configuration"
echo "2. Reboot your Raspberry Pi: sudo reboot"
echo "3. After reboot, start the service: sudo systemctl start bpdevice"
echo "4. Check service status: sudo systemctl status bpdevice"
echo "5. View logs: pm2 logs bpdevice"
echo
echo "Default web interface credentials:"
echo "Username: admin"
echo "Password: changeme"
echo