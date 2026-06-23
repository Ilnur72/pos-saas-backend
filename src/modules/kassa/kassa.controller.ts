import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { KassaService } from './kassa.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Controller('kassa')
@UseGuards(JwtAuthGuard, TenantGuard)
export class KassaController {
  constructor(private kassa: KassaService) {}

  @Get('session/current')
  getCurrentSession(@Req() req: any) {
    return this.kassa.getCurrentSession(req.tenantSlug);
  }

  @Get('session/:id/stats')
  getSessionStats(@Req() req: any, @Param('id') id: string) {
    return this.kassa.getSessionStats(req.tenantSlug, id);
  }

  @Post('session/open')
  openSession(@Req() req: any, @Body() body: { openingCash?: number }) {
    return this.kassa.openSession(req.tenantSlug, req.user.sub, body.openingCash ?? 0);
  }

  @Post('session/:id/close')
  closeSession(@Req() req: any, @Param('id') id: string, @Body() body: { closingCash?: number; notes?: string }) {
    return this.kassa.closeSession(req.tenantSlug, req.user.sub, id, body.closingCash ?? 0, body.notes);
  }

  @Get('products')
  searchProducts(@Req() req: any, @Query('q') q: string, @Query('categoryId') categoryId?: string) {
    return this.kassa.searchProducts(req.tenantSlug, q ?? '', categoryId);
  }

  @Post('checkout')
  checkout(
    @Req() req: any,
    @Body() body: {
      items: { productId: string; qty: number; unitPrice: number }[];
      paymentMethod: string;
      sessionId?: string;
      customerName?: string;
      customerPhone?: string;
      tendered?: number;
      discount?: number;
      note?: string;
    },
  ) {
    return this.kassa.checkout(req.tenantSlug, req.user.sub, body);
  }
}
