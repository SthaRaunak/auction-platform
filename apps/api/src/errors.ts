/** A rule violation the caller can act on. The HTTP layer maps `status`/`code` straight to the response. */
export class DomainError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new DomainError(400, code, message, details);
export const unauthorized = (message = 'Sign in to continue.') => new DomainError(401, 'UNAUTHENTICATED', message);
export const forbidden = (code: string, message: string) => new DomainError(403, code, message);
export const notFound = (what = 'Resource') => new DomainError(404, 'NOT_FOUND', `${what} not found.`);
export const conflict = (code: string, message: string, details?: unknown) => new DomainError(409, code, message, details);
