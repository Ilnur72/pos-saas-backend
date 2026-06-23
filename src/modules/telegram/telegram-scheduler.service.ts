import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { TelegramService } from './telegram.service';
import { subDays } from 'date-fns';

@Injectable()
export class TelegramSchedulerService {
  private readonly logger = new Logger(TelegramSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private tenantPrisma: TenantPrismaService,
    private telegram: TelegramService,
  ) {}

  // Har kuni 21:00 da kunlik hisobot — barcha aktiv tenantlarga
  @Cron('0 21 * * *', { timeZone: 'Asia/Tashkent' })
  async sendDailyReports() {
    this.logger.log('Kunlik Telegram hisobotlari yuborilmoqda...');
    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
    });

    for (const tenant of tenants) {
      const settings = (tenant.settings as any) ?? {};
      if (!settings.telegram?.enabled || !settings.telegram?.chatId) continue;

      try {
        const data = await this.computeDailyData(tenant.slug);
        await this.telegram.notifyDailyReport(tenant.slug, {
          tenantName: tenant.name,
          ...data,
        });
      } catch (e: any) {
        this.logger.warn(`Daily report failed for ${tenant.slug}: ${e.message}`);
      }
    }
  }

  // Har kuni 09:00 da kam qoldiqlar ogohlantirishi
  @Cron('0 9 * * *', { timeZone: 'Asia/Tashkent' })
  async sendLowStockAlerts() {
    this.logger.log('Kam qoldiq ogohlantirishlari yuborilmoqda...');
    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
    });

    for (const tenant of tenants) {
      const settings = (tenant.settings as any) ?? {};
      if (!settings.telegram?.enabled || !settings.telegram?.chatId) continue;

      try {
        const lowStockItems = await this.getLowStockItems(tenant.slug);
        if (lowStockItems.length > 0) {
          await this.telegram.notifyLowStock(tenant.slug, lowStockItems);
        }
      } catch (e: any) {
        this.logger.warn(`Low stock alert failed for ${tenant.slug}: ${e.message}`);
      }
    }
  }

  // Yordamchi: bugungi ko'rsatkichlar
  private async computeDailyData(tenantSlug: string) {
    const db = (await this.tenantPrisma.getClient(tenantSlug)) as any;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Daromad + tannarx
    const items = await db.orderItem.findMany({
      where: {
        order: {
          createdAt: { gte: startOfToday },
          status: { notIn: ['CANCELLED', 'REFUNDED'] },
        },
      },
    });

    let revenue = 0;
    let cost = 0;
    for (const it of items) {
      revenue += Number(it.totalPrice);
      cost += Number(it.costPriceAtSale ?? 0) * Number(it.qty);
    }
    const grossProfit = revenue - cost;

    // Buyurtmalar soni
    const salesCount = await db.order.count({
      where: { createdAt: { gte: startOfToday }, status: { notIn: ['CANCELLED', 'REFUNDED'] } },
    });

    // To'lov turi bo'yicha
    const paymentAgg = await db.order.groupBy({
      by: ['paymentMethod'],
      where: { createdAt: { gte: startOfToday }, status: { notIn: ['CANCELLED', 'REFUNDED'] } },
      _sum: { totalAmount: true },
    });
    const cashTotal = Number(paymentAgg.find((p: any) => p.paymentMethod === 'CASH')?._sum?.totalAmount ?? 0);
    const cardTotal = Number(paymentAgg.find((p: any) => p.paymentMethod === 'CARD')?._sum?.totalAmount ?? 0);

    // Chiqimlar
    const expensesAgg = await db.expense.aggregate({
      where: { createdAt: { gte: startOfToday } },
      _sum: { amount: true },
    });
    const totalExpenses = Number(expensesAgg._sum?.amount ?? 0);
    const netProfit = grossProfit - totalExpenses;

    // Kam qoldiq
    const lowStock = await this.getLowStockItems(tenantSlug);

    return {
      revenue,
      grossProfit,
      netProfit,
      salesCount,
      cashTotal,
      cardTotal,
      lowStockCount: lowStock.length,
    };
  }

  private async getLowStockItems(tenantSlug: string) {
    const db = (await this.tenantPrisma.getClient(tenantSlug)) as any;
    const products = await db.product.findMany({
      where: { isActive: true, minStockLevel: { gt: 0 } },
      select: { id: true, name: true, minStockLevel: true },
    });
    if (!products.length) return [];

    const stockGroups = await db.warehouseTransaction.groupBy({
      by: ['productId'],
      where: { productId: { in: products.map((p: any) => p.id) } },
      _sum: { qty: true },
    });
    const stockMap = new Map<string, number>(
      stockGroups.map((g: any) => [g.productId, Number(g._sum?.qty ?? 0)]),
    );

    return products
      .map((p: any) => ({
        productName: p.name,
        totalQty: stockMap.get(p.id) ?? 0,
        minStockLevel: p.minStockLevel,
      }))
      .filter((p: any) => p.totalQty <= p.minStockLevel);
  }
}
