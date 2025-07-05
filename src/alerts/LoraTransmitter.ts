import { EventEmitter } from 'events';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('LoraTransmitter');

interface LoraConfig {
  port: string;
  baudRate: number;
  deviceId: string;
  retries?: number;
  timeout?: number;
}

interface LoraMessage {
  cmd: string;
  deviceId: string;
  alertType: string;
  timestamp: number;
  data?: any;
}

export class LoraTransmitter extends EventEmitter {
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private config: LoraConfig;
  private isConnected: boolean = false;
  private messageQueue: LoraMessage[] = [];
  private processingMessage: boolean = false;

  constructor(config: LoraConfig) {
    super();
    this.config = {
      retries: 3,
      timeout: 5000,
      ...config,
    };
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      logger.warn('LoRa module already connected');
      return;
    }

    try {
      this.port = new SerialPort({
        path: this.config.port,
        baudRate: this.config.baudRate,
        autoOpen: false,
      });

      this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

      await new Promise<void>((resolve, reject) => {
        this.port!.open((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      this.setupEventHandlers();
      await this.initializeModule();

      this.isConnected = true;
      logger.info('LoRa module connected', {
        port: this.config.port,
        baudRate: this.config.baudRate,
      });

      this.emit('connected');
      this.processMessageQueue();
    } catch (error) {
      logger.error('Failed to connect to LoRa module', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.port || !this.parser) return;

    this.parser.on('data', (data: string) => {
      logger.debug('LoRa response', { data: data.trim() });
      this.handleResponse(data.trim());
    });

    this.port.on('error', (error: Error) => {
      logger.error('LoRa serial port error', error);
      this.emit('error', error);
      this.handleDisconnection();
    });

    this.port.on('close', () => {
      logger.info('LoRa serial port closed');
      this.handleDisconnection();
    });
  }

  private async initializeModule(): Promise<void> {
    try {
      await this.sendCommand('AT');
      await this.sendCommand(`AT+ID=${this.config.deviceId}`);
      await this.sendCommand('AT+MODE=0');
      logger.info('LoRa module initialized');
    } catch (error) {
      throw new Error(`Failed to initialize LoRa module: ${error}`);
    }
  }

  private async sendCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.port || !this.isConnected) {
        reject(new Error('LoRa module not connected'));
        return;
      }

      let timeout: NodeJS.Timeout;
      const responseHandler = (data: string) => {
        clearTimeout(timeout);
        this.parser?.removeListener('data', responseHandler);
        resolve(data);
      };

      timeout = setTimeout(() => {
        this.parser?.removeListener('data', responseHandler);
        reject(new Error(`Command timeout: ${command}`));
      }, this.config.timeout!);

      this.parser?.once('data', responseHandler);

      this.port.write(command + '\r\n', (error) => {
        if (error) {
          clearTimeout(timeout);
          this.parser?.removeListener('data', responseHandler);
          reject(error);
        }
      });
    });
  }

  async sendTrigger(deviceId: string, alertType: string, data?: any): Promise<void> {
    const message: LoraMessage = {
      cmd: 'TRIGGER',
      deviceId,
      alertType,
      timestamp: Date.now(),
      data,
    };

    this.messageQueue.push(message);
    this.processMessageQueue();
  }

  private async processMessageQueue(): Promise<void> {
    if (!this.isConnected || this.processingMessage || this.messageQueue.length === 0) {
      return;
    }

    this.processingMessage = true;
    const message = this.messageQueue.shift()!;

    try {
      await this.transmitMessage(message);
      logger.info('LoRa message transmitted', {
        deviceId: message.deviceId,
        alertType: message.alertType,
      });
      this.emit('message-sent', message);
    } catch (error) {
      logger.error('Failed to transmit LoRa message', { error, message });
      
      if (message.data?.retryCount === undefined) {
        message.data = { ...message.data, retryCount: 0 };
      }
      
      if (message.data.retryCount < this.config.retries!) {
        message.data.retryCount++;
        this.messageQueue.unshift(message);
        logger.info('Retrying LoRa message', {
          retryCount: message.data.retryCount,
          maxRetries: this.config.retries,
        });
      } else {
        this.emit('message-failed', message);
      }
    } finally {
      this.processingMessage = false;
      
      if (this.messageQueue.length > 0) {
        setTimeout(() => this.processMessageQueue(), 1000);
      }
    }
  }

  private async transmitMessage(message: LoraMessage): Promise<void> {
    const payload = JSON.stringify(message);
    const encodedPayload = Buffer.from(payload).toString('hex');
    
    const txCommand = `AT+TX=${encodedPayload}`;
    const response = await this.sendCommand(txCommand);
    
    if (!response.includes('OK')) {
      throw new Error(`Transmission failed: ${response}`);
    }
  }

  private handleResponse(data: string): void {
    if (data.startsWith('+RX:')) {
      const hexPayload = data.substring(4);
      try {
        const payload = Buffer.from(hexPayload, 'hex').toString('utf8');
        const message = JSON.parse(payload);
        this.emit('message-received', message);
      } catch (error) {
        logger.error('Failed to parse received LoRa message', { data, error });
      }
    }
  }

  private handleDisconnection(): void {
    this.isConnected = false;
    this.emit('disconnected');
    
    setTimeout(() => {
      logger.info('Attempting to reconnect to LoRa module...');
      this.connect().catch((error) => {
        logger.error('Failed to reconnect to LoRa module', error);
      });
    }, 5000);
  }

  async getStatus(): Promise<{ connected: boolean; queueSize: number }> {
    return {
      connected: this.isConnected,
      queueSize: this.messageQueue.length,
    };
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.port) {
      return;
    }

    this.isConnected = false;

    return new Promise((resolve) => {
      this.port!.close((error) => {
        if (error) {
          logger.error('Error closing LoRa port', error);
        }
        this.port = null;
        this.parser = null;
        logger.info('LoRa module disconnected');
        resolve();
      });
    });
  }

  isActive(): boolean {
    return this.isConnected;
  }

  getQueueSize(): number {
    return this.messageQueue.length;
  }
}