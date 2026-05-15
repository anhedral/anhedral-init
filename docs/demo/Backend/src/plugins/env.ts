import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fastifyEnv from '@fastify/env';
import fp from 'fastify-plugin';

const configPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const schema = {
    type: 'object',
    required: ['PORT', 'DATABASE_URL'],
    properties: {
      PORT: { type: 'number' },
      NODE_ENV: { type: 'string', default: 'development' },
      LOG_LEVEL: { type: 'string', default: 'info' },
      ANHEDRAL_DEMO: { type: 'string', default: 'false' },
      CLERK_PUBLISHABLE_KEY: { type: 'string', nullable: true },
      CLERK_SECRET_KEY: { type: 'string', nullable: true },
      FRONTEND_URL: { type: 'string', nullable: true },
      EXTENSION_ORIGINS: { type: 'string', nullable: true },
      DATABASE_URL: { type: 'string' },
      R2_ACCOUNT_ID: { type: 'string', nullable: true },
      R2_ACCESS_KEY_ID: { type: 'string', nullable: true },
      R2_SECRET_ACCESS_KEY: { type: 'string', nullable: true },
      R2_BUCKET: { type: 'string', nullable: true },
      RC_SECRET_API_KEY: { type: 'string', nullable: true, default: '' },
      RC_WEBHOOK_SECRET: { type: 'string', nullable: true, default: '' },
      RC_ENTITLEMENT_ID: { type: 'string', default: 'pro' },
      RC_OFFERING_ID: { type: 'string', default: 'default' },
    },
  } as const;

  await fastify.register(fastifyEnv as unknown as FastifyPluginAsync, {
    schema,
    dotenv: !process.env.VERCEL,
    confKey: 'env',
  } as unknown as Record<string, unknown>);

  if (fastify.env.NODE_ENV === 'production') {
    if (fastify.env.ANHEDRAL_DEMO === 'true') {
      throw new Error('ANHEDRAL_DEMO must be false in production');
    }

    const required = [
      'CLERK_PUBLISHABLE_KEY',
      'CLERK_SECRET_KEY',
      'RC_SECRET_API_KEY',
      'RC_WEBHOOK_SECRET',
    ] as const;
    const missing = required.filter((key) => !fastify.env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing production environment variables: ${missing.join(', ')}`);
    }
  }
};

export default fp(configPlugin, { name: 'env-config', fastify: '5.x' });
