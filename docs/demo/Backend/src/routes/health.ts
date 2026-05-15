import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('', async (_req, reply) => {
    return reply.send({
      ok: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  fastify.get('/ready', async (_req, reply) => {
    try {
      await fastify.repos.users.findByEmail('health-check@test.invalid');
      return reply.send({ ok: true, database: 'connected' });
    } catch {
      return reply.status(503).send({ ok: false, error: 'Database connection failed' });
    }
  });
};

export default healthRoutes;
