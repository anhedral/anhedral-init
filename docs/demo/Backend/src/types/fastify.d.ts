import 'fastify';
import type { AppConfig } from '../config/index.js';
import type { Repositories } from '../repositories/index.js';
import type { AppUser } from '../types/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
    config: AppConfig;
    repos: Repositories;
  }

  interface FastifyRequest {
    user?: AppUser;
    _startedAt?: number;
    waitUntil?: (promise: Promise<unknown>) => void;
  }
}

export {};
