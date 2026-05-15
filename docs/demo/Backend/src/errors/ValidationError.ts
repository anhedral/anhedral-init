import { AppError } from './AppError.js';

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('validation_error', 400, message, details);
  }

  static missingField(field: string) {
    return new ValidationError(`Required field is missing: ${field}`, { field });
  }

  static invalidFormat(field: string, expected: string) {
    return new ValidationError(`Invalid format for ${field}. Expected: ${expected}`, { field, expected });
  }
}
