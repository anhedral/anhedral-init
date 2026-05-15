export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    const json: { error: string; message: string; details?: unknown } = {
      error: this.code,
      message: this.message,
    };
    if (this.details !== undefined) json.details = this.details;
    return json;
  }
}
