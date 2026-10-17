export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotImplementedError extends AppError {
  constructor() {
    super("This endpoint is not implemented yet.", "NOT_IMPLEMENTED", 501);
  }
}
