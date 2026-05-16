import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import clerkAuthPlugin from '../plugins/clerkAuth.js';
import health from './health.js';
import auth from './auth.js';
import subscriptions from './subscriptions.js';
import storage from './storage.js';
import cors from '@fastify/cors';

const routes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const FRONTEND_URL = fastify.env?.FRONTEND_URL;
  const extensionOrigins = String(fastify.env?.EXTENSION_ORIGINS ?? '')
    .split(',').map(o => o.trim()).filter(o => o.length > 0);
  const restrictedOrigins = [...new Set([
    ...(FRONTEND_URL ? [FRONTEND_URL] : []),
    ...extensionOrigins,
  ])];
  const restrictedCorsOrigin = restrictedOrigins.length > 0 ? restrictedOrigins : false;

  await fastify.register(async (app) => {
    await app.register(cors, { origin: restrictedCorsOrigin, maxAge: 86_400, methods: ['GET', 'OPTIONS'], allowedHeaders: ['Content-Type'] });
    await app.register(health);
  }, { prefix: '/health' });

  await fastify.register(async (app) => {
    await app.register(cors, { origin: restrictedCorsOrigin, maxAge: 86_400, methods: ['GET', 'POST', 'DELETE', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type', 'X-Platform'] });
    await app.register(clerkAuthPlugin);
    await app.register(auth);
  }, { prefix: '/auth' });

  await fastify.register(async (app) => {
    await app.register(cors, { origin: restrictedCorsOrigin, maxAge: 86_400, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type', 'X-Platform', 'X-RevenueCat-Signature'] });
    await app.register(subscriptions);
  }, { prefix: '/subscriptions' });

  await fastify.register(async (app) => {
    await app.register(cors, { origin: restrictedCorsOrigin, maxAge: 86_400, methods: ['GET', 'POST', 'DELETE', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type', 'X-Platform'] });
    await app.register(clerkAuthPlugin);
    await app.register(storage);
  }, { prefix: '/storage' });
};

export default routes;
