#!/bin/bash

echo "=== BPDevice Deployment Script ==="
echo

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found. Please create it from .env.example"
    exit 1
fi

# Build TypeScript
echo "Building application..."
npm run build

if [ $? -ne 0 ]; then
    echo "Error: Build failed"
    exit 1
fi

# Run database migrations
echo "Running database migrations..."
npm run db:migrate

if [ $? -ne 0 ]; then
    echo "Error: Database migration failed"
    exit 1
fi

# Stop existing PM2 process if running
echo "Stopping existing application..."
pm2 stop bpdevice 2>/dev/null || true
pm2 delete bpdevice 2>/dev/null || true

# Start with PM2
echo "Starting application with PM2..."
pm2 start ecosystem.config.js

if [ $? -ne 0 ]; then
    echo "Error: Failed to start application"
    exit 1
fi

# Save PM2 configuration
pm2 save

# Setup PM2 startup if not already configured
pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || true

echo
echo "=== Deployment Complete ==="
echo
echo "Application status:"
pm2 status
echo
echo "View logs with: pm2 logs bpdevice"
echo "Monitor with: pm2 monit"
echo