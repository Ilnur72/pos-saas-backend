import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import slugify from 'slugify';

@Injectable()
export class CategoriesService {
  constructor(private tenantPrisma: TenantPrismaService) {}

  private async db(slug: string) {
    return this.tenantPrisma.getClient(slug) as any;
  }

  async findAll(tenantSlug: string) {
    const db = await this.db(tenantSlug);
    return db.category.findMany({
      where: { isActive: true },
      include: { _count: { select: { products: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  // Nested tree — har bir kategoriya o'z children'lari bilan
  async getTree(tenantSlug: string) {
    const db = await this.db(tenantSlug);
    const all = await db.category.findMany({
      where: { isActive: true },
      include: { _count: { select: { products: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const map = new Map<string, any>();
    all.forEach((c: any) => map.set(c.id, { ...c, children: [] }));

    const roots: any[] = [];
    map.forEach((node) => {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  async findOne(tenantSlug: string, id: string) {
    const db = await this.db(tenantSlug);
    const cat = await db.category.findUnique({
      where: { id },
      include: { children: true, parent: true },
    });
    if (!cat) throw new NotFoundException('Kategoriya topilmadi');
    return cat;
  }

  async create(tenantSlug: string, dto: { name: string; parentId?: string; description?: string; imageUrl?: string; sortOrder?: number }) {
    const db = await this.db(tenantSlug);
    const slug = await this.generateSlug(db, dto.name);
    return db.category.create({ data: { ...dto, slug } });
  }

  async update(tenantSlug: string, id: string, dto: Partial<{ name: string; parentId: string; description: string; imageUrl: string; sortOrder: number; isActive: boolean }>) {
    const db = await this.db(tenantSlug);
    await this.findOne(tenantSlug, id);
    return db.category.update({ where: { id }, data: dto });
  }

  async remove(tenantSlug: string, id: string) {
    const db = await this.db(tenantSlug);
    return db.category.update({ where: { id }, data: { isActive: false } });
  }

  private async generateSlug(db: any, name: string): Promise<string> {
    const base = slugify(name, { lower: true, strict: true });
    let slug = base;
    let i = 0;
    while (await db.category.findUnique({ where: { slug } })) {
      slug = `${base}-${++i}`;
    }
    return slug;
  }
}
