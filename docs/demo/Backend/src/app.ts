import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import routes from './routes/index.js';
import envConfig from './plugins/env.js';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import rateLimit from '@fastify/rate-limit';
import { errorHandler } from './errors/index.js';
import { AppConfig } from './config/index.js';
import { Repositories } from './repositories/index.js';
import { db } from './db/index.js';

const isProduction = process.env.NODE_ENV === 'production';

function createBaseApp(): FastifyInstance {
  return Fastify({
    trustProxy: true,
    logger: {
      level: process.env.LOG_LEVEL ?? (isProduction ? 'warn' : 'info'),
      redact: ['req.headers.authorization'],
      ...(isProduction ? {} : {
        transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' } },
      }),
    },
    bodyLimit: 12 * 1024 * 1024,
    disableRequestLogging: isProduction,
  });
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = createBaseApp();

  if (!isProduction && !process.env.VERCEL) {
    await import('dotenv/config');
  }

  await app.register(envConfig);

  const config = AppConfig.fromEnv(app.env!);
  app.decorate('config', config);

  const repos = new Repositories(db);
  app.decorate('repos', repos);

  await app.register(compress, { global: true, threshold: 512, encodings: ['br', 'gzip', 'deflate'] });
  app.setErrorHandler(errorHandler);

  const isDevelopment = app.env?.NODE_ENV === 'development';

  await app.register(helmet, {
    contentSecurityPolicy: isDevelopment ? false : undefined,
    crossOriginEmbedderPolicy: false,
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    allowList: isDevelopment ? ['127.0.0.1'] : [],
  });

  if (isDevelopment) {
    const [{ default: swagger }, { default: swaggerUI }] = await Promise.all([
      import('@fastify/swagger'),
      import('@fastify/swagger-ui'),
    ]);
    await app.register(swagger, {
      openapi: {
        info: { title: 'demo API', version: '1.0.0' },
        servers: [{ url: `http://localhost:${app.env?.PORT ?? 3000}` }],
        components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
      },
    });
    await app.register(swaggerUI, { routePrefix: '/docs' });
  }

  await app.register(routes);

  return app;
}
