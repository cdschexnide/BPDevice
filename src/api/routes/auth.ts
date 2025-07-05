import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createModuleLogger } from '@/utils/logger';
import { AuthToken } from '@/types';

const logger = createModuleLogger('AuthAPI');

export function createAuthRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({ 
          error: { 
            code: 'VALIDATION_ERROR', 
            message: 'Username and password are required' 
          } 
        });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { username },
      });

      if (!user || !await bcrypt.compare(password, user.passwordHash)) {
        res.status(401).json({ 
          error: { 
            code: 'AUTHENTICATION_ERROR', 
            message: 'Invalid username or password' 
          } 
        });
        return;
      }

      const tokenString = jwt.sign(
        { userId: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET || 'default-secret',
        { expiresIn: '24h' }
      );

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await prisma.token.create({
        data: {
          token: tokenString,
          userId: user.id,
          expiresAt,
        },
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
      });

      const response: AuthToken = {
        token: tokenString,
        expiresIn: '24h',
        userId: user.id,
      };

      logger.info('User logged in', { username, userId: user.id });
      res.json(response);
    } catch (error) {
      logger.error('Login failed', error);
      res.status(500).json({ 
        error: { 
          code: 'INTERNAL_ERROR', 
          message: 'Login failed' 
        } 
      });
    }
  });

  router.post('/logout', async (req, res) => {
    try {
      const token = req.headers.authorization?.substring(7);

      if (token) {
        await prisma.token.delete({
          where: { token },
        }).catch(() => {});
      }

      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      logger.error('Logout failed', error);
      res.status(500).json({ 
        error: { 
          code: 'INTERNAL_ERROR', 
          message: 'Logout failed' 
        } 
      });
    }
  });

  router.post('/register', async (req, res) => {
    try {
      const { username, password, role = 'viewer' } = req.body;

      if (!username || !password) {
        res.status(400).json({ 
          error: { 
            code: 'VALIDATION_ERROR', 
            message: 'Username and password are required' 
          } 
        });
        return;
      }

      if (password.length < 8) {
        res.status(400).json({ 
          error: { 
            code: 'VALIDATION_ERROR', 
            message: 'Password must be at least 8 characters long' 
          } 
        });
        return;
      }

      const existingUser = await prisma.user.findUnique({
        where: { username },
      });

      if (existingUser) {
        res.status(400).json({ 
          error: { 
            code: 'VALIDATION_ERROR', 
            message: 'Username already exists' 
          } 
        });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          username,
          passwordHash,
          role,
        },
      });

      logger.info('User registered', { username, userId: user.id });
      res.status(201).json({ 
        message: 'User created successfully',
        userId: user.id 
      });
    } catch (error) {
      logger.error('Registration failed', error);
      res.status(500).json({ 
        error: { 
          code: 'INTERNAL_ERROR', 
          message: 'Registration failed' 
        } 
      });
    }
  });

  return router;
}