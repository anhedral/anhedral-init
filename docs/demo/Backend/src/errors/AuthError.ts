import { AppError } from './AppError.js';

export class AuthError extends AppError {
  constructor(code: string, message: string, details?: unknown, statusCode: number = 401) {
    super(code, statusCode, message, details);
  }

  static missingAuthorization() {
    return new AuthError('missing_authorization', 'Authorization header is required');
  }

  static invalidAuthorization() {
    return new AuthError('invalid_authorization', 'Invalid authorization credentials');
  }

  static invalidToken() {
    return new AuthError('invalid_session_token', 'Invalid or malformed authentication token');
  }

  static tokenExpired() {
    return new AuthError('token_expired', 'Authentication token has expired');
  }

  static userRequired() {
    return new AuthError('user_authentication_required', 'This endpoint requires user authentication (JWT token)');
  }

  static unauthorized() {
    return new AuthError('unauthorized', 'Authentication required');
  }

  static forbidden() {
    return new AuthError('forbidden', 'Insufficient permissions', undefined, 403);
  }
}
