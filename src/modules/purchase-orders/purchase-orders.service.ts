import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { format } from 'date-fns';

@Injectable()
export class PurchaseOrdersService {
  constructor(private tenantPrisma: TenantPrismaService) {}

  private async db(slug: string) {
    return this.tenantPrisma.getClient(slug) as any;
  }

  // ─── Purchase Orders ────────────────────────────────────────────────────────

  async findAll(tenantSlug: string, query: { status?: string; supplierId?: string; from?: string; to?: string; page?: number; limit?: number }) {
    const db = await this.db(tenantSlug);
    const { page: _page = 1, limit: _limit = 20, status, supplierId, from, to } = query;
    const page = Number(_page), limit = Number(_limit);

    const where: any = {};
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      db.purchaseOrder.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true, phone: true, email: true } },
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.purchaseOrder.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(tenantSlug: string, id: string) {
    const db = await this.db(tenantSlug);
    const po = await db.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: { include: { product: { include: { category: true } } } },
      },
    });
    if (!po) throw new NotFoundException('Zakaz topilmadi');
    return po;
  }

  async create(tenantSlug: string, dto: { supplierId: string; expectedDelivery?: string; note?: string; items: { productId: string; variantId?: string; requestedQty: number; unitCost: number; note?: string }[] }, createdBy: string) {
    const db = await this.db(tenantSlug);
    if (!dto.items?.length) throw new BadRequestException('Kamida bitta mahsulot kerak');

    const orderNumber = await this.generatePoNumber(db);

    return db.purchaseOrder.create({
      data: {
        orderNumber,
        supplierId: dto.supplierId,
        expectedDelivery: dto.expectedDelivery ? new Date(dto.expectedDelivery) : null,
        note: dto.note ?? null,
        createdBy,
        items: {
          create: dto.items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId ?? null,
            requestedQty: i.requestedQty,
            unitCost: i.unitCost,
            note: i.note ?? null,
          })),
        },
      },
      include: { supplier: true, items: { include: { product: true } } },
    });
  }

  async approve(tenantSlug: string, id: string, approvedBy: string) {
    const db = await this.db(tenantSlug);
    const po = await this.findOne(tenantSlug, id);
    if (po.status !== 'DRAFT') throw new BadRequestException('Faqat DRAFT zakazni tasdiqlash mumkin');

    return db.purchaseOrder.update({
      where: { id },
      data: { status: 'SENT', approvedBy },
      include: { supplier: true, items: { include: { product: true } } },
    });
  }

  async receive(tenantSlug: string, id: string, items: { itemId: string; receivedQty: number; unitCost?: number }[], createdBy: string) {
    const db = await this.db(tenantSlug);
    const po = await this.findOne(tenantSlug, id);
    if (!['SENT', 'CONFIRMED'].includes(po.status)) throw new BadRequestException('Faqat SENT yoki CONFIRMED zakazni qabul qilish mumkin');

    return db.$transaction(async (tx: any) => {
      for (const recv of items) {
        const poItem = po.items.find((i: any) => i.id === recv.itemId);
        if (!poItem) continue;

        await tx.purchaseOrderItem.update({
          where: { id: recv.itemId },
          data: { receivedQty: recv.receivedQty, unitCost: recv.unitCost ?? poItem.unitCost },
        });

        await tx.warehouseTransaction.create({
          data: {
            productId: poItem.productId,
            variantId: poItem.variantId ?? null,
            type: 'PURCHASE',
            qty: recv.receivedQty,
            unitCost: recv.unitCost ?? poItem.unitCost,
            note: `PO: ${po.orderNumber}`,
            createdBy,
          },
        });
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: { status: 'RECEIVED' },
        include: { supplier: true, items: { include: { product: true } } },
      });
    });
  }

  async cancel(tenantSlug: string, id: string) {
    const db = await this.db(tenantSlug);
    const po = await this.findOne(tenantSlug, id);
    if (po.status === 'RECEIVED') throw new BadRequestException('Qabul qilingan zakazni bekor qilish mumkin emas');

    return db.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  // ─── Auto-Generate from AutoOrderRules ─────────────────────────────────────

  async autoGenerate(tenantSlug: string, createdBy: string) {
    const db = await this.db(tenantSlug);

    const rules = await db.autoOrderRule.findMany({
      where: { isActive: true },
      include: { product: true, supplier: true },
    });

    if (!rules.length) return { created: 0, pos: [] };

    const productIds = [...new Set(rules.map((r: any) => r.productId).filter(Boolean))];
    const stockAgg = await db.warehouseTransaction.groupBy({
      by: ['productId'],
      where: productIds.length ? { productId: { in: productIds } } : {},
      _sum: { qty: true },
    });
    const stockMap = new Map<string, number>(stockAgg.map((g: any) => [g.productId, g._sum.qty ?? 0]));

    // Group triggered rules by supplier
    const bySupplier = new Map<string, { supplierId: string; items: any[] }>();
    for (const rule of rules) {
      const stock = rule.productId ? (stockMap.get(rule.productId) ?? 0) : 0;
      if (rule.productId && stock >= rule.triggerQty) continue;

      if (!bySupplier.has(rule.supplierId)) {
        bySupplier.set(rule.supplierId, { supplierId: rule.supplierId, items: [] });
      }
      bySupplier.get(rule.supplierId)!.items.push({
        productId: rule.productId,
        requestedQty: rule.orderQty,
        unitCost: Number(rule.product?.basePrice ?? 0),
      });

      await db.autoOrderRule.update({ where: { id: rule.id }, data: { lastTriggeredAt: new Date() } });
    }

    const pos = [];
    for (const { supplierId, items } of bySupplier.values()) {
      if (!items.length) continue;
      const po = await this.create(tenantSlug, { supplierId, items }, createdBy);
      pos.push(po);
    }

    return { created: pos.length, pos };
  }

  // ─── Auto Order Rules ───────────────────────────────────────────────────────

  async getRules(tenantSlug: string) {
    const db = await this.db(tenantSlug);
    return db.autoOrderRule.findMany({
      include: { product: { select: { id: true, name: true, sku: true } }, supplier: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRule(tenantSlug: string, dto: { productId?: string; supplierId: string; triggerQty: number; orderQty: number; isActive?: boolean }) {
    const db = await this.db(tenantSlug);
    return db.autoOrderRule.create({
      data: {
        productId: dto.productId ?? null,
        supplierId: dto.supplierId,
        triggerQty: dto.triggerQty,
        orderQty: dto.orderQty,
        isActive: dto.isActive ?? true,
      },
      include: { product: { select: { id: true, name: true, sku: true } }, supplier: { select: { id: true, name: true } } },
    });
  }

  async updateRule(tenantSlug: string, id: string, dto: Partial<{ productId: string; supplierId: string; triggerQty: number; orderQty: number; isActive: boolean }>) {
    const db = await this.db(tenantSlug);
    return db.autoOrderRule.update({
      where: { id },
      data: dto,
      include: { product: { select: { id: true, name: true, sku: true } }, supplier: { select: { id: true, name: true } } },
    });
  }

  async deleteRule(tenantSlug: string, id: string) {
    const db = await this.db(tenantSlug);
    return db.autoOrderRule.delete({ where: { id } });
  }

  private async generatePoNumber(db: any): Promise<string> {
    const today = format(new Date(), 'yyyyMMdd');
    const count = await db.purchaseOrder.count({ where: { orderNumber: { startsWith: `PO-${today}` } } });
    return `PO-${today}-${String(count + 1).padStart(4, '0')}`;
  }
}
