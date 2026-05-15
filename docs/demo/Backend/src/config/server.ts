import type { AppEnv } from '../types/index.js';

export class ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly nodeEnv: string;
  readonly isDevelopment: boolean;
  readonly isProduction: boolean;

  constructor(env: AppEnv) {
    this.port = env.PORT;
    this.host = '0.0.0.0';
    this.nodeEnv = env.NODE_ENV;
    this.isDevelopment = env.NODE_ENV === 'development';
    this.isProduction = env.NODE_ENV === 'production';
  }
}
