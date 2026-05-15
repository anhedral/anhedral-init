import { AppError } from './AppError.js';

export class ServerError extends AppError {
  constructor(message: string, details?: unknown) {
    super('server_error', 500, message, details);
  }

  static generic(details?: unknown) {
    return new ServerError('An internal server error occurred', details);
  }

  static missingConfiguration(key: string) {
    return new ServerError(`Server misconfiguration: ${key} is not defined`, { missingKey: key });
  }

  static databaseError(operation: string, error?: unknown) {
    return new ServerError(`Database operation failed: ${operation}`, { operation, error });
  }
}
