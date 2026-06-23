import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { SkipTenantGuard } from '../../common/decorators/skip-tenant-guard.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Plan } from '@prisma/client';

@Controller('billing')
export class BillingController {
  constructor(private billing: BillingService) {}

  @Get('plans')
  @SkipTenantGuard()
  getPlans() {
    return this.billing.getPlans();
  }

  @Get('current')
  @UseGuards(JwtAuthGuard, TenantGuard)
  getCurrent(@Req() req: any) {
    return this.billing.getCurrentSubscription(req.tenant.id);
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @Roles('OWNER')
  subscribe(@Req() req: any, @Body() dto: { plan: Plan; paymentMethod: string }) {
    return this.billing.subscribe(req.tenant.id, dto.plan, dto.paymentMethod);
  }

  @Post('upgrade')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @Roles('OWNER')
  upgrade(@Req() req: any, @Body('plan') plan: Plan) {
    return this.billing.upgrade(req.tenant.id, plan);
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @Roles('OWNER')
  cancel(@Req() req: any) {
    return this.billing.cancelSubscription(req.tenant.id);
  }

  @Get('invoices')
  @UseGuards(JwtAuthGuard, TenantGuard)
  getInvoices(@Req() req: any, @Query() query: any) {
    return this.billing.getInvoices(req.tenant.id, query);
  }

  @Post('webhook/payme')
  @SkipTenantGuard()
  paymeWebhook(@Body() body: any) {
    return { status: 'ok' };
  }
}
