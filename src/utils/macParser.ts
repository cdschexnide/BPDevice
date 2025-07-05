import { readFileSync } from 'fs';
import path from 'path';

interface MacVendor {
  prefix: string;
  vendor: string;
}

let vendorDatabase: MacVendor[] = [];

export function parseMacAddress(mac: string): string {
  const cleaned = mac.replace(/[^0-9A-Fa-f]/g, '');
  
  if (cleaned.length !== 12) {
    throw new Error(`Invalid MAC address: ${mac}`);
  }
  
  const formatted = cleaned
    .match(/.{2}/g)!
    .join(':')
    .toUpperCase();
  
  return formatted;
}

export function isValidMacAddress(mac: string): boolean {
  try {
    parseMacAddress(mac);
    return true;
  } catch {
    return false;
  }
}

export function getManufacturer(mac: string): string | undefined {
  try {
    const formatted = parseMacAddress(mac);
    const prefix = formatted.substring(0, 8).replace(/:/g, '');
    
    if (vendorDatabase.length === 0) {
      loadVendorDatabase();
    }
    
    const vendor = vendorDatabase.find((v) => v.prefix === prefix);
    return vendor?.vendor;
  } catch {
    return undefined;
  }
}

function loadVendorDatabase(): void {
  try {
    const dbPath = path.join(__dirname, '../../data/mac-vendors.txt');
    const data = readFileSync(dbPath, 'utf-8');
    
    vendorDatabase = data
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => {
        const [prefix, ...vendorParts] = line.split('\t');
        return {
          prefix: prefix.trim(),
          vendor: vendorParts.join(' ').trim(),
        };
      });
  } catch (error) {
    vendorDatabase = getCommonVendors();
  }
}

function getCommonVendors(): MacVendor[] {
  return [
    { prefix: '00:1B:63', vendor: 'Apple Inc.' },
    { prefix: 'AC:CF:5C', vendor: 'Apple Inc.' },
    { prefix: '14:98:77', vendor: 'Apple Inc.' },
    { prefix: '00:15:99', vendor: 'Samsung Electronics' },
    { prefix: '00:1D:D8', vendor: 'Microsoft Corporation' },
    { prefix: '00:50:56', vendor: 'VMware Inc.' },
    { prefix: '00:1A:11', vendor: 'Google Inc.' },
    { prefix: '00:1F:3B', vendor: 'Intel Corporation' },
    { prefix: '00:25:9C', vendor: 'Cisco Systems' },
    { prefix: '00:1C:42', vendor: 'Parallels Inc.' },
  ];
}

export function isRandomizedMac(mac: string): boolean {
  try {
    const formatted = parseMacAddress(mac);
    const firstOctet = parseInt(formatted.substring(0, 2), 16);
    
    return (firstOctet & 0x02) === 0x02;
  } catch {
    return false;
  }
}

export function generateRandomMac(): string {
  const mac = Array(6)
    .fill(0)
    .map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, '0'))
    .join(':')
    .toUpperCase();
  
  return mac;
}

export function calculateDistance(rssi: number, measuredPower: number = -60): number {
  const n = 2.0;
  return Math.pow(10, (measuredPower - rssi) / (10 * n));
}

export function normalizeSignalStrength(rssi: number, type: 'wifi' | 'bluetooth'): number {
  const min = type === 'wifi' ? -100 : -100;
  const max = type === 'wifi' ? -30 : -40;
  
  const normalized = Math.max(0, Math.min(100, ((rssi - min) / (max - min)) * 100));
  return Math.round(normalized);
}