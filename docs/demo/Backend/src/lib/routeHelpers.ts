import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { AuthError } from '../errors/index.js';

export function createAuthHook(fastify: FastifyInstance) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (typeof fastify.authenticate === 'function') {
      await fastify.authenticate(req, reply);
    } else {
      throw AuthError.unauthorized();
    }
  };
}

export function runBackgroundTask(
  req: FastifyRequest,
  task: Promise<unknown>,
  label?: string
): void {
  const wrapped = task.catch((error) => {
    req.log.warn({
      msg: '[background_task_failed]',
      label,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  if (typeof req.waitUntil === 'function') {
    req.waitUntil(wrapped);
  } else {
    void wrapped;
  }
}
