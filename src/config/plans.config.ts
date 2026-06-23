export const PLAN_LIMITS = {
  FREE:       { maxSkus: 100,    maxUsers: 2,  maxMonthlyOrders: 50,    price: 0 },
  STARTER:    { maxSkus: 1000,   maxUsers: 5,  maxMonthlyOrders: 500,   price: 99000 },
  PRO:        { maxSkus: 10000,  maxUsers: 15, maxMonthlyOrders: 5000,  price: 299000 },
  ENTERPRISE: { maxSkus: 999999, maxUsers: 99, maxMonthlyOrders: 99999, price: 799000 },
} as const;

export type PlanKey = keyof typeof PLAN_LIMITS;

export const PLAN_NAMES: Record<PlanKey, string> = {
  FREE: 'Bepul',
  STARTER: 'Starter',
  PRO: 'Pro',
  ENTERPRISE: 'Enterprise',
};
