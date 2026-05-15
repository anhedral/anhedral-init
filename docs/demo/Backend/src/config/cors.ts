import type { AppEnv } from '../types/index.js';

export class CorsConfig {
  readonly frontendUrl?: string;
  readonly extensionOrigins: string[];
  readonly restrictedOrigins: string[];

  constructor(env: AppEnv) {
    if (env.FRONTEND_URL) this.frontendUrl = env.FRONTEND_URL;
    this.extensionOrigins = String(env.EXTENSION_ORIGINS || '')
      .split(',').map(o => o.trim()).filter(o => o.length > 0);
    this.restrictedOrigins = [
      ...new Set([
        ...(this.frontendUrl ? [this.frontendUrl] : []),
        ...this.extensionOrigins,
      ]),
    ];
  }

  getRestrictedOrigins(): string[] | false {
    return this.restrictedOrigins.length > 0 ? this.restrictedOrigins : false;
  }
}
