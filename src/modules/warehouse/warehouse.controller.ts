import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('warehouse')
@UseGuards(JwtAuthGuard, TenantGuard)
export class WarehouseController {
  constructor(private warehouse: WarehouseService) {}

  @Get('stock')
  getStock(@Req() req: any, @Query() query: any) {
    return this.warehouse.getStock(req.tenantSlug, query);
  }

  @Get('stock/:productId')
  getStockDetail(@Req() req: any, @Param('productId') productId: string) {
    return this.warehouse.getStockDetail(req.tenantSlug, productId);
  }

  @Get('transactions')
  getTransactions(@Req() req: any, @Query() query: any) {
    return this.warehouse.getTransactions(req.tenantSlug, query);
  }

  @Get('low-stock')
  getLowStock(@Req() req: any) {
    return this.warehouse.getLowStock(req.tenantSlug);
  }

  @Get('value')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  getInventoryValue(@Req() req: any) {
    return this.warehouse.getInventoryValue(req.tenantSlug);
  }

  @Get('report/movement')
  getMovementReport(@Req() req: any, @Query('from') from: string, @Query('to') to: string) {
    return this.warehouse.getMovementReport(req.tenantSlug, from, to);
  }

  @Post('purchase')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  purchase(@Req() req: any, @Body() dto: any) {
    return this.warehouse.purchase(req.tenantSlug, dto, req.user.sub);
  }

  @Post('adjustment')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  adjustment(@Req() req: any, @Body() dto: any) {
    return this.warehouse.adjustment(req.tenantSlug, dto, req.user.sub);
  }
}
