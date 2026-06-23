import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { subDays } from 'date-fns';

type Period = '30d' | '90d' | '180d';

@Injectable()
export class ReportsService {
  constructor(private tenantPrisma: TenantPrismaService) {}

  private async db(slug: string) {
    return this.tenantPrisma.getClient(slug) as any;
  }

  // ─── ABC Analysis ────────────────────────────────────────────────────────────

  async calculateABC(tenantSlug: string, period: Period = '90d') {
    const db = await this.db(tenantSlug);
    const days = period === '30d' ? 30 : period === '180d' ? 180 : 90;
    const from = subDays(new Date(), days);

    const revenueByProduct = await db.orderItem.groupBy({
      by: ['productId'],
      where: { order: { createdAt: { gte: from }, status: { notIn: ['CANCELLED', 'REFUNDED'] } } },
      _sum: { totalPrice: true },
    });

    if (!revenueByProduct.length) {
      return { items: [], summary: { A: 0, B: 0, C: 0 }, period };
    }

    const total = revenueByProduct.reduce((s: number, r: any) => s + Number(r._sum.totalPrice ?? 0), 0);
    const sorted = revenueByProduct
      .map((r: any) => ({ productId: r.productId, revenue: Number(r._sum.totalPrice ?? 0) }))
      .sort((a: any, b: any) => b.revenue - a.revenue);

    let cumulative = 0;
    const items: { productId: string; revenue: number; revenueShare: number; cumulative: number; category: 'A' | 'B' | 'C' }[] = [];

    for (const row of sorted) {
      cumulative += row.revenue;
      const cumulativePct = cumulative / total;
      const category: 'A' | 'B' | 'C' = cumulativePct <= 0.8 ? 'A' : cumulativePct <= 0.95 ? 'B' : 'C';
      items.push({ ...row, revenueShare: row.revenue / total, cumulative: cumulativePct, category });
    }

    // Save to ProductABC
    await db.$transaction(
      items.map((item) =>
        db.productABC.upsert({
          where: { productId_period: { productId: item.productId, period } },
          update: { category: item.category, revenue: item.revenue, revenueShare: item.revenueShare, cumulative: item.cumulative, calculatedAt: new Date() },
          create: { productId: item.productId, period, category: item.category, revenue: item.revenue, revenueShare: item.revenueShare, cumulative: item.cumulative },
        }),
      ),
    );

    // Enrich with product data
    const productIds = items.map((i) => i.productId);
    const products = await db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true, imageUrls: true },
    });
    const productMap = new Map(products.map((p: any) => [p.id, p]));

    const enriched = items.map((item) => ({ ...item, product: productMap.get(item.productId) ?? null }));
    const summary = { A: enriched.filter((i) => i.category === 'A').length, B: enriched.filter((i) => i.category === 'B').length, C: enriched.filter((i) => i.category === 'C').length };

    return { items: enriched, summary, total, period };
  }

  async getABCFromCache(tenantSlug: string, period: Period = '90d') {
    const db = await this.db(tenantSlug);
    const cached = await db.productABC.findMany({
      where: { period },
      include: { product: { select: { id: true, name: true, sku: true, imageUrls: true } } },
      orderBy: { cumulative: 'asc' },
    });

    if (!cached.length) return this.calculateABC(tenantSlug, period);

    // Prisma Decimal → Number (string concatenation muammosini oldini olish)
    const items = cached.map((r: any) => ({
      ...r,
      revenue: Number(r.revenue),
      revenueShare: Number(r.revenueShare),
      cumulative: Number(r.cumulative),
    }));
    const total = items.reduce((s: number, r: any) => s + r.revenue, 0);
    const summary = { A: items.filter((i: any) => i.category === 'A').length, B: items.filter((i: any) => i.category === 'B').length, C: items.filter((i: any) => i.category === 'C').length };
    return { items, summary, total, period, cachedAt: cached[0]?.calculatedAt };
  }

  async getRecommendations(tenantSlug: string) {
    const db = await this.db(tenantSlug);
    const recommendations = [];

    // A-class products with low stock
    const abcA = await db.productABC.findMany({ where: { category: 'A', period: '90d' }, select: { productId: true } });
    if (abcA.length) {
      const aProductIds = abcA.map((r: any) => r.productId);
      const stockGroups = await db.warehouseTransaction.groupBy({ by: ['productId'], where: { productId: { in: aProductIds } }, _sum: { qty: true } });
      const stockMap = new Map<string, number>(stockGroups.map((g: any) => [g.productId, Number(g._sum?.qty ?? 0)]));
      const products = await db.product.findMany({ where: { id: { in: aProductIds } }, select: { id: true, name: true, sku: true, minStockLevel: true } });
      const lowStock = products.filter((p: any) => (stockMap.get(p.id) ?? 0) <= p.minStockLevel);
      if (lowStock.length) {
        recommendations.push({ type: 'REORDER', priority: 'HIGH', products: lowStock, message: `A kategoriya ${lowStock.length} ta mahsulot kritik darajada kam` });
      }
    }

    // C-class products with no sales > 60 days
    const abcC = await db.productABC.findMany({ where: { category: 'C', period: '90d' }, select: { productId: true } });
    if (abcC.length) {
      const cProductIds = abcC.map((r: any) => r.productId);
      const since60 = subDays(new Date(), 60);
      const recentSales = await db.orderItem.groupBy({ by: ['productId'], where: { productId: { in: cProductIds }, order: { createdAt: { gte: since60 } } }, _sum: { qty: true } });
      const recentSet = new Set(recentSales.map((r: any) => r.productId));
      const deadProducts = cProductIds.filter((id: string) => !recentSet.has(id));
      if (deadProducts.length) {
        const products = await db.product.findMany({ where: { id: { in: deadProducts } }, select: { id: true, name: true, sku: true } });
        recommendations.push({ type: 'DEAD_STOCK', priority: 'MEDIUM', products: products.slice(0, 10), message: `C kategoriya ${products.length} ta mahsulot 60+ kun sotilmagan` });
      }
    }

    return recommendations;
  }

  // ─── Dead Stock ─────────────────────────────────────────────────────────────

  async getDeadStock(tenantSlug: string, days = 60) {
    const db = await this.db(tenantSlug);
    const since = subDays(new Date(), days);

    const products = await db.product.findMany({ where: { isActive: true }, select: { id: true, name: true, sku: true, basePrice: true, imageUrls: true } });
    const recentSales = await db.orderItem.groupBy({
      by: ['productId'],
      where: { order: { createdAt: { gte: since }, status: { notIn: ['CANCELLED', 'REFUNDED'] } } },
      _sum: { qty: true },
    });
    const soldSet = new Set(recentSales.map((r: any) => r.productId));

    const stockGroups = await db.warehouseTransaction.groupBy({ by: ['productId'], _sum: { qty: true } });
    const stockMap = new Map<string, number>(stockGroups.map((g: any) => [g.productId, Number(g._sum?.qty ?? 0)]));

    return products
      .filter((p: any) => !soldSet.has(p.id) && (stockMap.get(p.id) ?? 0) > 0)
      .map((p: any) => ({ ...p, stock: stockMap.get(p.id) ?? 0, stockValue: (stockMap.get(p.id) ?? 0) * Number(p.basePrice) }))
      .sort((a: any, b: any) => b.stockValue - a.stockValue);
  }

  // ─── Inventory Turnover ──────────────────────────────────────────────────────

  async getInventoryTurnover(tenantSlug: string) {
    const db = await this.db(tenantSlug);
    const days = 90;
    const from = subDays(new Date(), days);

    const salesGroups = await db.orderItem.groupBy({
      by: ['productId'],
      where: { order: { createdAt: { gte: from }, status: { notIn: ['CANCELLED', 'REFUNDED'] } } },
      _sum: { qty: true },
    });
    const stockGroups = await db.warehouseTransaction.groupBy({ by: ['productId'], _sum: { qty: true } });
    const stockMap = new Map<string, number>(stockGroups.map((g: any) => [g.productId, Number(g._sum?.qty ?? 0)]));

    const productIds = [...new Set([...salesGroups.map((s: any) => s.productId)])];
    const products = await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, sku: true } });
    const productMap = new Map<string, any>(products.map((p: any) => [p.id, p]));

    return salesGroups.map((s: any) => {
      const sold = Number(s._sum?.qty ?? 0);
      const currentStock = stockMap.get(s.productId) ?? 0;
      const avgStock = Math.max(currentStock, 1);
      const turnover = sold / avgStock;
      const avgDays = avgStock > 0 ? (days / turnover) : null;
      const product: any = productMap.get(s.productId) ?? {};
      return { ...product, soldQty: sold, currentStock, turnoverRate: Math.round(turnover * 100) / 100, avgDaysInStock: avgDays ? Math.round(avgDays) : null };
    }).sort((a: any, b: any) => b.turnoverRate - a.turnoverRate);
  }

  // ─── Foyda hisoboti (Profit) ──────────────────────────────────────────────

  async getProfitReport(tenantSlug: string, from: string, to: string) {
    const db = await this.db(tenantSlug);
    const fromDate = from ? new Date(from) : subDays(new Date(), 30);
    const toDate = to ? new Date(to) : new Date();

    // 1. Sotuvlar — foyda hisobi uchun OrderItem'lardan
    const orderItems = await db.orderItem.findMany({
      where: {
        order: {
          createdAt: { gte: fromDate, lte: toDate },
          status: { notIn: ['CANCELLED', 'REFUNDED'] },
        },
      },
      include: { product: { select: { id: true, name: true, sku: true } } },
    });

    // 2. Mahsulot bo'yicha agregatsiya
    const byProduct = new Map<string, { product: any; revenue: number; cost: number; qty: number }>();
    let totalRevenue = 0;
    let totalCost = 0;
    let totalQty = 0;

    for (const item of orderItems) {
      const qty = Number(item.qty);
      const revenue = Number(item.totalPrice);
      const cost = Number(item.costPriceAtSale ?? 0) * qty;
      totalRevenue += revenue;
      totalCost += cost;
      totalQty += qty;

      const key = item.productId;
      const existing = byProduct.get(key) ?? { product: item.product, revenue: 0, cost: 0, qty: 0 };
      existing.revenue += revenue;
      existing.cost += cost;
      existing.qty += qty;
      byProduct.set(key, existing);
    }

    const grossProfit = totalRevenue - totalCost;
    const grossMargin = totalRevenue > 0 ? grossProfit / totalRevenue : 0;

    // 3. Chiqimlar
    const expensesAgg = await db.expense.aggregate({
      where: { createdAt: { gte: fromDate, lte: toDate } },
      _sum: { amount: true },
    });
    const expensesByCategory = await db.expense.groupBy({
      by: ['category'],
      where: { createdAt: { gte: fromDate, lte: toDate } },
      _sum: { amount: true },
    });
    const totalExpenses = Number(expensesAgg._sum?.amount ?? 0);
    const netProfit = grossProfit - totalExpenses;

    // 4. Mahsulot bo'yicha sort
    const products = Array.from(byProduct.values())
      .map((p) => ({
        product: p.product,
        revenue: p.revenue,
        cost: p.cost,
        profit: p.revenue - p.cost,
        margin: p.revenue > 0 ? (p.revenue - p.cost) / p.revenue : 0,
        qty: p.qty,
      }))
      .sort((a, b) => b.profit - a.profit);

    return {
      period: { from: fromDate, to: toDate },
      summary: {
        totalRevenue: Math.round(totalRevenue),
        totalCost: Math.round(totalCost),
        grossProfit: Math.round(grossProfit),
        grossMargin: Math.round(grossMargin * 10000) / 100, // foiz
        totalExpenses: Math.round(totalExpenses),
        netProfit: Math.round(netProfit),
        salesCount: orderItems.length,
        totalQty,
      },
      expensesByCategory: expensesByCategory.map((g: any) => ({
        category: g.category,
        amount: Number(g._sum?.amount ?? 0),
      })),
      topProducts: products.slice(0, 20),
      worstProducts: products.slice(-10).reverse(),
    };
  }

  // ─── Kassir samaradorligi ──────────────────────────────────────────────────

  async getCashierPerformance(tenantSlug: string, from: string, to: string) {
    const db = await this.db(tenantSlug);
    const fromDate = from ? new Date(from) : subDays(new Date(), 30);
    const toDate = to ? new Date(to) : new Date();

    const sessions = await db.kassaSession.findMany({
      where: { openedAt: { gte: fromDate, lte: toDate } },
      orderBy: { openedAt: 'desc' },
    });

    // Cashier ID bo'yicha agregatsiya
    const byCashier = new Map<string, {
      cashierId: string;
      sessionsCount: number;
      totalSales: number;
      totalOrders: number;
      totalCash: number;
      totalCard: number;
      totalQr: number;
      totalShortage: number; // kamomad jami
      totalSurplus: number;  // ortiqcha jami
      shortageSessions: number;
      avgSessionHours: number;
      sessionHoursSum: number;
    }>();

    for (const s of sessions) {
      const key = s.openedBy;
      const existing = byCashier.get(key) ?? {
        cashierId: key,
        sessionsCount: 0,
        totalSales: 0,
        totalOrders: 0,
        totalCash: 0,
        totalCard: 0,
        totalQr: 0,
        totalShortage: 0,
        totalSurplus: 0,
        shortageSessions: 0,
        avgSessionHours: 0,
        sessionHoursSum: 0,
      };

      existing.sessionsCount++;
      existing.totalSales += Number(s.totalSales ?? 0);
      existing.totalOrders += Number(s.ordersCount ?? 0);
      existing.totalCash += Number(s.totalCash ?? 0);
      existing.totalCard += Number(s.totalCard ?? 0);
      existing.totalQr += Number(s.totalQr ?? 0);

      const diff = Number(s.difference ?? 0);
      if (diff < 0) {
        existing.totalShortage += Math.abs(diff);
        existing.shortageSessions++;
      } else if (diff > 0) {
        existing.totalSurplus += diff;
      }

      if (s.closedAt) {
        const hours = (new Date(s.closedAt).getTime() - new Date(s.openedAt).getTime()) / (1000 * 60 * 60);
        existing.sessionHoursSum += hours;
      }

      byCashier.set(key, existing);
    }

    const result = Array.from(byCashier.values()).map((c) => ({
      ...c,
      avgSessionHours: c.sessionsCount > 0 ? Math.round((c.sessionHoursSum / c.sessionsCount) * 10) / 10 : 0,
      avgCheck: c.totalOrders > 0 ? Math.round(c.totalSales / c.totalOrders) : 0,
      shortageRate: c.sessionsCount > 0 ? Math.round((c.shortageSessions / c.sessionsCount) * 100) : 0,
    }));

    return { sessions, cashiers: result.sort((a, b) => b.totalSales - a.totalSales) };
  }
}
