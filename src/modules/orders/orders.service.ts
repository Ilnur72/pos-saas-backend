import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { format } from 'date-fns';

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING:    ['CONFIRMED', 'CANCELLED'],
  CONFIRMED:  ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED'],
  SHIPPED:    ['DELIVERED'],
  DELIVERED:  ['REFUNDED'],
  CANCELLED:  [],
  REFUNDED:   [],
};

@Injectable()
export class OrdersService {
  constructor(private tenantPrisma: TenantPrismaService) {}

  private async db(slug: string) {
    return this.tenantPrisma.getClient(slug) as any;
  }

  async findAll(tenantSlug: string, query: { status?: string; paymentStatus?: string; customerId?: string; from?: string; to?: string; search?: string; page?: number; limit?: number }) {
    const db = await this.db(tenantSlug);
    const { page: _page = 1, limit: _limit = 20, status, paymentStatus, customerId, from, to, search } = query;
    const page = Number(_page), limit = Number(_limit);

    const where: any = {};
    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (customerId) where.customerId = customerId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search } },
        { customerName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      db.order.findMany({
        where,
        include: { customer: true, items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.order.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(tenantSlug: string, id: string) {
    const db = await this.db(tenantSlug);
    const order = await db.order.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { include: { product: true, variant: true } },
      },
    });
    if (!order) throw new NotFoundException('Buyurtma topilmadi');
    return order;
  }

  async create(tenantSlug: string, dto: { customerName: string; customerPhone: string; customerEmail?: string; deliveryMethod?: string; paymentMethod?: string; note?: string; items: { productId: string; variantId?: string; qty: number }[] }, createdBy: string) {
    const db = await this.db(tenantSlug);

    const productIds = dto.items.map((i) => i.productId);
    const products = await db.product.findMany({
      where: { id: { in: productIds }, isActive: true },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('Bir yoki bir nechta mahsulot topilmadi');
    }

    const stockAgg = await db.warehouseTransaction.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _sum: { qty: true },
    });
    const stockMap = new Map<string, number>(
      stockAgg.map((g: any) => [g.productId, g._sum.qty ?? 0]),
    );

    for (const item of dto.items) {
      const available = stockMap.get(item.productId) ?? 0;
      if (available < item.qty) {
        const p = products.find((p: any) => p.id === item.productId);
        throw new UnprocessableEntityException({
          message: 'Yetarli stok yo\'q',
          productId: item.productId,
          productName: p?.name,
          available,
          requested: item.qty,
        });
      }
    }

    const productMap = new Map(products.map((p: any) => [p.id, p]));
    let subtotal = 0;
    const orderItems = dto.items.map((item) => {
      const p: any = productMap.get(item.productId);
      const unitPrice = Number(p.salePrice ?? p.basePrice);
      const totalPrice = unitPrice * item.qty;
      subtotal += totalPrice;
      return { ...item, unitPrice, totalPrice, productSnapshot: { name: p.name, sku: p.sku, imageUrl: p.imageUrls[0] ?? null } };
    });

    const orderNumber = await this.generateOrderNumber(db);

    return db.$transaction(async (tx: any) => {
      const order = await tx.order.create({
        data: {
          orderNumber,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          customerEmail: dto.customerEmail ?? null,
          deliveryMethod: (dto.deliveryMethod as any) ?? 'PICKUP',
          paymentMethod: (dto.paymentMethod as any) ?? 'CASH',
          subtotal,
          totalAmount: subtotal,
          createdBy,
          items: { create: orderItems },
        },
        include: { items: true },
      });

      for (const item of dto.items) {
        await tx.warehouseTransaction.create({
          data: { productId: item.productId, variantId: item.variantId ?? null, type: 'SALE', qty: -item.qty, orderId: order.id, createdBy },
        });
      }

      const customer = await tx.customer.upsert({
        where: { phone: dto.customerPhone },
        update: {
          totalOrders: { increment: 1 },
          totalSpent: { increment: subtotal },
          lastOrderAt: new Date(),
        },
        create: {
          name: dto.customerName,
          phone: dto.customerPhone,
          email: dto.customerEmail ?? null,
          totalOrders: 1,
          totalSpent: subtotal,
          lastOrderAt: new Date(),
        },
      });

      return tx.order.update({
        where: { id: order.id },
        data: { customerId: customer.id },
        include: { items: true, customer: true },
      });
    });
  }

  async updateStatus(tenantSlug: string, id: string, status: string) {
    const db = await this.db(tenantSlug);
    const order = await this.findOne(tenantSlug, id);

    if (!VALID_TRANSITIONS[order.status]?.includes(status)) {
      throw new BadRequestException(`${order.status} → ${status} o'tish mumkin emas`);
    }

    return db.order.update({ where: { id }, data: { status } });
  }

  async updatePayment(tenantSlug: string, id: string, dto: { paymentStatus: string; paymentMethod?: string; paidAt?: string }) {
    const db = await this.db(tenantSlug);
    await this.findOne(tenantSlug, id);
    return db.order.update({
      where: { id },
      data: {
        paymentStatus: dto.paymentStatus,
        paymentMethod: dto.paymentMethod,
        paidAt: dto.paymentStatus === 'PAID' ? (dto.paidAt ? new Date(dto.paidAt) : new Date()) : null,
      },
    });
  }

  async cancel(tenantSlug: string, id: string, createdBy: string) {
    const db = await this.db(tenantSlug);
    const order = await this.findOne(tenantSlug, id);

    if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
      throw new BadRequestException('Faqat PENDING yoki CONFIRMED buyurtmani bekor qilish mumkin');
    }

    return db.$transaction(async (tx: any) => {
      for (const item of order.items) {
        await tx.warehouseTransaction.create({
          data: { productId: item.productId, variantId: item.variantId ?? null, type: 'RETURN', qty: item.qty, orderId: id, note: 'Bekor qilindi', createdBy },
        });
      }
      return tx.order.update({ where: { id }, data: { status: 'CANCELLED' } });
    });
  }

  private async generateOrderNumber(db: any): Promise<string> {
    const today = format(new Date(), 'yyyyMMdd');
    const count = await db.order.count({ where: { orderNumber: { startsWith: `ORD-${today}` } } });
    return `ORD-${today}-${String(count + 1).padStart(4, '0')}`;
  }
}
