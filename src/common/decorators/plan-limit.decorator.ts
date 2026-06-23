import { SetMetadata } from '@nestjs/common';

export type PlanLimitResource = 'skus' | 'users' | 'orders';
export const PLAN_LIMIT_KEY = 'planLimit';
export const PlanLimit = (resource: PlanLimitResource) =>
  SetMetadata(PLAN_LIMIT_KEY, resource);
