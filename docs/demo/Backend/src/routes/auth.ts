import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { clerkClient } from '@clerk/fastify';
import { AuthError } from '../errors/index.js';
import { createAuthHook } from '../lib/routeHelpers.js';
import { createSignedAvatarUrl, isR2Configured, uploadAvatarToR2 } from '../lib/r2.js';

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

async function resolveAvatarUrl(input: {
  avatarObjectKey?: string | null;
  fallbackUrl?: string | null;
}) {
  if (input.avatarObjectKey && isR2Configured()) {
    try {
      return await createSignedAvatarUrl(input.avatarObjectKey);
    } catch {
      return input.fallbackUrl ?? null;
    }
  }

  return input.fallbackUrl ?? null;
}

function sanitizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
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
          avatarUrl: null,
          creditsBalance: 250,
          subscriptionTier: 'pro',
          subscriptionStatus: 'active',
        },
      });
    }

    const clerkUser = await clerkClient.users.getUser(req.user.id);
    const userData = await fastify.repos.users.getDashboardProfile(req.user.id);
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
    const avatarUrl = await resolveAvatarUrl({
      avatarObjectKey: userData?.avatarObjectKey ?? null,
      fallbackUrl: userData?.profileImageUrl ?? clerkUser.imageUrl ?? null,
    });

    return reply.send({
      user: {
        id: clerkUser.id,
        email,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        displayName,
        imageUrl: userData?.profileImageUrl ?? clerkUser.imageUrl,
        avatarUrl,
        creditsBalance: userData?.creditsBalance ?? 250,
        subscriptionTier: userData?.subscriptionTier || 'free',
        subscriptionStatus: userData?.subscriptionStatus || 'active',
      },
    });
  });

  fastify.post('/signout', {
    preHandler: createAuthHook(fastify),
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user?.id) throw AuthError.unauthorized();
    return reply.send({ success: true });
  });

  fastify.post<{ Body: { base64: string; mimeType: string; fileName?: string } }>('/avatar', {
    preHandler: createAuthHook(fastify),
  }, async (req, reply) => {
    if (!req.user?.id) throw AuthError.unauthorized();
    if (!isR2Configured()) {
      return reply.code(500).send({ error: 'r2_not_configured', message: 'Configure Cloudflare R2 before uploading avatars.' });
    }

    const { base64, mimeType, fileName } = req.body;
    if (!base64 || !mimeType) {
      return reply.code(400).send({ error: 'invalid_payload', message: 'Avatar payload is incomplete.' });
    }
    if (!mimeType.startsWith('image/')) {
      return reply.code(400).send({ error: 'invalid_mime_type', message: 'Only image uploads are supported.' });
    }

    const normalizedBase64 = base64.includes(',') ? (base64.split(',')[1] ?? '') : base64;
    const buffer = Buffer.from(normalizedBase64, 'base64');
    if (buffer.length === 0) {
      return reply.code(400).send({ error: 'invalid_payload', message: 'Avatar payload is empty.' });
    }
    if (buffer.length > 5 * 1024 * 1024) {
      return reply.code(400).send({ error: 'file_too_large', message: 'Avatar uploads are capped at 5MB.' });
    }

    const safeName = sanitizeFileName(fileName || 'avatar');
    const objectKey = `avatars/${req.user.id}/${Date.now()}-${safeName || 'avatar'}`;
    await uploadAvatarToR2({
      objectKey,
      body: buffer,
      contentType: mimeType,
    });

    await fastify.repos.users.updateAvatar(req.user.id, {
      avatarObjectKey: objectKey,
      avatarMimeType: mimeType,
    });

    const avatarUrl = await createSignedAvatarUrl(objectKey);
    return reply.send({ ok: true, avatarUrl });
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
