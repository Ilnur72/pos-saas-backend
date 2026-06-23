import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // Tenant settings dan Telegram konfiguratsiyasini olish
  private async getConfig(tenantId: string): Promise<TelegramConfig | null> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return null;

    const settings = (tenant.settings as any) ?? {};
    const t = settings.telegram ?? {};
    // Bot token .env dan yoki tenant settings dan
    const botToken = t.botToken ?? this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken || !t.chatId || t.enabled === false) return null;

    return { botToken, chatId: t.chatId, enabled: true };
  }

  // Tenant slug bo'yicha xabar yuborish
  async sendBySlug(tenantSlug: string, message: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) return false;
    return this.send(tenant.id, message);
  }

  async send(tenantId: string, message: string): Promise<boolean> {
    try {
      const config = await this.getConfig(tenantId);
      if (!config) return false;

      const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.chatId,
          text: message,
          parse_mode: 'HTML',
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        this.logger.warn(`Telegram send failed: ${res.status} ${error}`);
        return false;
      }
      return true;
    } catch (e: any) {
      this.logger.error(`Telegram send error: ${e.message}`);
      return false;
    }
  }

  // Tenantning Telegram konfiguratsiyasini saqlash
  async saveConfig(tenantId: string, config: { botToken?: string; chatId?: string; enabled?: boolean }) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new Error('Tenant topilmadi');

    const settings = (tenant.settings as any) ?? {};
    settings.telegram = {
      ...(settings.telegram ?? {}),
      ...(config.botToken !== undefined && { botToken: config.botToken }),
      ...(config.chatId !== undefined && { chatId: config.chatId }),
      ...(config.enabled !== undefined && { enabled: config.enabled }),
    };

    await this.prisma.tenant.update({ where: { id: tenantId }, data: { settings } });
    return settings.telegram;
  }

  async getConfigForFrontend(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const settings = (tenant?.settings as any) ?? {};
    const t = settings.telegram ?? {};
    return {
      botToken: t.botToken ?? null,
      chatId: t.chatId ?? null,
      enabled: t.enabled ?? false,
      hasGlobalBot: !!this.config.get<string>('TELEGRAM_BOT_TOKEN'),
    };
  }

  // Test xabar yuborish
  async testMessage(tenantId: string): Promise<boolean> {
    return this.send(tenantId, '✅ <b>Test xabar</b>\nTelegram integratsiya ishlamoqda!');
  }

  // ─── Tayyor xabar shablonlari ──────────────────────────────────────────────

  async notifyShiftClosed(tenantSlug: string, data: {
    cashierName: string;
    durationHours: number;
    totalSales: number;
    expectedCash: number;
    closingCash: number;
    difference: number;
  }) {
    const fmt = (n: number) => new Intl.NumberFormat('uz-UZ').format(Math.round(n));
    const diffEmoji = data.difference === 0 ? '✅' : data.difference > 0 ? '⊕' : '⚠️';
    const diffText = data.difference === 0 ? 'Mos' : data.difference > 0 ? `+${fmt(data.difference)} ortiqcha` : `KAMOMAD: ${fmt(Math.abs(data.difference))}`;

    const message = `🔐 <b>Smena yopildi</b>
👤 Kassir: ${data.cashierName}
⏱ Davomiyligi: ${data.durationHours.toFixed(1)} soat
💰 Sotuv: ${fmt(data.totalSales)} so'm
💵 Kutilgan kassa: ${fmt(data.expectedCash)} so'm
💵 Haqiqiy: ${fmt(data.closingCash)} so'm
${diffEmoji} ${diffText} so'm`;
    return this.sendBySlug(tenantSlug, message);
  }

  async notifyLowStock(tenantSlug: string, items: { productName: string; totalQty: number; minStockLevel: number }[]) {
    if (!items.length) return false;
    const lines = items.slice(0, 20).map((i) => `• ${i.productName}: ${i.totalQty} ta (min: ${i.minStockLevel})`).join('\n');
    const more = items.length > 20 ? `\n...va yana ${items.length - 20} ta` : '';
    const message = `⚠️ <b>Kam qolgan mahsulotlar (${items.length} ta)</b>\n\n${lines}${more}`;
    return this.sendBySlug(tenantSlug, message);
  }

  async notifyDailyReport(tenantSlug: string, data: {
    tenantName: string;
    revenue: number;
    grossProfit: number;
    netProfit: number;
    salesCount: number;
    cashTotal: number;
    cardTotal: number;
    lowStockCount: number;
  }) {
    const fmt = (n: number) => new Intl.NumberFormat('uz-UZ').format(Math.round(n));
    const message = `📊 <b>${data.tenantName}</b> — ${new Date().toLocaleDateString('uz-UZ')}
💰 Tushum: ${fmt(data.revenue)} so'm
📈 Yalpi foyda: ${fmt(data.grossProfit)} so'm
💵 Sof foyda: ${fmt(data.netProfit)} so'm
🛒 Sotuvlar: ${data.salesCount} ta
💵 Naqd: ${fmt(data.cashTotal)} | 💳 Karta: ${fmt(data.cardTotal)}
⚠️ Kam qoldiq: ${data.lowStockCount} mahsulot`;
    return this.sendBySlug(tenantSlug, message);
  }
}
