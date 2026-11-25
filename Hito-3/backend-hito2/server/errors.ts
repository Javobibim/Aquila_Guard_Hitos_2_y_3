export type ErrorCode='NOT_FOUND'|'GONE'|'IDEMPOTENCY_CONFLICT'|'CONTENT_TOO_LONG'|'INVALID_CONTENT'|'INVALID_URL'|'INVALID_PHONE';
export class AppError extends Error { constructor(public code:ErrorCode, message:string){super(message);} }
