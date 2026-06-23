import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('categories')
@UseGuards(JwtAuthGuard, TenantGuard)
export class CategoriesController {
  constructor(private categories: CategoriesService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.categories.findAll(req.tenantSlug);
  }

  @Get('tree')
  getTree(@Req() req: any) {
    return this.categories.getTree(req.tenantSlug);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.categories.findOne(req.tenantSlug, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  create(@Req() req: any, @Body() dto: any) {
    return this.categories.create(req.tenantSlug, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.categories.update(req.tenantSlug, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.categories.remove(req.tenantSlug, id);
  }
}
