/**
 * Backward compatibility alias for MysticPayments (formerly YOUPI-Pg).
 * All authoritative payment logic is handled in src/lib/mystic-payments.ts.
 */
export {
  createMysticSession as createYoupiSession,
  verifyMysticSignature as verifyYoupiSignature,
  getStrictMysticConfig,
  StrictCredentialError,
  cleanAndValidateUrl,
  getMysticPaymentStatus as getYoupiPaymentStatus,
  type MysticCustomer as YoupiCustomer,
  type MysticCreateSessionOptions as YoupiCreateSessionOptions,
  type MysticSessionResponse as YoupiSessionResponse,
} from "./mystic-payments";
