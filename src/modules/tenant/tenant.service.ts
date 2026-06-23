import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { PLAN_LIMITS, PlanKey } from '../../config/plans.config';
import { UpdateTenantSettingsDto, UpdateOnboardingDto, UpdateDomainDto } from './dto/update-tenant-settings.dto';

@Injectable()
export class TenantService {
  constructor(
    private prisma: PrismaService,
    private tenantPrisma: TenantPrismaService,
  ) {}

  async getMe(tenantSlug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      include: { subscription: true },
    });
    if (!tenant) throw new NotFoundException('Tenant topilmadi');

    const limits = PLAN_LIMITS[tenant.plan as PlanKey];
    const db = await this.tenantPrisma.getClient(tenantSlug);

    const [skuCount, orderCount] = await Promise.all([
      (db as any).product.count({ where: { isActive: true } }),
      (db as any).order.count({
        where: {
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    ]);

    const userCount = await this.prisma.tenantUser.count({
      where: { tenantId: tenant.id, isActive: true },
    });

    return {
      ...tenant,
      usage: {
        skus: { current: skuCount, limit: limits.maxSkus },
        users: { current: userCount, limit: limits.maxUsers },
        orders: { current: orderCount, limit: limits.maxMonthlyOrders },
      },
      onboardingStep: (tenant.settings as any)?.onboardingStep ?? 'STORE_INFO',
    };
  }

  async updateSettings(tenantSlug: string, dto: UpdateTenantSettingsDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) throw new NotFoundException();

    const settings = { ...(tenant.settings as object), ...dto };
    return this.prisma.tenant.update({
      where: { slug: tenantSlug },
      data: { settings },
    });
  }

  async updateOnboarding(tenantSlug: string, dto: UpdateOnboardingDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) throw new NotFoundException();

    const settings = { ...(tenant.settings as object), onboardingStep: dto.step };
    return this.prisma.tenant.update({
      where: { slug: tenantSlug },
      data: { settings },
    });
  }

  async updateDomain(tenantSlug: string, dto: UpdateDomainDto) {
    return this.prisma.tenant.update({
      where: { slug: tenantSlug },
      data: { domain: dto.domain },
    });
  }

  async getUsers(tenantSlug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) throw new NotFoundException();

    return this.prisma.tenantUser.findMany({
      where: { tenantId: tenant.id },
      include: { user: { select: { id: true, email: true, name: true, phone: true, createdAt: true } } },
    });
  }
}
