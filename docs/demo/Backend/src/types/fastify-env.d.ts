import 'fastify';
import type { AppEnv } from '../types/index.js';

type FastifyReplyType = import('fastify').FastifyReply;
type FastifyRequestType = import('fastify').FastifyRequest;

declare module 'fastify' {
  interface FastifyInstance {
    env: AppEnv;
    authenticate?: (req: FastifyRequestType, reply: FastifyReplyType) => Promise<void> | void;
  }

  interface FastifyRequest {
    _startedAt?: number;
  }
}
