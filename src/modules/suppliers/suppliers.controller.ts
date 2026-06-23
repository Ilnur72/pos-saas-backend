import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('suppliers')
@UseGuards(JwtAuthGuard, TenantGuard)
export class SuppliersController {
  constructor(private suppliers: SuppliersService) {}

  @Get()
  findAll(@Req() req: any, @Query() query: any) {
    return this.suppliers.findAll(req.tenantSlug, query);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.suppliers.findOne(req.tenantSlug, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  create(@Req() req: any, @Body() dto: any) {
    return this.suppliers.create(req.tenantSlug, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.suppliers.update(req.tenantSlug, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.suppliers.remove(req.tenantSlug, id);
  }
}
