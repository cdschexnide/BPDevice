import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { DetectionManager } from '@/detection/DetectionManager';
import { AlertManager } from '@/alerts/AlertManager';
import { createAuthRouter } from './routes/auth';
import { createDevicesRouter } from './routes/devices';
import { authenticate } from './middleware/auth';
import { createModuleLogger } from '@/utils/logger';
import { systemMonitor } from '@/utils/systemMonitor';

const logger = createModuleLogger('APIServer');

export function createApiServer(
  prisma: PrismaClient,
  detectionManager: DetectionManager,
  alertManager: AlertManager
): any {
  const app = express();
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
      credentials: true,
    },
  });

  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
    credentials: true,
  }));
  app.use(express.json());

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/', limiter);

  app.use('/api/auth', createAuthRouter(prisma));
  app.use('/api/devices', createDevicesRouter(prisma));

  app.get('/api/health', async (_req, res) => {
    try {
      const [uptime, wifiActive, bluetoothActive, loraStatus] = await Promise.all([
        systemMonitor.getUptime(),
        detectionManager['wifiDetector'].isActive(),
        detectionManager['bluetoothDetector'].isActive(),
        alertManager['loraTransmitter'].getStatus(),
      ]);

      const dbSize = await prisma.device.count();

      res.json({
        status: 'healthy',
        uptime,
        components: {
          wifi: {
            status: wifiActive ? 'operational' : 'error',
            interface: detectionManager['wifiDetector'].getInterface(),
            packetsReceived: 0,
          },
          bluetooth: {
            status: bluetoothActive ? 'operational' : 'error',
            interfaces: ['hci0'],
            devicesScanned: detectionManager['bluetoothDetector'].getDetectedDevices().length,
          },
          database: {
            status: 'operational',
            size: `${dbSize} devices`,
            deviceCount: dbSize,
          },
          lora: {
            status: loraStatus.connected ? 'operational' : 'error',
            connected: loraStatus.connected,
            lastTransmission: new Date().toISOString(),
          },
        },
      });
    } catch (error) {
      logger.error('Health check failed', error);
      res.status(503).json({ status: 'error', message: 'Health check failed' });
    }
  });

  app.get('/api/stats/system', authenticate, async (_req, res) => {
    try {
      const stats = await systemMonitor.getSystemStats();
      res.json(stats);
    } catch (error) {
      logger.error('Failed to get system stats', error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get system stats' } });
    }
  });

  app.get('/api/whitelist', authenticate, async (_req, res) => {
    try {
      const devices = await prisma.whitelist.findMany({
        orderBy: { addedAt: 'desc' },
      });
      res.json({ devices });
    } catch (error) {
      logger.error('Failed to get whitelist', error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get whitelist' } });
    }
  });

  app.post('/api/whitelist', authenticate, async (req, res) => {
    try {
      const { macAddress, name, type = 'permanent' } = req.body;

      if (!macAddress) {
        res.status(400).json({ 
          error: { 
            code: 'VALIDATION_ERROR', 
            message: 'MAC address is required' 
          } 
        });
        return;
      }

      const whitelist = await prisma.whitelist.create({
        data: {
          macAddress: macAddress.toUpperCase(),
          name,
          type,
          addedBy: (req as any).user?.username,
        },
      });

      await prisma.device.updateMany({
        where: { macAddress: macAddress.toUpperCase() },
        data: { isWhitelisted: true },
      });

      res.status(201).json(whitelist);
    } catch (error) {
      logger.error('Failed to add to whitelist', error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to add to whitelist' } });
    }
  });

  app.delete('/api/whitelist/:macAddress', authenticate, async (req, res) => {
    try {
      const macAddress = req.params.macAddress.toUpperCase();

      await prisma.whitelist.delete({
        where: { macAddress },
      });

      await prisma.device.updateMany({
        where: { macAddress },
        data: { isWhitelisted: false },
      });

      res.json({ message: 'Removed from whitelist' });
    } catch (error) {
      logger.error('Failed to remove from whitelist', error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to remove from whitelist' } });
    }
  });

  app.get('/api/alerts', authenticate, async (_req, res) => {
    try {
      const alerts = await alertManager.getActiveAlerts();
      res.json({ data: alerts });
    } catch (error) {
      logger.error('Failed to get alerts', error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get alerts' } });
    }
  });

  app.put('/api/alerts/:id/acknowledge', authenticate, async (req, res) => {
    try {
      const alert = await alertManager.acknowledgeAlert(req.params.id);
      if (!alert) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Alert not found' } });
        return;
      }
      res.json(alert);
    } catch (error) {
      logger.error('Failed to acknowledge alert', error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to acknowledge alert' } });
    }
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('No token provided'));
      }

      const dbToken = await prisma.token.findUnique({
        where: { token },
        include: { user: true },
      });

      if (!dbToken || dbToken.expiresAt < new Date()) {
        return next(new Error('Invalid or expired token'));
      }

      socket.data.user = dbToken.user;
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    logger.info('WebSocket client connected', { userId: socket.data.user.id });

    socket.on('subscribe:device', ({ deviceId }) => {
      socket.join(`device:${deviceId}`);
    });

    socket.on('unsubscribe:device', ({ deviceId }) => {
      socket.leave(`device:${deviceId}`);
    });

    socket.on('disconnect', () => {
      logger.info('WebSocket client disconnected', { userId: socket.data.user.id });
    });
  });

  detectionManager.on('device-detected', ({ device, detection }) => {
    io.emit('device:detected', {
      device: {
        id: device.id,
        macAddress: device.macAddress,
        type: device.type,
        signalStrength: detection.signalStrength,
      },
      timestamp: detection.timestamp,
    });

    io.to(`device:${device.id}`).emit('device:update', {
      device,
      detection,
    });
  });

  alertManager.on('alert-triggered', ({ alert, device }) => {
    io.emit('alert:triggered', {
      alert: {
        id: alert.id,
        type: alert.type,
        deviceId: alert.deviceId,
      },
      device: {
        macAddress: device.macAddress,
        manufacturer: device.manufacturer,
      },
      timestamp: alert.timestamp,
    });
  });

  setInterval(async () => {
    try {
      const stats = await detectionManager.getDeviceStats();
      io.emit('system:status', {
        wifi: {
          status: detectionManager['wifiDetector'].isActive() ? 'operational' : 'error',
          packetsPerSecond: 0,
        },
        bluetooth: {
          status: detectionManager['bluetoothDetector'].isActive() ? 'operational' : 'error',
          devicesInRange: detectionManager['bluetoothDetector'].getDetectedDevices().length,
        },
        alerts: {
          pending: alertManager.getQueueSize(),
          triggered: await prisma.alert.count({ where: { triggered: true, acknowledged: false } }),
        },
        devices: stats,
      });
    } catch (error) {
      logger.error('Failed to send system status', error);
    }
  }, 5000);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
  });

  return httpServer;
}