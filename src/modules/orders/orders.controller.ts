import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PlanLimit } from '../../common/decorators/plan-limit.decorator';
import { PlanLimitGuard } from '../../common/guards/plan-limit.guard';

@Controller('orders')
@UseGuards(JwtAuthGuard, TenantGuard)
export class OrdersController {
  constructor(private orders: OrdersService) {}

  @Get()
  findAll(@Req() req: any, @Query() query: any) {
    return this.orders.findAll(req.tenantSlug, query);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.orders.findOne(req.tenantSlug, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER')
  @PlanLimit('orders')
  @UseGuards(PlanLimitGuard)
  create(@Req() req: any, @Body() dto: any) {
    return this.orders.create(req.tenantSlug, dto, req.user.sub);
  }

  @Patch(':id/status')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  updateStatus(@Req() req: any, @Param('id') id: string, @Body('status') status: string) {
    return this.orders.updateStatus(req.tenantSlug, id, status);
  }

  @Patch(':id/payment')
  @Roles('OWNER', 'ADMIN', 'CASHIER')
  updatePayment(@Req() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.orders.updatePayment(req.tenantSlug, id, dto);
  }

  @Post(':id/cancel')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  cancel(@Req() req: any, @Param('id') id: string) {
    return this.orders.cancel(req.tenantSlug, id, req.user.sub);
  }
}
