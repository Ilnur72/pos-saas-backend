import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { UpdateTenantSettingsDto, UpdateOnboardingDto, UpdateDomainDto } from './dto/update-tenant-settings.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('tenant')
@UseGuards(JwtAuthGuard, TenantGuard)
export class TenantController {
  constructor(private tenantService: TenantService) {}

  @Get('me')
  getMe(@Req() req: any) {
    return this.tenantService.getMe(req.tenantSlug);
  }

  @Patch('settings')
  @Roles('OWNER', 'ADMIN')
  updateSettings(@Req() req: any, @Body() dto: UpdateTenantSettingsDto) {
    return this.tenantService.updateSettings(req.tenantSlug, dto);
  }

  @Patch('onboarding')
  updateOnboarding(@Req() req: any, @Body() dto: UpdateOnboardingDto) {
    return this.tenantService.updateOnboarding(req.tenantSlug, dto);
  }

  @Patch('domain')
  @Roles('OWNER')
  updateDomain(@Req() req: any, @Body() dto: UpdateDomainDto) {
    return this.tenantService.updateDomain(req.tenantSlug, dto);
  }

  @Get('users')
  getUsers(@Req() req: any) {
    return this.tenantService.getUsers(req.tenantSlug);
  }
}
