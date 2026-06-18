/** Typed application errors that map cleanly to HTTP responses. */

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(404, 'not_found', `${resource} '${id}' was not found`);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(422, 'validation_error', message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, 'conflict', message, details);
  }
}

/** Optimistic-lock failure on a versioned aggregate (e.g. prescriptions). */
export class StaleVersionError extends AppError {
  constructor(expected: number, actual: number) {
    super(409, 'stale_version', 'Record was modified by another request', { expected, actual });
  }
}

/** Illegal prescription state transition. */
export class IllegalTransitionError extends AppError {
  constructor(from: string, to: string) {
    super(422, 'illegal_transition', `Cannot transition from '${from}' to '${to}'`);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Missing or invalid credentials') {
    super(401, 'unauthorized', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient role for this action') {
    super(403, 'forbidden', message);
  }
}
