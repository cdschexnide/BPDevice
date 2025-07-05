import { EventEmitter } from 'events';
import * as pcap from 'pcap';
import { Device, DetectionEvent } from '@/types';
import { createModuleLogger } from '@/utils/logger';
import { parseMacAddress, getManufacturer, isRandomizedMac } from '@/utils/macParser';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const logger = createModuleLogger('WifiDetector');

interface WifiPacketInfo {
  sourceMac: string;
  destinationMac?: string;
  signalStrength: number;
  frequency?: number;
  channel?: number;
  ssid?: string;
  frameType?: string;
}

export class WifiDetector extends EventEmitter {
  private session: pcap.PcapSession | null = null;
  private interface: string;
  private channels: number[];
  private currentChannel: number = 1;
  private channelHopper: NodeJS.Timer | null = null;
  private dwellTime: number;
  private isRunning: boolean = false;
  private detectedDevices: Map<string, Date> = new Map();

  constructor(interfaceName: string, channels: number[] = [1, 6, 11], dwellTime: number = 250) {
    super();
    this.interface = interfaceName;
    this.channels = channels;
    this.dwellTime = dwellTime;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('WiFi detector is already running');
      return;
    }

    try {
      await this.enableMonitorMode();

      this.session = pcap.createSession(this.interface, {
        filter: 'type mgt subtype probe-req or type mgt subtype probe-resp or type mgt subtype beacon',
        buffer_timeout: 1000,
        promiscuous: true,
      });

      this.session.on('packet', this.handlePacket.bind(this));
      this.session.on('error', (error: Error) => {
        logger.error('Pcap session error', error);
        this.emit('error', error);
      });

      this.startChannelHopping();
      this.isRunning = true;

      logger.info('WiFi detector started', { 
        interface: this.interface,
        channels: this.channels,
        dwellTime: this.dwellTime 
      });

      this.emit('started');
    } catch (error) {
      logger.error('Failed to start WiFi detector', error);
      throw error;
    }
  }

  private async enableMonitorMode(): Promise<void> {
    try {
      await execAsync(`sudo ip link set ${this.interface} down`);
      await execAsync(`sudo iw ${this.interface} set monitor control`);
      await execAsync(`sudo ip link set ${this.interface} up`);
      logger.info('Monitor mode enabled', { interface: this.interface });
    } catch (error) {
      throw new Error(`Failed to enable monitor mode: ${error}`);
    }
  }

  private handlePacket(rawPacket: Buffer): void {
    try {
      const packet = pcap.decode.packet(rawPacket);
      const packetInfo = this.extractPacketInfo(packet);

      if (!packetInfo || !packetInfo.sourceMac) {
        return;
      }

      if (isRandomizedMac(packetInfo.sourceMac)) {
        logger.debug('Detected randomized MAC', { mac: packetInfo.sourceMac });
      }

      const now = new Date();
      const lastSeen = this.detectedDevices.get(packetInfo.sourceMac);
      
      if (!lastSeen || now.getTime() - lastSeen.getTime() > 1000) {
        this.detectedDevices.set(packetInfo.sourceMac, now);

        const device: Partial<Device> = {
          macAddress: packetInfo.sourceMac,
          type: 'wifi',
          manufacturer: getManufacturer(packetInfo.sourceMac),
          signalStrength: packetInfo.signalStrength,
          lastSeen: now,
        };

        const detectionEvent: DetectionEvent = {
          device,
          timestamp: now,
          source: 'wifi',
        };

        logger.debug('Device detected', {
          mac: device.macAddress,
          signal: device.signalStrength,
          manufacturer: device.manufacturer,
        });

        this.emit('device-detected', detectionEvent);
      }
    } catch (error) {
      logger.error('Error processing packet', error);
    }
  }

  private extractPacketInfo(packet: any): WifiPacketInfo | null {
    try {
      if (!packet.payload || !packet.payload.payload) {
        return null;
      }

      const radioTap = packet.payload;
      const ieee80211 = packet.payload.payload;

      const signalStrength = this.extractSignalStrength(radioTap);
      const frequency = this.extractFrequency(radioTap);
      const channel = this.frequencyToChannel(frequency);

      if (!ieee80211.ieee802_11Frame) {
        return null;
      }

      const frame = ieee80211.ieee802_11Frame;
      const sourceMac = this.extractMacFromFrame(frame, 'source');
      
      if (!sourceMac) {
        return null;
      }

      return {
        sourceMac: parseMacAddress(sourceMac),
        signalStrength,
        frequency,
        channel,
      };
    } catch (error) {
      logger.error('Error extracting packet info', error);
      return null;
    }
  }

  private extractSignalStrength(radioTap: any): number {
    if (radioTap.radiotap && radioTap.radiotap.dbm_antsignal) {
      return radioTap.radiotap.dbm_antsignal;
    }
    return -100;
  }

  private extractFrequency(radioTap: any): number | undefined {
    if (radioTap.radiotap && radioTap.radiotap.channel_frequency) {
      return radioTap.radiotap.channel_frequency;
    }
    return undefined;
  }

  private extractMacFromFrame(frame: any, type: 'source' | 'destination'): string | null {
    try {
      if (frame.shost && type === 'source') {
        return frame.shost.addr.map((byte: number) => 
          byte.toString(16).padStart(2, '0')
        ).join(':');
      }
      if (frame.dhost && type === 'destination') {
        return frame.dhost.addr.map((byte: number) => 
          byte.toString(16).padStart(2, '0')
        ).join(':');
      }
    } catch (error) {
      logger.error('Error extracting MAC from frame', error);
    }
    return null;
  }

  private frequencyToChannel(frequency?: number): number | undefined {
    if (!frequency) return undefined;

    if (frequency >= 2412 && frequency <= 2484) {
      return Math.floor((frequency - 2412) / 5) + 1;
    }
    
    if (frequency >= 5180 && frequency <= 5825) {
      return Math.floor((frequency - 5180) / 5) + 36;
    }

    return undefined;
  }

  private startChannelHopping(): void {
    this.channelHopper = setInterval(() => {
      const currentIndex = this.channels.indexOf(this.currentChannel);
      const nextIndex = (currentIndex + 1) % this.channels.length;
      this.currentChannel = this.channels[nextIndex];
      this.setChannel(this.currentChannel);
    }, this.dwellTime);
  }

  private async setChannel(channel: number): Promise<void> {
    try {
      await execAsync(`sudo iw ${this.interface} set channel ${channel}`);
      logger.debug('Channel set', { channel });
    } catch (error) {
      logger.error(`Failed to set channel ${channel}`, error);
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    if (this.channelHopper) {
      clearInterval(this.channelHopper);
      this.channelHopper = null;
    }

    if (this.session) {
      this.session.close();
      this.session = null;
    }

    this.isRunning = false;
    this.detectedDevices.clear();

    logger.info('WiFi detector stopped');
    this.emit('stopped');
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getCurrentChannel(): number {
    return this.currentChannel;
  }

  getInterface(): string {
    return this.interface;
  }
}