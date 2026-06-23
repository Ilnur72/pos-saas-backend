import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { PriceRulesService } from './price-rules.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('price-rules')
@UseGuards(JwtAuthGuard, TenantGuard)
export class PriceRulesController {
  constructor(private priceRules: PriceRulesService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.priceRules.findAll(req.tenantSlug);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(@Req() req: any, @Body() dto: any) {
    return this.priceRules.create(req.tenantSlug, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.priceRules.update(req.tenantSlug, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.priceRules.remove(req.tenantSlug, id);
  }

  @Post('preview')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  preview(@Req() req: any, @Body() body: { productIds: string[]; ruleIds?: string[] }) {
    return this.priceRules.preview(req.tenantSlug, body.productIds, body.ruleIds);
  }
}

@Controller('products/batch')
@UseGuards(JwtAuthGuard, TenantGuard)
export class BatchController {
  constructor(private priceRules: PriceRulesService) {}

  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  batch(@Req() req: any, @Body() body: { action: string; productIds: string[]; data: any }) {
    return this.priceRules.batchUpdate(req.tenantSlug, body.action, body.productIds, body.data);
  }
}
