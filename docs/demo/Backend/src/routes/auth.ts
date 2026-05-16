import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { clerkClient } from '@clerk/fastify';
import { AuthError } from '../errors/index.js';
import { createAuthHook } from '../lib/routeHelpers.js';

function getDisplayName(input: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  fallback?: string | null;
}) {
  return [input.firstName, input.lastName].filter(Boolean).join(' ').trim()
    || input.fallback
    || (input.email ? input.email.split('@')[0] : 'Builder');
}

const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('/me', {
    preHandler: createAuthHook(fastify),
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user?.id) throw AuthError.unauthorized();

    if (fastify.env.ANHEDRAL_DEMO === 'true') {
      return reply.send({
        user: {
          id: 'user_demo',
          email: 'demo@anhedral.dev',
          firstName: 'Demo',
          lastName: 'Builder',
          displayName: 'demo Demo',
          imageUrl: null,
        },
      });
    }

    const clerkUser = await clerkClient.users.getUser(req.user.id);
    const userData = await fastify.repos.users.getProfile(req.user.id);
    const primaryEmail = clerkUser.emailAddresses.find(
      (e: { id: string }) => e.id === clerkUser.primaryEmailAddressId
    );
    const email = primaryEmail?.emailAddress ?? '';
    const displayName = getDisplayName({
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      email,
      fallback: userData?.displayName ?? null,
    });

    return reply.send({
      user: {
        id: clerkUser.id,
        email,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        displayName,
        imageUrl: userData?.profileImageUrl ?? clerkUser.imageUrl,
      },
    });
  });

  fastify.post('/signout', {
    preHandler: createAuthHook(fastify),
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user?.id) throw AuthError.unauthorized();
    return reply.send({ success: true });
  });

  fastify.delete('/account', {
    preHandler: createAuthHook(fastify),
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user?.id) throw AuthError.unauthorized();
    await clerkClient.users.deleteUser(req.user.id);
    await fastify.repos.users.deleteById(req.user.id);
    return reply.code(204).send();
  });
};

export default authRoutes;
