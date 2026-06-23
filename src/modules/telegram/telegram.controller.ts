import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('telegram')
@UseGuards(JwtAuthGuard, TenantGuard)
export class TelegramController {
  constructor(
    private telegram: TelegramService,
    private prisma: PrismaService,
  ) {}

  private async tenantIdFromSlug(slug: string) {
    const t = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    return t?.id;
  }

  @Get('config')
  @Roles('OWNER', 'ADMIN')
  async getConfig(@Req() req: any) {
    const tenantId = await this.tenantIdFromSlug(req.tenantSlug);
    if (!tenantId) return null;
    return this.telegram.getConfigForFrontend(tenantId);
  }

  @Post('config')
  @Roles('OWNER', 'ADMIN')
  async saveConfig(@Req() req: any, @Body() body: { botToken?: string; chatId?: string; enabled?: boolean }) {
    const tenantId = await this.tenantIdFromSlug(req.tenantSlug);
    if (!tenantId) return null;
    return this.telegram.saveConfig(tenantId, body);
  }

  @Post('test')
  @Roles('OWNER', 'ADMIN')
  async testMessage(@Req() req: any) {
    const tenantId = await this.tenantIdFromSlug(req.tenantSlug);
    if (!tenantId) return { sent: false };
    const sent = await this.telegram.testMessage(tenantId);
    return { sent };
  }
}
