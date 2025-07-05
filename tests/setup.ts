import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

beforeAll(async () => {
  // Setup test database
  await prisma.$connect();
});

afterAll(async () => {
  // Cleanup and disconnect
  await prisma.$disconnect();
});

// Mock noble for tests
jest.mock('@abandonware/noble', () => ({
  on: jest.fn(),
  startScanning: jest.fn(),
  stopScanning: jest.fn(),
}));

// Mock pcap for tests
jest.mock('pcap', () => ({
  createSession: jest.fn(() => ({
    on: jest.fn(),
    close: jest.fn(),
  })),
  decode: {
    packet: jest.fn(),
  },
}));

// Mock serialport for tests
jest.mock('serialport', () => ({
  SerialPort: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    write: jest.fn((data, callback) => callback()),
    close: jest.fn((callback) => callback()),
    pipe: jest.fn(() => ({
      on: jest.fn(),
    })),
  })),
}));

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.JWT_SECRET = 'test-secret';