import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { PLAN_LIMIT_KEY, PlanLimitResource } from '../decorators/plan-limit.decorator';
import { PLAN_LIMITS, PlanKey } from '../../config/plans.config';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { Plan } from '@prisma/client';

@Injectable()
export class PlanLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private tenantPrisma: TenantPrismaService,
    @InjectRedis() private redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resource = this.reflector.getAllAndOverride<PlanLimitResource>(PLAN_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!resource) return true;

    const request = context.switchToHttp().getRequest();
    const tenant = request.tenant;
    if (!tenant) return true;

    const limits = PLAN_LIMITS[tenant.plan as PlanKey];
    const cacheKey = `plan_usage:${tenant.id}:${resource}`;

    let current: number;
    const cached = await this.redis.get(cacheKey);

    if (cached !== null) {
      current = parseInt(cached, 10);
    } else {
      const db = await this.tenantPrisma.getClient(tenant.slug);
      current = await this.countResource(db, resource);
      await this.redis.setex(cacheKey, 300, current);
    }

    const limit = this.getLimit(limits, resource);

    if (current >= limit) {
      throw new HttpException(
        {
          message: `Plan limitiga yetildi: ${resource}`,
          code: 'PLAN_LIMIT',
          resource,
          current,
          limit,
          upgradeUrl: '/billing/upgrade',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    return true;
  }

  private async countResource(db: any, resource: PlanLimitResource): Promise<number> {
    switch (resource) {
      case 'skus':
        return db.product.count({ where: { isActive: true } });
      case 'users':
        return 0; // handled separately from public schema
      case 'orders': {
        const start = new Date();
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        return db.order.count({ where: { createdAt: { gte: start } } });
      }
    }
  }

  private getLimit(limits: (typeof PLAN_LIMITS)[Plan], resource: PlanLimitResource): number {
    switch (resource) {
      case 'skus': return limits.maxSkus;
      case 'users': return limits.maxUsers;
      case 'orders': return limits.maxMonthlyOrders;
    }
  }
}
