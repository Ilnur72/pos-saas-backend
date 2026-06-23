import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('purchase-orders')
@UseGuards(JwtAuthGuard, TenantGuard)
export class PurchaseOrdersController {
  constructor(private pos: PurchaseOrdersService) {}

  // ─── Purchase Orders ───────────────────────────────────────────────────────

  @Get()
  findAll(@Req() req: any, @Query() query: any) {
    return this.pos.findAll(req.tenantSlug, query);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.pos.findOne(req.tenantSlug, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  create(@Req() req: any, @Body() dto: any) {
    return this.pos.create(req.tenantSlug, dto, req.user.sub);
  }

  @Post('auto-generate')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  autoGenerate(@Req() req: any) {
    return this.pos.autoGenerate(req.tenantSlug, req.user.sub);
  }

  @Post(':id/approve')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  approve(@Req() req: any, @Param('id') id: string) {
    return this.pos.approve(req.tenantSlug, id, req.user.sub);
  }

  @Post(':id/receive')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  receive(@Req() req: any, @Param('id') id: string, @Body('items') items: any[]) {
    return this.pos.receive(req.tenantSlug, id, items, req.user.sub);
  }

  @Post(':id/cancel')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  cancel(@Req() req: any, @Param('id') id: string) {
    return this.pos.cancel(req.tenantSlug, id);
  }

  // ─── Auto Order Rules ──────────────────────────────────────────────────────

  @Get('auto-order-rules')
  getRules(@Req() req: any) {
    return this.pos.getRules(req.tenantSlug);
  }

  @Post('auto-order-rules')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  createRule(@Req() req: any, @Body() dto: any) {
    return this.pos.createRule(req.tenantSlug, dto);
  }

  @Patch('auto-order-rules/:id')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  updateRule(@Req() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.pos.updateRule(req.tenantSlug, id, dto);
  }

  @Delete('auto-order-rules/:id')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  deleteRule(@Req() req: any, @Param('id') id: string) {
    return this.pos.deleteRule(req.tenantSlug, id);
  }
}
