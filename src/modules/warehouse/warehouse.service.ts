import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

@Injectable()
export class WarehouseService {
  constructor(private tenantPrisma: TenantPrismaService) {}

  private async db(slug: string) {
    return this.tenantPrisma.getClient(slug) as any;
  }

  async getStock(tenantSlug: string, query: { search?: string; lowStock?: boolean }) {
    const db = await this.db(tenantSlug);

    const products = await db.product.findMany({
      where: {
        isActive: true,
        ...(query.search
          ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { sku: { contains: query.search } }] }
          : {}),
      },
      select: { id: true, name: true, sku: true, minStockLevel: true, imageUrls: true },
    });

    const txGroups = await db.warehouseTransaction.groupBy({
      by: ['productId'],
      _sum: { qty: true },
    });

    const stockMap = new Map<string, number>(
      txGroups.map((g: any) => [g.productId, g._sum.qty ?? 0]),
    );

    const result = products.map((p: any) => ({
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      imageUrl: p.imageUrls[0] ?? null,
      totalQty: stockMap.get(p.id) ?? 0,
      minStockLevel: p.minStockLevel,
      isLowStock: p.minStockLevel > 0 && (stockMap.get(p.id) ?? 0) <= p.minStockLevel,
    }));

    if (query.lowStock) return result.filter((r: any) => r.isLowStock);
    return result;
  }

  async getStockDetail(tenantSlug: string, productId: string) {
    const db = await this.db(tenantSlug);
    const product = await db.product.findUnique({
      where: { id: productId },
      include: { variants: true },
    });
    if (!product) throw new NotFoundException('Mahsulot topilmadi');

    const agg = await db.warehouseTransaction.aggregate({
      where: { productId },
      _sum: { qty: true },
    });

    const variantStocks = await db.warehouseTransaction.groupBy({
      by: ['variantId'],
      where: { productId, variantId: { not: null } },
      _sum: { qty: true },
    });

    return {
      product,
      totalQty: agg._sum.qty ?? 0,
      variantStocks,
    };
  }

  async getTransactions(tenantSlug: string, query: { type?: string; productId?: string; supplierId?: string; from?: string; to?: string; page?: number; limit?: number }) {
    const db = await this.db(tenantSlug);
    const { page: _page = 1, limit: _limit = 20, type, productId, supplierId, from, to } = query;
    const page = Number(_page), limit = Number(_limit);

    const where: any = {};
    if (type) where.type = type;
    if (productId) where.productId = productId;
    if (supplierId) where.supplierId = supplierId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      db.warehouseTransaction.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true } },
          supplier: { select: { id: true, name: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.warehouseTransaction.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async purchase(tenantSlug: string, dto: { productId: string; variantId?: string; qty: number; unitCost?: number; supplierId?: string; note?: string }, createdBy: string) {
    const db = await this.db(tenantSlug);
    if (dto.qty <= 0) throw new BadRequestException('Miqdor musbat bo\'lishi kerak');

    const tx = await db.warehouseTransaction.create({
      data: { ...dto, type: 'PURCHASE', createdBy },
    });

    // O'rtacha tannarx hisoblash: (eski_stok*eski_cost + yangi_qty*yangi_cost) / (eski_stok + yangi_qty)
    if (dto.unitCost != null && dto.unitCost > 0) {
      const product = await db.product.findUnique({
        where: { id: dto.productId },
        select: { costPrice: true },
      });
      const agg = await db.warehouseTransaction.aggregate({
        where: { productId: dto.productId, NOT: { id: tx.id } },
        _sum: { qty: true },
      });
      const oldStock = Number(agg._sum?.qty ?? 0);
      const oldCost = Number(product?.costPrice ?? 0);
      const newQty = dto.qty;
      const newCost = dto.unitCost;

      let avgCost = newCost;
      if (oldStock > 0 && oldCost > 0) {
        avgCost = (oldStock * oldCost + newQty * newCost) / (oldStock + newQty);
      }

      await db.product.update({
        where: { id: dto.productId },
        data: { costPrice: Math.round(avgCost * 100) / 100 },
      });
    }

    return tx;
  }

  async adjustment(tenantSlug: string, dto: { productId: string; variantId?: string; actualQty: number; note: string }, createdBy: string) {
    const db = await this.db(tenantSlug);
    if (!dto.note) throw new BadRequestException('Izoh majburiy');

    const agg = await db.warehouseTransaction.aggregate({
      where: { productId: dto.productId },
      _sum: { qty: true },
    });
    const current = agg._sum.qty ?? 0;
    const diff = dto.actualQty - current;

    return db.warehouseTransaction.create({
      data: {
        productId: dto.productId,
        variantId: dto.variantId ?? null,
        type: 'ADJUSTMENT',
        qty: diff,
        note: dto.note,
        createdBy,
      },
    });
  }

  async getMovementReport(tenantSlug: string, from: string, to: string) {
    const db = await this.db(tenantSlug);

    const data = await db.warehouseTransaction.groupBy({
      by: ['productId', 'type'],
      where: { createdAt: { gte: new Date(from), lte: new Date(to) } },
      _sum: { qty: true },
    });

    return data;
  }

  async getLowStock(tenantSlug: string) {
    return this.getStock(tenantSlug, { lowStock: true });
  }

  // Ombor jami qiymati: sum(currentStock * costPrice) — tannarx bo'yicha
  async getInventoryValue(tenantSlug: string) {
    const db = await this.db(tenantSlug);

    const products = await db.product.findMany({
      where: { isActive: true },
      select: { id: true, name: true, sku: true, costPrice: true, basePrice: true, salePrice: true, minStockLevel: true, category: { select: { id: true, name: true } } },
    });

    const stockGroups = await db.warehouseTransaction.groupBy({
      by: ['productId'],
      _sum: { qty: true },
    });
    const stockMap = new Map<string, number>(
      stockGroups.map((g: any) => [g.productId, Number(g._sum?.qty ?? 0)]),
    );

    let totalCostValue = 0;
    let totalSaleValue = 0;
    let totalQty = 0;
    let lowStockCount = 0;

    const items = products.map((p: any) => {
      const qty = stockMap.get(p.id) ?? 0;
      const costPrice = Number(p.costPrice ?? 0);
      const salePrice = Number(p.salePrice ?? p.basePrice);
      const costValue = qty * costPrice;
      const saleValue = qty * salePrice;
      const potentialProfit = saleValue - costValue;

      totalCostValue += costValue;
      totalSaleValue += saleValue;
      totalQty += qty;
      if (p.minStockLevel > 0 && qty <= p.minStockLevel) lowStockCount++;

      return {
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        category: p.category?.name ?? null,
        qty,
        costPrice,
        salePrice,
        costValue,
        saleValue,
        potentialProfit,
        isLowStock: p.minStockLevel > 0 && qty <= p.minStockLevel,
      };
    }).filter((i: any) => i.qty > 0).sort((a: any, b: any) => b.costValue - a.costValue);

    // Kategoriya bo'yicha agregatsiya
    const byCategory = new Map<string, { name: string; costValue: number; saleValue: number; qty: number; productsCount: number }>();
    for (const item of items) {
      const key = item.category ?? 'Kategoriyasiz';
      const existing = byCategory.get(key) ?? { name: key, costValue: 0, saleValue: 0, qty: 0, productsCount: 0 };
      existing.costValue += item.costValue;
      existing.saleValue += item.saleValue;
      existing.qty += item.qty;
      existing.productsCount++;
      byCategory.set(key, existing);
    }

    return {
      summary: {
        totalCostValue: Math.round(totalCostValue),
        totalSaleValue: Math.round(totalSaleValue),
        potentialProfit: Math.round(totalSaleValue - totalCostValue),
        totalQty,
        productsCount: items.length,
        lowStockCount,
      },
      byCategory: Array.from(byCategory.values()).sort((a, b) => b.costValue - a.costValue),
      items,
    };
  }
}
