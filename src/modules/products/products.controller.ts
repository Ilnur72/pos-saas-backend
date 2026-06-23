import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PlanLimitGuard } from '../../common/guards/plan-limit.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PlanLimit } from '../../common/decorators/plan-limit.decorator';

@Controller('products')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ProductsController {
  constructor(private products: ProductsService) {}

  @Get()
  findAll(@Req() req: any, @Query() query: ProductQueryDto) {
    return this.products.findAll(req.tenantSlug, query);
  }

  @Get('slug/:slug')
  findBySlug(@Req() req: any, @Param('slug') slug: string) {
    return this.products.findBySlug(req.tenantSlug, slug);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.products.findOne(req.tenantSlug, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @PlanLimit('skus')
  @UseGuards(PlanLimitGuard)
  create(@Req() req: any, @Body() dto: CreateProductDto) {
    return this.products.create(req.tenantSlug, dto, req.user.sub);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: Partial<CreateProductDto>) {
    return this.products.update(req.tenantSlug, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.products.remove(req.tenantSlug, id);
  }

  @Post(':id/variants')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  createVariant(@Req() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.products.createVariant(req.tenantSlug, id, dto);
  }

  @Patch(':id/variants/:variantId')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  updateVariant(@Req() req: any, @Param('id') id: string, @Param('variantId') variantId: string, @Body() dto: any) {
    return this.products.updateVariant(req.tenantSlug, id, variantId, dto);
  }

  @Delete(':id/variants/:variantId')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  removeVariant(@Req() req: any, @Param('id') id: string, @Param('variantId') variantId: string) {
    return this.products.removeVariant(req.tenantSlug, id, variantId);
  }
}
