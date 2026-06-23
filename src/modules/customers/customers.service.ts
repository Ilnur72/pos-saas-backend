import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

@Injectable()
export class CustomersService {
  constructor(private tenantPrisma: TenantPrismaService) {}

  private async db(slug: string) {
    return this.tenantPrisma.getClient(slug) as any;
  }

  async findAll(tenantSlug: string, query: { search?: string; page?: number; limit?: number }) {
    const db = await this.db(tenantSlug);
    const { page: _page = 1, limit: _limit = 20, search } = query;
    const page = Number(_page), limit = Number(_limit);
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      db.customer.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { totalSpent: 'desc' } }),
      db.customer.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(tenantSlug: string, id: string) {
    const db = await this.db(tenantSlug);
    const c = await db.customer.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Mijoz topilmadi');
    return c;
  }

  async getOrders(tenantSlug: string, id: string, query: { page?: number; limit?: number }) {
    const db = await this.db(tenantSlug);
    const { page: _p2 = 1, limit: _l2 = 10 } = query;
    const page = Number(_p2), limit = Number(_l2);
    await this.findOne(tenantSlug, id);

    const [data, total] = await Promise.all([
      db.order.findMany({
        where: { customerId: id },
        include: { items: { include: { product: { select: { name: true, sku: true } } } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.order.count({ where: { customerId: id } }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
