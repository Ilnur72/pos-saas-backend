import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import slugify from 'slugify';
import { v4 as uuid } from 'uuid';

@Injectable()
export class ProductsService {
  constructor(private tenantPrisma: TenantPrismaService) {}

  private async db(slug: string) {
    return this.tenantPrisma.getClient(slug) as any;
  }

  async findAll(tenantSlug: string, query: ProductQueryDto) {
    const db = await this.db(tenantSlug);
    const { page: _page = 1, limit: _limit = 20, search, categoryId, isActive, isFeatured, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const page = Number(_page), limit = Number(_limit);

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (categoryId) where.categoryId = categoryId;
    if (isActive !== undefined) where.isActive = isActive;
    if (isFeatured !== undefined) where.isFeatured = isFeatured;

    const [data, total] = await Promise.all([
      db.product.findMany({
        where,
        include: { category: { select: { id: true, name: true, slug: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      db.product.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(tenantSlug: string, id: string) {
    const db = await this.db(tenantSlug);
    const product = await db.product.findUnique({
      where: { id },
      include: {
        category: true,
        variants: true,
      },
    });
    if (!product) throw new NotFoundException('Mahsulot topilmadi');
    return product;
  }

  async findBySlug(tenantSlug: string, slug: string) {
    const db = await this.db(tenantSlug);
    const product = await db.product.findUnique({
      where: { slug },
      include: { category: true, variants: true },
    });
    if (!product) throw new NotFoundException('Mahsulot topilmadi');
    return product;
  }

  async create(tenantSlug: string, dto: CreateProductDto, createdBy: string) {
    const db = await this.db(tenantSlug);
    const sku = dto.sku ?? `SKU-${uuid().slice(0, 6).toUpperCase()}`;
    const slug = await this.generateUniqueSlug(db, dto.name);
    const { variants, ...productData } = dto;

    return db.product.create({
      data: {
        ...productData,
        sku,
        slug,
        variants: variants?.length
          ? {
              create: variants.map((v) => ({
                ...v,
                sku: v.sku ?? `${sku}-${uuid().slice(0, 4).toUpperCase()}`,
              })),
            }
          : undefined,
      },
      include: { category: true, variants: true },
    });
  }

  async update(tenantSlug: string, id: string, dto: Partial<CreateProductDto>) {
    const db = await this.db(tenantSlug);
    await this.findOne(tenantSlug, id);
    // Strip read-only and relation fields that Prisma doesn't accept in update data
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { variants, id: _id, createdAt, updatedAt, category, abcAnalysis, warehouseTransactions, orderItems, purchaseOrderItems, autoOrderRules, priceRules, ...data } = dto as any;
    return db.product.update({ where: { id }, data, include: { category: true, variants: true } });
  }

  async remove(tenantSlug: string, id: string) {
    const db = await this.db(tenantSlug);
    await this.findOne(tenantSlug, id);
    return db.product.update({ where: { id }, data: { isActive: false } });
  }

  async createVariant(tenantSlug: string, productId: string, dto: any) {
    const db = await this.db(tenantSlug);
    await this.findOne(tenantSlug, productId);
    const sku = dto.sku ?? `VAR-${uuid().slice(0, 6).toUpperCase()}`;
    return db.productVariant.create({ data: { ...dto, sku, productId } });
  }

  async updateVariant(tenantSlug: string, productId: string, variantId: string, dto: any) {
    const db = await this.db(tenantSlug);
    return db.productVariant.update({
      where: { id: variantId, productId },
      data: dto,
    });
  }

  async removeVariant(tenantSlug: string, productId: string, variantId: string) {
    const db = await this.db(tenantSlug);
    return db.productVariant.delete({ where: { id: variantId, productId } });
  }

  private async generateUniqueSlug(db: any, name: string): Promise<string> {
    const base = slugify(name, { lower: true, strict: true });
    let slug = base;
    let i = 0;
    while (await db.product.findUnique({ where: { slug } })) {
      slug = `${base}-${++i}`;
    }
    return slug;
  }
}
