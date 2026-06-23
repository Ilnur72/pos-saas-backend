import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class PublicService {
  constructor(
    private tenantPrisma: TenantPrismaService,
    private prisma: PrismaService,
    private telegram: TelegramService,
  ) {}

  private async db(slug: string) {
    return this.tenantPrisma.getClient(slug) as any;
  }

  async getTenantInfo(tenantSlug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug, status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { id: true, slug: true, name: true, logoUrl: true, settings: true },
    });
    if (!tenant) throw new NotFoundException('Do\'kon topilmadi');
    const settings = (tenant.settings as any) ?? {};
    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      logoUrl: tenant.logoUrl,
      phone: settings.storePhone ?? null,
      address: settings.storeAddress ?? null,
    };
  }

  async getCategories(tenantSlug: string) {
    const db = await this.db(tenantSlug);
    return db.category.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true, parentId: true, imageUrl: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getProducts(
    tenantSlug: string,
    params: { page?: number; limit?: number; search?: string; categoryId?: string; featured?: boolean },
  ) {
    const db = await this.db(tenantSlug);
    const { search, categoryId, featured } = params;
    const page = Number(params.page ?? 1);
    const limit = Number(params.limit ?? 20);

    const where: any = { isActive: true };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (categoryId) where.categoryId = categoryId;
    if (featured !== undefined) where.isFeatured = featured;

    const [products, total] = await Promise.all([
      db.product.findMany({
        where,
        select: {
          id: true, name: true, slug: true, sku: true,
          basePrice: true, salePrice: true, imageUrls: true, isFeatured: true,
          category: { select: { id: true, name: true, slug: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ isFeatured: 'desc' }, { name: 'asc' }],
      }),
      db.product.count({ where }),
    ]);

    // Stok holatini olish
    const productIds = products.map((p: any) => p.id);
    const stockGroups = await db.warehouseTransaction.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _sum: { qty: true },
    });
    const stockMap = new Map<string, number>(
      stockGroups.map((g: any) => [g.productId, Number(g._sum?.qty ?? 0)]),
    );

    const data = products.map((p: any) => ({
      ...p,
      basePrice: Number(p.basePrice),
      salePrice: p.salePrice != null ? Number(p.salePrice) : null,
      inStock: (stockMap.get(p.id) ?? 0) > 0,
    }));

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getProductBySlug(tenantSlug: string, productSlug: string) {
    const db = await this.db(tenantSlug);
    const product = await db.product.findFirst({
      where: { slug: productSlug, isActive: true },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        variants: { select: { id: true, name: true, sku: true, priceModifier: true, attributes: true } },
      },
    });
    if (!product) throw new NotFoundException('Mahsulot topilmadi');

    const agg = await db.warehouseTransaction.aggregate({
      where: { productId: product.id },
      _sum: { qty: true },
    });
    const stockQty = Number(agg._sum?.qty ?? 0);

    return {
      ...product,
      basePrice: Number(product.basePrice),
      salePrice: product.salePrice != null ? Number(product.salePrice) : null,
      stockQty,
      inStock: stockQty > 0,
      variants: product.variants.map((v: any) => ({ ...v, priceModifier: Number(v.priceModifier) })),
    };
  }

  async createOrder(
    tenantSlug: string,
    dto: {
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      shippingAddress?: Record<string, unknown>;
      deliveryMethod?: string;
      paymentMethod?: string;
      items: { productId: string; variantId?: string; qty: number }[];
      discountAmount?: number;
      shippingFee?: number;
      note?: string;
    },
  ) {
    const db = await this.db(tenantSlug);
    if (!dto.items?.length) throw new BadRequestException('Savatcha bo\'sh');

    const productIds = dto.items.map((i) => i.productId);
    const products = await db.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      select: { id: true, name: true, sku: true, basePrice: true, salePrice: true, imageUrls: true, costPrice: true },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException('Bir yoki bir nechta mahsulot topilmadi');
    }
    const productMap = new Map(products.map((p: any) => [p.id, p]));

    let subtotal = 0;
    const orderItemsData = dto.items.map((item) => {
      const product: any = productMap.get(item.productId);
      const unitPrice = Number(product.salePrice ?? product.basePrice);
      const totalPrice = unitPrice * item.qty;
      subtotal += totalPrice;
      return {
        productId: item.productId,
        variantId: item.variantId ?? null,
        qty: item.qty,
        unitPrice,
        costPriceAtSale: Number(product.costPrice ?? 0),
        totalPrice,
        productSnapshot: {
          name: product.name,
          sku: product.sku,
          imageUrl: product.imageUrls?.[0] ?? null,
        },
      };
    });

    const discountAmount = dto.discountAmount ?? 0;
    const shippingFee = dto.shippingFee ?? 0;
    const totalAmount = subtotal - discountAmount + shippingFee;

    // Customer upsert
    let customerId: string | null = null;
    if (dto.customerPhone) {
      const customer = await db.customer.upsert({
        where: { phone: dto.customerPhone },
        update: { name: dto.customerName },
        create: { name: dto.customerName, phone: dto.customerPhone, email: dto.customerEmail ?? null },
      });
      customerId = customer.id;
    }

    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
    const orderNumber = `ORD-${ymd}-${rand}`;

    const order = await db.order.create({
      data: {
        orderNumber,
        source: 'SHOP',
        status: 'PENDING',
        customerId,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        customerEmail: dto.customerEmail ?? null,
        shippingAddress: dto.shippingAddress ?? {},
        deliveryMethod: (dto.deliveryMethod as any) ?? 'PICKUP',
        paymentMethod: (dto.paymentMethod as any) ?? 'CASH',
        paymentStatus: 'UNPAID',
        subtotal,
        discountAmount,
        shippingFee,
        totalAmount,
        note: dto.note ?? null,
        createdBy: 'shop',
        items: { create: orderItemsData },
      },
      include: { items: true },
    });

    // Stok yangilash (SALE transactions)
    for (const item of order.items) {
      await db.warehouseTransaction.create({
        data: {
          productId: item.productId,
          variantId: item.variantId,
          type: 'SALE',
          qty: -item.qty,
          orderId: order.id,
          createdBy: 'shop',
        },
      });
    }

    // Telegram (background)
    this.telegram.sendBySlug(
      tenantSlug,
      `🛒 <b>Yangi onlayn buyurtma</b>\n📋 ${order.orderNumber}\n👤 ${order.customerName} · ${order.customerPhone}\n💰 ${new Intl.NumberFormat('uz-UZ').format(Number(order.totalAmount))} so'm\n📦 ${order.items.length} ta mahsulot`,
    ).catch(() => {});

    return order;
  }

  async getOrderStatus(tenantSlug: string, orderNumber: string) {
    const db = await this.db(tenantSlug);
    const order = await db.order.findUnique({
      where: { orderNumber },
      select: {
        id: true, orderNumber: true, status: true,
        paymentStatus: true, paymentMethod: true,
        totalAmount: true, createdAt: true,
        items: { select: { qty: true, unitPrice: true, totalPrice: true, productSnapshot: true } },
      },
    });
    if (!order) throw new NotFoundException('Buyurtma topilmadi');
    return {
      ...order,
      totalAmount: Number(order.totalAmount),
      items: order.items.map((i: any) => ({
        ...i,
        unitPrice: Number(i.unitPrice),
        totalPrice: Number(i.totalPrice),
      })),
    };
  }
}
