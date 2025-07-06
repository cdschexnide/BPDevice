import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('AuthMiddleware');
const prisma = new PrismaClient();

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
  };
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractToken(req);

    if (!token) {
      res.status(401).json({ error: { code: 'AUTHENTICATION_ERROR', message: 'No token provided' } });
      return;
    }

    jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;

    const dbToken = await prisma.token.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!dbToken || dbToken.expiresAt < new Date()) {
      res.status(401).json({ error: { code: 'AUTHENTICATION_ERROR', message: 'Invalid or expired token' } });
      return;
    }

    req.user = {
      id: dbToken.user.id,
      username: dbToken.user.username,
      role: dbToken.user.role,
    };

    next();
  } catch (error) {
    logger.error('Authentication error', error);
    res.status(401).json({ error: { code: 'AUTHENTICATION_ERROR', message: 'Invalid token' } });
  }
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: { code: 'AUTHENTICATION_ERROR', message: 'Not authenticated' } });
      return;
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      res.status(403).json({ error: { code: 'AUTHORIZATION_ERROR', message: 'Insufficient permissions' } });
      return;
    }

    next();
  };
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return req.query.token as string || null;
}