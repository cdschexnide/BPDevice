import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { PaginationParams, PaginatedResponse } from '@/types';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('DevicesAPI');

export function createDevicesRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get('/', authenticate, async (req: AuthRequest, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const type = req.query.type as string;
      const isWhitelisted = req.query.isWhitelisted === 'true' ? true : 
                           req.query.isWhitelisted === 'false' ? false : undefined;
      const lastSeenAfter = req.query.lastSeenAfter ? new Date(req.query.lastSeenAfter as string) : undefined;
      const minSignalStrength = req.query.signalStrength ? parseInt(req.query.signalStrength as string) : undefined;

      const where: any = {};
      if (type) where.type = type;
      if (isWhitelisted !== undefined) where.isWhitelisted = isWhitelisted;
      if (lastSeenAfter) where.lastSeen = { gte: lastSeenAfter };

      const [devices, total] = await Promise.all([
        prisma.device.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { lastSeen: 'desc' },
          include: {
            _count: {
              select: { detections: true },
            },
          },
        }),
        prisma.device.count({ where }),
      ]);

      const devicesWithStats = await Promise.all(
        devices.map(async (device) => {
          const avgSignal = await prisma.detection.aggregate({
            where: { deviceId: device.id },
            _avg: { signalStrength: true },
          });

          return {
            ...device,
            detectionCount: device._count.detections,
            avgSignalStrength: Math.round(avgSignal._avg.signalStrength || -100),
          };
        })
      );

      const response: PaginatedResponse<any> = {
        data: devicesWithStats,
        meta: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };

      res.json(response);
    } catch (error) {
      logger.error('Failed to list devices', error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list devices' } });
    }
  });

  router.get('/:id', authenticate, async (req: AuthRequest, res) => {
    try {
      const device = await prisma.device.findUnique({
        where: { id: req.params.id },
        include: {
          detections: {
            take: 10,
            orderBy: { timestamp: 'desc' },
          },
          alerts: {
            take: 10,
            orderBy: { timestamp: 'desc' },
          },
        },
      });

      if (!device) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Device not found' } });
        return;
      }

      res.json(device);
    } catch (error) {
      logger.error('Failed to get device', error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get device' } });
    }
  });

  router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
    try {
      await prisma.device.delete({
        where: { id: req.params.id },
      });

      res.json({ message: 'Device deleted successfully' });
    } catch (error) {
      logger.error('Failed to delete device', error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete device' } });
    }
  });

  return router;
}