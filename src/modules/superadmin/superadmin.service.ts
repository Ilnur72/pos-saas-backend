import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { PLAN_LIMITS, PlanKey } from '../../config/plans.config';
import { Plan, TenantStatus } from '@prisma/client';

@Injectable()
export class SuperAdminService {
  constructor(
    private prisma: PrismaService,
    private tenantPrisma: TenantPrismaService,
  ) {}

  async getDashboardStats() {
    const [totalTenants, activeTenants, trialTenants, suspendedTenants] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.tenant.count({ where: { status: 'TRIAL' } }),
      this.prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
    ]);

    const paidInvoices = await this.prisma.invoice.aggregate({
      where: {
        status: 'PAID',
        paidAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
      _sum: { amount: true },
    });

    const planDist = await this.prisma.tenant.groupBy({
      by: ['plan'],
      _count: true,
    });

    const newThisWeek = await this.prisma.tenant.count({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
    });

    return {
      totalTenants,
      activeTenants,
      trialTenants,
      suspendedTenants,
      mrr: Number(paidInvoices._sum.amount ?? 0),
      newTenantsThisWeek: newThisWeek,
      planDistribution: Object.fromEntries(planDist.map((p) => [p.plan, p._count])),
    };
  }

  async getTenants(query: { status?: TenantStatus; plan?: Plan; search?: string; page?: number; limit?: number }) {
    const { page: _page = 1, limit: _limit = 20, status, plan, search } = query;
    const page = Number(_page), limit = Number(_limit);
    const where: any = {};
    if (status) where.status = status;
    if (plan) where.plan = plan;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        include: { subscription: true, _count: { select: { users: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getTenantDetail(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        subscription: true,
        users: { include: { user: { select: { id: true, email: true, name: true } } } },
        invoices: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant topilmadi');

    const limits = PLAN_LIMITS[tenant.plan as PlanKey];

    let skuCount = 0;
    let orderCount = 0;
    try {
      const db = await this.tenantPrisma.getClient(tenant.slug) as any;
      [skuCount, orderCount] = await Promise.all([
        db.product.count({ where: { isActive: true } }),
        db.order.count({
          where: { createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
        }),
      ]);
    } catch { /* tenant schema may not exist yet */ }

    return {
      ...tenant,
      usage: {
        skus: { current: skuCount, limit: limits.maxSkus, percent: Math.round((skuCount / limits.maxSkus) * 100) },
        users: { current: tenant.users.length, limit: limits.maxUsers, percent: Math.round((tenant.users.length / limits.maxUsers) * 100) },
        orders: { current: orderCount, limit: limits.maxMonthlyOrders, percent: Math.round((orderCount / limits.maxMonthlyOrders) * 100) },
      },
    };
  }

  async suspendTenant(id: string, reason: string) {
    return this.prisma.tenant.update({
      where: { id },
      data: { status: 'SUSPENDED', settings: { suspendReason: reason } as any },
    });
  }

  async activateTenant(id: string) {
    return this.prisma.tenant.update({ where: { id }, data: { status: 'ACTIVE' } });
  }

  async changePlan(id: string, plan: Plan) {
    const limits = PLAN_LIMITS[plan];
    return this.prisma.tenant.update({
      where: { id },
      data: { plan, maxSkus: limits.maxSkus, maxUsers: limits.maxUsers, maxMonthlyOrders: limits.maxMonthlyOrders },
    });
  }

  async extendTrial(id: string, days: number) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException();
    const newEnd = new Date(tenant.trialEndsAt);
    newEnd.setDate(newEnd.getDate() + days);
    return this.prisma.tenant.update({ where: { id }, data: { trialEndsAt: newEnd } });
  }

  async getMrrChart(months: number = 12) {
    const result = [];
    for (let i = months - 1; i >= 0; i--) {
      const start = new Date();
      start.setMonth(start.getMonth() - i, 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);

      const agg = await this.prisma.invoice.aggregate({
        where: { status: 'PAID', paidAt: { gte: start, lt: end } },
        _sum: { amount: true },
      });

      result.push({
        month: start.toISOString().slice(0, 7),
        mrr: Number(agg._sum.amount ?? 0),
      });
    }
    return result;
  }

  async getSystemHealth() {
    return {
      database: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
