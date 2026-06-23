import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

const VALID_CATEGORIES = ['RENT', 'SALARY', 'UTILITY', 'PURCHASE', 'TAX', 'TRANSPORT', 'OTHER'];

@Injectable()
export class ExpensesService {
  constructor(private tenantPrisma: TenantPrismaService) {}

  private async db(slug: string) {
    return this.tenantPrisma.getClient(slug) as any;
  }

  async create(
    tenantSlug: string,
    userId: string,
    dto: { category: string; amount: number; note?: string; sessionId?: string; paidVia?: string },
  ) {
    const db = await this.db(tenantSlug);
    if (!VALID_CATEGORIES.includes(dto.category)) throw new BadRequestException('Noto\'g\'ri kategoriya');
    if (!dto.amount || dto.amount <= 0) throw new BadRequestException('Summa musbat bo\'lishi kerak');

    const expense = await db.expense.create({
      data: {
        category: dto.category,
        amount: dto.amount,
        note: dto.note ?? null,
        sessionId: dto.sessionId ?? null,
        paidVia: dto.paidVia ?? 'CASH',
        createdBy: userId,
      },
    });

    // Agar sessionId berilgan va naqd chiqim bo'lsa — sessionga ham yozish
    if (dto.sessionId && (dto.paidVia ?? 'CASH') === 'CASH') {
      await db.kassaSession.update({
        where: { id: dto.sessionId },
        data: { totalExpenses: { increment: dto.amount } },
      });
    }

    return expense;
  }

  async findAll(
    tenantSlug: string,
    query: { page?: number; limit?: number; category?: string; from?: string; to?: string; sessionId?: string },
  ) {
    const db = await this.db(tenantSlug);
    const { page: _page = 1, limit: _limit = 50, category, from, to, sessionId } = query;
    const page = Number(_page);
    const limit = Number(_limit);

    const where: any = {};
    if (category) where.category = category;
    if (sessionId) where.sessionId = sessionId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [data, total, sumAgg, byCategory] = await Promise.all([
      db.expense.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.expense.count({ where }),
      db.expense.aggregate({ where, _sum: { amount: true } }),
      db.expense.groupBy({ by: ['category'], where, _sum: { amount: true } }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      summary: {
        totalAmount: Number(sumAgg._sum?.amount ?? 0),
        byCategory: byCategory.map((g: any) => ({
          category: g.category,
          amount: Number(g._sum?.amount ?? 0),
        })),
      },
    };
  }

  async findOne(tenantSlug: string, id: string) {
    const db = await this.db(tenantSlug);
    const expense = await db.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Chiqim topilmadi');
    return expense;
  }

  async update(
    tenantSlug: string,
    id: string,
    dto: { category?: string; amount?: number; note?: string; paidVia?: string },
  ) {
    const db = await this.db(tenantSlug);
    const existing = await this.findOne(tenantSlug, id);
    if (dto.category && !VALID_CATEGORIES.includes(dto.category)) throw new BadRequestException('Noto\'g\'ri kategoriya');
    if (dto.amount != null && dto.amount <= 0) throw new BadRequestException('Summa musbat bo\'lishi kerak');

    const updated = await db.expense.update({
      where: { id },
      data: {
        ...(dto.category && { category: dto.category }),
        ...(dto.amount != null && { amount: dto.amount }),
        ...(dto.note !== undefined && { note: dto.note }),
        ...(dto.paidVia && { paidVia: dto.paidVia }),
      },
    });

    // Agar session bilan bog'liq bo'lsa va summa o'zgargan bo'lsa — sessionni ham yangilash
    if (existing.sessionId && dto.amount != null && existing.paidVia === 'CASH') {
      const diff = dto.amount - Number(existing.amount);
      await db.kassaSession.update({
        where: { id: existing.sessionId },
        data: { totalExpenses: { increment: diff } },
      });
    }

    return updated;
  }

  async remove(tenantSlug: string, id: string) {
    const db = await this.db(tenantSlug);
    const existing = await this.findOne(tenantSlug, id);

    if (existing.sessionId && existing.paidVia === 'CASH') {
      await db.kassaSession.update({
        where: { id: existing.sessionId },
        data: { totalExpenses: { decrement: Number(existing.amount) } },
      });
    }

    return db.expense.delete({ where: { id } });
  }

  // Davr bo'yicha xulosa — hisobotlar uchun
  async getSummary(tenantSlug: string, from: string, to: string) {
    const db = await this.db(tenantSlug);
    const where: any = {};
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [total, byCategory] = await Promise.all([
      db.expense.aggregate({ where, _sum: { amount: true } }),
      db.expense.groupBy({ by: ['category'], where, _sum: { amount: true } }),
    ]);

    return {
      total: Number(total._sum?.amount ?? 0),
      byCategory: byCategory.map((g: any) => ({
        category: g.category,
        amount: Number(g._sum?.amount ?? 0),
      })),
    };
  }
}
