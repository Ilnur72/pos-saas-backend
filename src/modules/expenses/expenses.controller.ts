import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('expenses')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ExpensesController {
  constructor(private expenses: ExpensesService) {}

  @Get()
  findAll(@Req() req: any, @Query() query: any) {
    return this.expenses.findAll(req.tenantSlug, query);
  }

  @Get('summary')
  getSummary(@Req() req: any, @Query('from') from: string, @Query('to') to: string) {
    return this.expenses.getSummary(req.tenantSlug, from, to);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.expenses.findOne(req.tenantSlug, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER')
  create(@Req() req: any, @Body() dto: any) {
    return this.expenses.create(req.tenantSlug, req.user.sub, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.expenses.update(req.tenantSlug, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.expenses.remove(req.tenantSlug, id);
  }
}
