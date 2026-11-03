/**
 * Earnest-money movements (E9). There is deliberately no real rail: the stub
 * adapter approves everything. A connectIPS or Khalti adapter would implement these
 * three calls against an authorization hold.
 */
export interface PaymentGateway {
  hold(input: { userId: string; amount: number; currency: string; reference: string }): Promise<{ gatewayRef: string }>;
  refund(gatewayRef: string): Promise<void>;
  capture(gatewayRef: string): Promise<void>;
}
