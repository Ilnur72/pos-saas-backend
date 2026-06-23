import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SuperAdminService } from './superadmin.service';
import { SuperAdminGuard } from './superadmin.guard';
import { SkipTenantGuard } from '../../common/decorators/skip-tenant-guard.decorator';
import { Plan, TenantStatus } from '@prisma/client';

@Controller('superadmin')
@UseGuards(SuperAdminGuard)
@SkipTenantGuard()
export class SuperAdminController {
  constructor(private superAdmin: SuperAdminService) {}

  @Get('stats')
  getDashboardStats() {
    return this.superAdmin.getDashboardStats();
  }

  @Get('tenants')
  getTenants(@Query() query: { status?: TenantStatus; plan?: Plan; search?: string; page?: string; limit?: string }) {
    return this.superAdmin.getTenants({
      ...query,
      page: query.page ? +query.page : 1,
      limit: query.limit ? +query.limit : 20,
    });
  }

  @Get('tenants/:id')
  getTenantDetail(@Param('id') id: string) {
    return this.superAdmin.getTenantDetail(id);
  }

  @Post('tenants/:id/suspend')
  suspend(@Param('id') id: string, @Body('reason') reason: string) {
    return this.superAdmin.suspendTenant(id, reason ?? '');
  }

  @Post('tenants/:id/activate')
  activate(@Param('id') id: string) {
    return this.superAdmin.activateTenant(id);
  }

  @Post('tenants/:id/change-plan')
  changePlan(@Param('id') id: string, @Body('plan') plan: Plan) {
    return this.superAdmin.changePlan(id, plan);
  }

  @Post('tenants/:id/extend-trial')
  extendTrial(@Param('id') id: string, @Body('days') days: number) {
    return this.superAdmin.extendTrial(id, days);
  }

  @Get('mrr-chart')
  getMrrChart(@Query('months') months: string) {
    return this.superAdmin.getMrrChart(months ? +months : 12);
  }

  @Get('system/health')
  getHealth() {
    return this.superAdmin.getSystemHealth();
  }
}
