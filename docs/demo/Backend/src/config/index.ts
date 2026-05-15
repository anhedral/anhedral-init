import type { AppEnv } from '../types/index.js';
import { ServerConfig } from './server.js';
import { DatabaseConfig } from './database.js';
import { CorsConfig } from './cors.js';

export class AppConfig {
  readonly server: ServerConfig;
  readonly database: DatabaseConfig;
  readonly cors: CorsConfig;

  constructor(env: AppEnv) {
    this.server = new ServerConfig(env);
    this.database = new DatabaseConfig(env);
    this.cors = new CorsConfig(env);
  }

  static fromEnv(env: AppEnv): AppConfig {
    return new AppConfig(env);
  }
}

export { ServerConfig } from './server.js';
export { DatabaseConfig } from './database.js';
export { CorsConfig } from './cors.js';
