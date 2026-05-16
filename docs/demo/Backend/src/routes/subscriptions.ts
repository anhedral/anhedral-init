import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import clerkAuthPlugin from '../plugins/clerkAuth.js';
import { SubscriptionService } from '../services/SubscriptionService.js';
import { AuthError } from '../errors/index.js';
import { verifyRevenueCatWebhook, verifyRevenueCatWebhookAuthorization } from '../lib/revenuecat.js';
import { createAuthHook } from '../lib/routeHelpers.js';
import { CACHE_SECONDS } from '../lib/constants.js';

const subscriptionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const service = new SubscriptionService(fastify);

  fastify.get('/pricing', async (_req, reply) => {
    const data = await service.getPricing();
    reply.header('Cache-Control', `private, max-age=${CACHE_SECONDS.SUBSCRIPTIONS_PRICING}`);
    return reply.send(data);
  });

  await fastify.register(async (app) => {
    await app.register(clerkAuthPlugin);

    app.get<{ Querystring: { refresh?: boolean } }>('/entitlements/me', {
      preHandler: createAuthHook(app),
    }, async (req, reply) => {
      const userId = req.user?.id;
      if (!userId) throw AuthError.unauthorized();
      if (app.env.ANHEDRAL_DEMO === 'true') {
        reply.header('Cache-Control', 'private, no-store');
        return reply.send({
          pro: true,
          inTrial: false,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          periodStart: new Date().toISOString(),
          periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          method: 'paid',
          managementUrl: 'https://app.revenuecat.com/',
          cancelAtPeriodEnd: false,
        });
      }
      const refreshRaw = (req.query as unknown as { refresh?: unknown }).refresh;
      const requestedRefresh = refreshRaw === true || refreshRaw === 'true' || refreshRaw === 1 || refreshRaw === '1';
      const forceRefresh = Boolean(app.env.RC_SECRET_API_KEY) && requestedRefresh;
      const data = await service.getEntitlementWithTrial(userId, { refreshRevenueCat: forceRefresh }, req);
      reply.header('Cache-Control', 'private, no-store');
      return reply.send(data);
    });
  });

  await fastify.register(async (app) => {
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
      try {
        const raw = typeof body === 'string' ? body : body.toString();
        (req as unknown as { rawBody?: string }).rawBody = raw;
        done(null, raw.trim().length === 0 ? {} : JSON.parse(raw));
      } catch (err) { done(err as Error, undefined); }
    });

    app.post('/webhooks/revenuecat', async (req: FastifyRequest, reply) => {
      const rawBody = (req as unknown as { rawBody?: string }).rawBody;
      const bodyString = rawBody ?? (typeof req.body === 'string' ? req.body : '');
      const signature = req.headers['x-revenuecat-signature'] as string | undefined;
      const authorization = req.headers.authorization as string | undefined;
      const webhookSecret = fastify.env.RC_WEBHOOK_SECRET;

      if (!webhookSecret && fastify.env.NODE_ENV === 'production') {
        return reply.code(500).send({ ok: false, error: 'webhook_not_configured' });
      }
      if (webhookSecret) {
        if (!bodyString) return reply.code(400).send({ ok: false, error: 'invalid_body' });
        const verifiedByAuth = verifyRevenueCatWebhookAuthorization(authorization, webhookSecret);
        const verifiedBySig  = signature ? verifyRevenueCatWebhook(bodyString, signature, webhookSecret) : false;
        if (!verifiedByAuth && !verifiedBySig) return reply.code(401).send({ ok: false, error: 'invalid_signature' });
      }

      const parsed = req.body as Record<string, unknown>;
      const event  = (parsed?.event && typeof parsed.event === 'object') ? (parsed.event as Record<string, unknown>) : parsed;
      try { await service.handleRevenueCatWebhook(event, req); } catch (err) {
        fastify.log.error({ msg: '[webhook:revenuecat_failed]', error: (err as Error).message });
      }
      return { ok: true };
    });
  });

};

export default subscriptionRoutes;
