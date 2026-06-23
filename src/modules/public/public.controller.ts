import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PublicService } from './public.service';

// Onlayn do'kon endpointlari — auth talab qilmaydi, tenant slug URL'da
@Controller('public/:tenantSlug')
export class PublicController {
  constructor(private publicService: PublicService) {}

  @Get('info')
  getTenantInfo(@Param('tenantSlug') tenantSlug: string) {
    return this.publicService.getTenantInfo(tenantSlug);
  }

  @Get('categories')
  getCategories(@Param('tenantSlug') tenantSlug: string) {
    return this.publicService.getCategories(tenantSlug);
  }

  @Get('products')
  getProducts(
    @Param('tenantSlug') tenantSlug: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('featured') featured?: string,
  ) {
    return this.publicService.getProducts(tenantSlug, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search,
      categoryId,
      featured: featured === 'true' ? true : featured === 'false' ? false : undefined,
    });
  }

  @Get('products/:slug')
  getProduct(@Param('tenantSlug') tenantSlug: string, @Param('slug') slug: string) {
    return this.publicService.getProductBySlug(tenantSlug, slug);
  }

  @Post('orders')
  createOrder(@Param('tenantSlug') tenantSlug: string, @Body() dto: any) {
    return this.publicService.createOrder(tenantSlug, dto);
  }

  @Get('orders/:orderNumber')
  getOrderStatus(@Param('tenantSlug') tenantSlug: string, @Param('orderNumber') orderNumber: string) {
    return this.publicService.getOrderStatus(tenantSlug, orderNumber);
  }
}
