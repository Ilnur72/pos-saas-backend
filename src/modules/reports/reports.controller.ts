import { Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('abc')
  getABC(@Req() req: any, @Query('period') period: string) {
    return this.reports.getABCFromCache(req.tenantSlug, (period as any) ?? '90d');
  }

  @Post('abc/recalculate')
  @Roles('OWNER', 'ADMIN')
  recalculateABC(@Req() req: any, @Query('period') period: string) {
    return this.reports.calculateABC(req.tenantSlug, (period as any) ?? '90d');
  }

  @Get('abc/recommendations')
  getRecommendations(@Req() req: any) {
    return this.reports.getRecommendations(req.tenantSlug);
  }

  @Get('inventory/dead-stock')
  getDeadStock(@Req() req: any, @Query('days') days: string) {
    return this.reports.getDeadStock(req.tenantSlug, days ? parseInt(days) : 60);
  }

  @Get('inventory/turnover')
  getTurnover(@Req() req: any) {
    return this.reports.getInventoryTurnover(req.tenantSlug);
  }

  @Get('profit')
  @Roles('OWNER', 'ADMIN')
  getProfit(@Req() req: any, @Query('from') from: string, @Query('to') to: string) {
    return this.reports.getProfitReport(req.tenantSlug, from, to);
  }

  @Get('cashier-performance')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  getCashierPerformance(@Req() req: any, @Query('from') from: string, @Query('to') to: string) {
    return this.reports.getCashierPerformance(req.tenantSlug, from, to);
  }
}
