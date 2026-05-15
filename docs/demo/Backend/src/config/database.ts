import type { AppEnv } from '../types/index.js';

export class DatabaseConfig {
  readonly url: string;

  constructor(env: AppEnv) {
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    this.url = env.DATABASE_URL;
  }
}
