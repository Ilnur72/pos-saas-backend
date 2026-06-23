import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

@Injectable()
export class PriceRulesService {
  constructor(private tenantPrisma: TenantPrismaService) {}

  private async db(slug: string) {
    return this.tenantPrisma.getClient(slug) as any;
  }

  // ─── Price Rules ─────────────────────────────────────────────────────────────

  async findAll(tenantSlug: string) {
    const db = await this.db(tenantSlug);
    return db.priceRule.findMany({
      include: { products: { select: { id: true, name: true, sku: true } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(tenantSlug: string, dto: any) {
    const db = await this.db(tenantSlug);
    const { productIds, ...data } = dto;
    return db.priceRule.create({
      data: {
        ...data,
        value: Number(data.value),
        products: productIds?.length ? { connect: productIds.map((id: string) => ({ id })) } : undefined,
      },
      include: { products: { select: { id: true, name: true, sku: true } } },
    });
  }

  async update(tenantSlug: string, id: string, dto: any) {
    const db = await this.db(tenantSlug);
    const { productIds, ...data } = dto;
    if (data.value !== undefined) data.value = Number(data.value);
    return db.priceRule.update({
      where: { id },
      data: {
        ...data,
        products: productIds ? { set: productIds.map((pid: string) => ({ id: pid })) } : undefined,
      },
      include: { products: { select: { id: true, name: true, sku: true } } },
    });
  }

  async remove(tenantSlug: string, id: string) {
    const db = await this.db(tenantSlug);
    return db.priceRule.delete({ where: { id } });
  }

  async preview(tenantSlug: string, productIds: string[], ruleIds?: string[]) {
    const db = await this.db(tenantSlug);
    const products = await db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true, basePrice: true, salePrice: true },
    });

    const now = new Date();
    const rules = await db.priceRule.findMany({
      where: {
        isActive: true,
        OR: [{ startDate: null }, { startDate: { lte: now } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
        ...(ruleIds?.length ? { id: { in: ruleIds } } : {}),
      },
      orderBy: { priority: 'desc' },
    });

    return products.map((p: any) => {
      const base = Number(p.salePrice ?? p.basePrice);
      const finalPrice = this.applyRules(base, rules, p.id);
      return { ...p, originalPrice: base, finalPrice, discount: base - finalPrice, discountPct: Math.round((1 - finalPrice / base) * 100) };
    });
  }

  applyRules(price: number, rules: any[], productId?: string): number {
    const applicable = rules.filter((r) => {
      if (!r.isActive) return false;
      if (r.target === 'PRODUCT' && productId && !r.products?.some((p: any) => p.id === productId)) return false;
      return true;
    });

    const nonStackable = applicable.filter((r) => !r.stackable).sort((a: any, b: any) => b.priority - a.priority);
    const stackable = applicable.filter((r) => r.stackable).sort((a: any, b: any) => b.priority - a.priority);

    let result = price;
    if (nonStackable.length > 0) {
      result = this.applyRule(result, nonStackable[0]);
    }
    for (const rule of stackable) {
      result = this.applyRule(result, rule);
    }
    return Math.max(0, Math.round(result));
  }

  private applyRule(price: number, rule: any): number {
    const value = Number(rule.value);
    if (rule.type === 'SPECIAL_PRICE') return value;
    if (rule.type === 'PERCENT') {
      return rule.direction === 'DECREASE' ? price * (1 - value / 100) : price * (1 + value / 100);
    }
    return rule.direction === 'DECREASE' ? price - value : price + value;
  }

  // ─── Batch Operations ─────────────────────────────────────────────────────────

  async batchUpdate(tenantSlug: string, action: string, productIds: string[], data: any) {
    const db = await this.db(tenantSlug);
    let affected = 0;

    switch (action) {
      case 'UPDATE_PRICE': {
        const { type, value, direction } = data;
        const products = await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, basePrice: true, salePrice: true } });
        for (const p of products) {
          const base = Number(p.salePrice ?? p.basePrice);
          let newPrice: number;
          if (type === 'PERCENT') {
            newPrice = direction === 'INCREASE' ? base * (1 + value / 100) : base * (1 - value / 100);
          } else {
            newPrice = direction === 'INCREASE' ? base + value : base - value;
          }
          newPrice = Math.max(0, Math.round(newPrice));
          await db.product.update({ where: { id: p.id }, data: { salePrice: newPrice } });
          affected++;
        }
        break;
      }
      case 'UPDATE_CATEGORY':
        await db.product.updateMany({ where: { id: { in: productIds } }, data: { categoryId: data.categoryId } });
        affected = productIds.length;
        break;
      case 'UPDATE_STATUS':
        await db.product.updateMany({ where: { id: { in: productIds } }, data: { isActive: data.isActive } });
        affected = productIds.length;
        break;
      case 'UPDATE_MIN_STOCK':
        await db.product.updateMany({ where: { id: { in: productIds } }, data: { minStockLevel: Number(data.minStockLevel) } });
        affected = productIds.length;
        break;
    }

    return { affected };
  }
}
