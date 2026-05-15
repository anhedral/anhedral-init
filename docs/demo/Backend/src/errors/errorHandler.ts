import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './AppError.js';

export function errorHandler(
  error: Error | FastifyError,
  req: FastifyRequest,
  reply: FastifyReply
) {
  const isProduction = process.env.NODE_ENV === 'production';
  const statusCode =
    error instanceof AppError
      ? error.statusCode
      : ('statusCode' in error && typeof error.statusCode === 'number')
          ? error.statusCode
          : ('validation' in error && (error as FastifyError).validation)
              ? 400
              : 500;

  const logPayload = {
    msg: '[error_handler]',
    id: req.id,
    method: req.method,
    url: req.url,
    statusCode,
    errorName: error.name,
    errorMessage: error.message,
    errorCode: (error as AppError).code,
    ...(isProduction && statusCode < 500 ? {} : { stack: error.stack }),
  };

  if (statusCode < 500) {
    req.log.warn(logPayload);
  } else {
    req.log.error(logPayload);
  }

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send(error.toJSON());
  }

  if ('validation' in error && error.validation) {
    const validation = error.validation as Array<{ instancePath?: string; params?: { missingProperty?: string }; keyword?: string }>;
    const missingField = validation.find(v => v.keyword === 'required');
    if (missingField && missingField.params?.missingProperty) {
      return reply.status(400).send({
        error: 'missing_field',
        message: `Required field is missing: ${missingField.params.missingProperty}`,
        details: { field: missingField.params.missingProperty },
      });
    }
    return reply.status(400).send({
      error: 'validation_error',
      message: 'Invalid request',
      details: isProduction ? undefined : error.validation,
    });
  }

  if ('statusCode' in error && typeof error.statusCode === 'number') {
    return reply.status(error.statusCode).send({
      error: error.name || 'error',
      message: error.message,
    });
  }

  return reply.status(500).send({ error: 'server_error', message: 'An unexpected error occurred' });
}
