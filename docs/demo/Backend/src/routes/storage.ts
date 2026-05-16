import crypto from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { CreateUploadRequestSchema } from '@anhedral/contracts';
import { AuthError, ServerError, ValidationError } from '../errors/index.js';
import { createAuthHook } from '../lib/routeHelpers.js';
import { createSignedDownloadUrl, createSignedUploadUrl, deleteObjectFromR2, isR2Configured } from '../lib/r2.js';

const SIGNED_URL_EXPIRES_IN = 60 * 10;

function sanitizeFileName(fileName: string | undefined) {
  const fallback = 'upload';
  const cleaned = (fileName ?? fallback)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return cleaned || fallback;
}

function objectKeyForUser(userId: string, fileName: string | undefined) {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]+/g, '_');
  return `${safeUserId}--${crypto.randomUUID()}--${sanitizeFileName(fileName)}`;
}

function assertUserOwnsObject(userId: string, objectKey: string) {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]+/g, '_');
  if (!objectKey.startsWith(`${safeUserId}--`)) {
    throw AuthError.forbidden();
  }
}

const storageRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post('/uploads', {
    preHandler: createAuthHook(fastify),
  }, async (req, reply) => {
    if (!req.user?.id) throw AuthError.unauthorized();
    if (!isR2Configured()) throw ServerError.missingConfiguration('R2');

    const parsed = CreateUploadRequestSchema.safeParse(req.body);
    if (!parsed.success) throw ValidationError.invalidFormat('body', 'CreateUploadRequest');
    const input = parsed.data;
    const objectKey = objectKeyForUser(req.user.id, input.fileName);
    const signed = await createSignedUploadUrl({
      objectKey,
      contentType: input.contentType,
    }, SIGNED_URL_EXPIRES_IN);

    await fastify.repos.users.createUploadRecord(req.user.id, {
      objectKey,
      bucket: signed.bucket,
      contentType: input.contentType,
    });

    return reply.send({
      objectKey,
      uploadUrl: signed.uploadUrl,
      expiresIn: signed.expiresIn,
      headers: { 'Content-Type': input.contentType },
    });
  });

  fastify.get<{ Params: { key: string } }>('/files/:key', {
    preHandler: createAuthHook(fastify),
  }, async (req, reply) => {
    if (!req.user?.id) throw AuthError.unauthorized();
    if (!isR2Configured()) throw ServerError.missingConfiguration('R2');

    const objectKey = decodeURIComponent(req.params.key);
    assertUserOwnsObject(req.user.id, objectKey);
    return reply.send(await createSignedDownloadUrl(objectKey, SIGNED_URL_EXPIRES_IN));
  });

  fastify.delete<{ Params: { key: string } }>('/files/:key', {
    preHandler: createAuthHook(fastify),
  }, async (req, reply) => {
    if (!req.user?.id) throw AuthError.unauthorized();
    if (!isR2Configured()) throw ServerError.missingConfiguration('R2');

    const objectKey = decodeURIComponent(req.params.key);
    assertUserOwnsObject(req.user.id, objectKey);
    await deleteObjectFromR2(objectKey);
    return reply.code(204).send();
  });
};

export default storageRoutes;
