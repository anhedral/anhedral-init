import { AppError } from './AppError.js';

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('not_found', 404, `${resource} not found`);
  }
}
