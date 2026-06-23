import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { PrismaService } from '../../prisma/prisma.service';

const QR_METHODS = ['PAYME', 'CLICK', 'UZUM'];

@Injectable()
export class KassaService {
  constructor(
    private tenantPrisma: TenantPrismaService,
    private telegram: TelegramService,
    private prisma: PrismaService,
  ) {}

  private async db(slug: string) {
    return this.tenantPrisma.getClient(slug) as any;
  }

  // ─── Session ─────────────────────────────────────────────────────────────

  async getCurrentSession(tenantSlug: string) {
    const db = await this.db(tenantSlug);
    return db.kassaSession.findFirst({ where: { status: 'OPEN' }, orderBy: { openedAt: 'desc' } });
  }

  async openSession(tenantSlug: string, userId: string, openingCash: number) {
    const db = await this.db(tenantSlug);
    const existing = await db.kassaSession.findFirst({ where: { status: 'OPEN' } });
    if (existing) throw new BadRequestException('Allaqachon ochiq smena mavjud');
    return db.kassaSession.create({
      data: { openedBy: userId, openingCash, status: 'OPEN' },
    });
  }

  async closeSession(tenantSlug: string, userId: string, sessionId: string, closingCash: number, notes?: string) {
    const db = await this.db(tenantSlug);
    const session = await db.kassaSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Smena topilmadi');
    if (session.status === 'CLOSED') throw new BadRequestException('Smena allaqachon yopilgan');

    // Kutilayotgan kassa = boshlang'ich naqd + naqd sotuvlar − naqd chiqimlar
    const openingCash = Number(session.openingCash ?? 0);
    const totalCash = Number(session.totalCash ?? 0);
    const totalExpenses = Number(session.totalExpenses ?? 0);
    const expectedCash = openingCash + totalCash - totalExpenses;
    const difference = closingCash - expectedCash;

    const updated = await db.kassaSession.update({
      where: { id: sessionId },
      data: {
        status: 'CLOSED',
        closedBy: userId,
        closedAt: new Date(),
        closingCash,
        expectedCash: Math.round(expectedCash * 100) / 100,
        difference: Math.round(difference * 100) / 100,
        notes,
      },
    });

    // Telegram xabari (background — kutmaymiz)
    this.notifyShiftClosed(tenantSlug, updated, userId, expectedCash, difference).catch(() => {});

    return updated;
  }

  private async notifyShiftClosed(tenantSlug: string, session: any, userId: string, expectedCash: number, difference: number) {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      const openedAt = new Date(session.openedAt).getTime();
      const closedAt = Date.now();
      const durationHours = (closedAt - openedAt) / (1000 * 60 * 60);

      await this.telegram.notifyShiftClosed(tenantSlug, {
        cashierName: user?.name ?? 'Noma\'lum',
        durationHours,
        totalSales: Number(session.totalSales ?? 0),
        expectedCash,
        closingCash: Number(session.closingCash ?? 0),
        difference,
      });
    } catch { /* ignore */ }
  }

  async getSessionStats(tenantSlug: string, sessionId: string) {
    const db = await this.db(tenantSlug);
    const session = await db.kassaSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Smena topilmadi');

    const openingCash = Number(session.openingCash ?? 0);
    const totalCash = Number(session.totalCash ?? 0);
    const totalExpenses = Number(session.totalExpenses ?? 0);
    const expectedCash = openingCash + totalCash - totalExpenses;

    return { ...session, expectedCash: Math.round(expectedCash * 100) / 100 };
  }

  // ─── Products search ──────────────────────────────────────────────────────

  async searchProducts(tenantSlug: string, q: string, categoryId?: string) {
    const db = await this.db(tenantSlug);
    const where: any = { isActive: true };
    if (q) {
      where.OR = [
        { barcode: q },                                       // to'liq barcode (EAN-13)
        { sku: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (categoryId) where.categoryId = categoryId;

    const products = await db.product.findMany({
      where,
      include: { category: { select: { id: true, name: true } } },
      take: 60,
      orderBy: { name: 'asc' },
    });

    // Hozirgi stok
    const stockGroups = await db.warehouseTransaction.groupBy({
      by: ['productId'],
      where: { productId: { in: products.map((p: any) => p.id) } },
      _sum: { qty: true },
    });
    const stockMap = new Map<string, number>(
      stockGroups.map((g: any) => [g.productId, Number(g._sum?.qty ?? 0)]),
    );

    return products.map((p: any) => ({
      ...p,
      currentStock: stockMap.get(p.id) ?? 0,
      basePrice: Number(p.basePrice),
      salePrice: p.salePrice != null ? Number(p.salePrice) : null,
      wholesalePrice: p.wholesalePrice != null ? Number(p.wholesalePrice) : null,
      wholesaleMinQty: Number(p.wholesaleMinQty ?? 0),
    }));
  }

  // ─── Checkout ─────────────────────────────────────────────────────────────

  async checkout(
    tenantSlug: string,
    userId: string,
    dto: {
      items: { productId: string; qty: number; unitPrice: number }[];
      paymentMethod: string;
      sessionId?: string;
      customerName?: string;
      customerPhone?: string;
      tendered?: number;
      discount?: number;
      note?: string;
    },
  ) {
    const db = await this.db(tenantSlug);

    if (!dto.items?.length) throw new BadRequestException('Savat bo\'sh');

    // Stock tekshirish
    for (const item of dto.items) {
      const stock = await db.warehouseTransaction.aggregate({
        where: { productId: item.productId },
        _sum: { qty: true },
      });
      const available = Number(stock._sum?.qty ?? 0);
      if (available < item.qty) {
        const product = await db.product.findUnique({ where: { id: item.productId }, select: { name: true } });
        throw new BadRequestException(`"${product?.name}" uchun yetarli stok yo'q (mavjud: ${available}, kerak: ${item.qty})`);
      }
    }

    const count = await db.order.count();
    const orderNumber = `KAS-${String(count + 1).padStart(6, '0')}`;

    // Sotuv paytidagi tannarxni saqlash uchun mahsulotlarni yuklash
    const productIds = dto.items.map((i) => i.productId);
    const productCosts = await db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, costPrice: true },
    });
    const costMap = new Map<string, number>(
      productCosts.map((p: any) => [p.id, Number(p.costPrice ?? 0)]),
    );

    let subtotal = 0;
    const itemsData = dto.items.map((item) => {
      const total = item.qty * item.unitPrice;
      subtotal += total;
      return {
        productId: item.productId,
        qty: item.qty,
        unitPrice: item.unitPrice,
        costPriceAtSale: costMap.get(item.productId) ?? 0,
        totalPrice: total,
        productSnapshot: {},
      };
    });

    const discount = dto.discount ?? 0;
    const totalAmount = Math.max(0, subtotal - discount);

    const order = await db.order.create({
      data: {
        orderNumber,
        status: 'DELIVERED',
        customerName: dto.customerName || 'Naqd mijoz',
        customerPhone: dto.customerPhone || '+998000000000',
        subtotal,
        discountAmount: discount,
        totalAmount,
        paymentMethod: dto.paymentMethod,
        paymentStatus: 'PAID',
        paidAt: new Date(),
        deliveryMethod: 'PICKUP',
        note: dto.note,
        createdBy: userId,
        items: { create: itemsData },
      },
      include: {
        items: {
          include: { product: { select: { name: true, sku: true, unit: true } } },
        },
      },
    });

    // SALE transactions
    for (const item of dto.items) {
      await db.warehouseTransaction.create({
        data: { productId: item.productId, type: 'SALE', qty: -item.qty, orderId: order.id, createdBy: userId },
      });
    }

    // Session stats yangilash
    if (dto.sessionId) {
      await db.kassaSession.update({
        where: { id: dto.sessionId },
        data: {
          totalSales: { increment: totalAmount },
          ordersCount: { increment: 1 },
          ...(dto.paymentMethod === 'CASH' && { totalCash: { increment: totalAmount } }),
          ...(dto.paymentMethod === 'CARD' && { totalCard: { increment: totalAmount } }),
          ...(QR_METHODS.includes(dto.paymentMethod) && { totalQr: { increment: totalAmount } }),
        },
      });
    }

    const change = dto.tendered ? Math.max(0, dto.tendered - totalAmount) : 0;
    return { order, totalAmount, change };
  }
}
