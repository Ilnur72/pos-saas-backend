import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

@Injectable()
export class SuppliersService {
  constructor(private tenantPrisma: TenantPrismaService) {}

  private async db(slug: string) {
    return this.tenantPrisma.getClient(slug) as any;
  }

  async findAll(tenantSlug: string, query: { search?: string; isActive?: boolean }) {
    const db = await this.db(tenantSlug);
    const where: any = {};
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.isActive !== undefined) where.isActive = query.isActive;
    return db.supplier.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findOne(tenantSlug: string, id: string) {
    const db = await this.db(tenantSlug);
    const s = await db.supplier.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Yetkazib beruvchi topilmadi');
    return s;
  }

  async create(tenantSlug: string, dto: any) {
    const db = await this.db(tenantSlug);
    return db.supplier.create({ data: dto });
  }

  async update(tenantSlug: string, id: string, dto: any) {
    const db = await this.db(tenantSlug);
    await this.findOne(tenantSlug, id);
    return db.supplier.update({ where: { id }, data: dto });
  }

  async remove(tenantSlug: string, id: string) {
    const db = await this.db(tenantSlug);
    return db.supplier.update({ where: { id }, data: { isActive: false } });
  }
}
