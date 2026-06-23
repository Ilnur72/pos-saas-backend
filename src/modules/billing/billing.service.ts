import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PLAN_LIMITS, PlanKey, PLAN_NAMES } from '../../config/plans.config';
import { Plan } from '@prisma/client';

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  getPlans() {
    return Object.entries(PLAN_LIMITS).map(([key, limits]) => ({
      key,
      name: PLAN_NAMES[key as PlanKey],
      ...limits,
    }));
  }

  async getCurrentSubscription(tenantId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
    });
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return { subscription, invoices };
  }

  async subscribe(tenantId: string, plan: Plan, paymentMethod: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant topilmadi');

    const limits = PLAN_LIMITS[plan];
    const now = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const subscription = await this.prisma.subscription.upsert({
      where: { tenantId },
      update: { plan, status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: periodEnd },
      create: { tenantId, plan, status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: periodEnd },
    });

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        plan,
        status: 'ACTIVE',
        maxSkus: limits.maxSkus,
        maxUsers: limits.maxUsers,
        maxMonthlyOrders: limits.maxMonthlyOrders,
      },
    });

    if (limits.price > 0) {
      await this.prisma.invoice.create({
        data: {
          tenantId,
          subscriptionId: subscription.id,
          amount: limits.price,
          status: 'OPEN',
          dueDate: periodEnd,
          paymentMethod,
          items: [{ description: `${PLAN_NAMES[plan]} — oylik obuna`, amount: limits.price }],
        },
      });
    }

    return subscription;
  }

  async handlePaymentSuccess(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { subscription: true },
    });
    if (!invoice) throw new NotFoundException('Invoice topilmadi');

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'PAID', paidAt: new Date() },
    });

    await this.prisma.tenant.update({
      where: { id: invoice.tenantId },
      data: { status: 'ACTIVE' },
    });

    if (invoice.subscription) {
      const newEnd = new Date(invoice.subscription.currentPeriodEnd);
      newEnd.setMonth(newEnd.getMonth() + 1);
      await this.prisma.subscription.update({
        where: { id: invoice.subscriptionId! },
        data: { status: 'ACTIVE', currentPeriodEnd: newEnd },
      });
    }
  }

  async cancelSubscription(tenantId: string) {
    return this.prisma.subscription.update({
      where: { tenantId },
      data: { cancelAtPeriodEnd: true },
    });
  }

  async getInvoices(tenantId: string, query: { status?: string; page?: number; limit?: number }) {
    const { page: _page = 1, limit: _limit = 20, status } = query;
    const page = Number(_page), limit = Number(_limit);
    const where: any = { tenantId };
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async upgrade(tenantId: string, plan: Plan) {
    return this.subscribe(tenantId, plan, 'PAYME');
  }
}
