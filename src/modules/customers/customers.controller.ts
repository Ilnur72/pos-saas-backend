import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Controller('customers')
@UseGuards(JwtAuthGuard, TenantGuard)
export class CustomersController {
  constructor(private customers: CustomersService) {}

  @Get()
  findAll(@Req() req: any, @Query() query: any) {
    return this.customers.findAll(req.tenantSlug, query);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.customers.findOne(req.tenantSlug, id);
  }

  @Get(':id/orders')
  getOrders(@Req() req: any, @Param('id') id: string, @Query() query: any) {
    return this.customers.getOrders(req.tenantSlug, id, query);
  }
}
