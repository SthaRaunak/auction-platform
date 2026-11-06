// Barrel of every module's tables. Relative imports only — drizzle-kit does not resolve `@/`.
export * from '../modules/auth/auth.schema';
export * from '../modules/auction/auction.schema';
export * from '../modules/bid/bid.schema';
export * from '../modules/outbox/outbox.schema';
export * from '../modules/audit/audit.schema';
export * from '../modules/moderation/moderation.schema';
export * from '../modules/payment/payment.schema';
export * from '../modules/review/review.schema';
export * from '../modules/comment/comment.schema';
