import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { logger } from '../src/utils/logger';

const prisma = new PrismaClient();

async function main() {
  logger.info('Starting database seed...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: adminPassword,
      role: 'admin',
    },
  });
  logger.info('Admin user created/updated', { userId: admin.id });

  // Create viewer user
  const viewerPassword = await bcrypt.hash('viewer123', 10);
  const viewer = await prisma.user.upsert({
    where: { username: 'viewer' },
    update: {},
    create: {
      username: 'viewer',
      passwordHash: viewerPassword,
      role: 'viewer',
    },
  });
  logger.info('Viewer user created/updated', { userId: viewer.id });

  // Add some whitelisted devices (examples)
  const whitelistDevices = [
    { macAddress: 'AA:BB:CC:DD:EE:FF', name: 'Owner iPhone', type: 'permanent' },
    { macAddress: '11:22:33:44:55:66', name: 'Family Android', type: 'permanent' },
    { macAddress: '99:88:77:66:55:44', name: 'Work Laptop', type: 'permanent' },
  ];

  for (const device of whitelistDevices) {
    await prisma.whitelist.upsert({
      where: { macAddress: device.macAddress },
      update: {},
      create: device,
    });
    logger.info('Whitelisted device added', { mac: device.macAddress, name: device.name });
  }

  // Create default configuration
  const defaultConfigs = [
    { key: 'system.name', value: JSON.stringify('BPDevice-01') },
    { key: 'system.location', value: JSON.stringify('Front Gate') },
    { key: 'alerts.webhook.url', value: JSON.stringify('') },
  ];

  for (const config of defaultConfigs) {
    await prisma.config.upsert({
      where: { key: config.key },
      update: { value: config.value },
      create: config,
    });
  }

  logger.info('Database seed completed successfully');
}

main()
  .catch((e) => {
    logger.error('Database seed failed', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });