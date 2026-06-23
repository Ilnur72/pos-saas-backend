import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { LoginDto, SuperAdminLoginDto } from './dto/login.dto';
import { InviteUserDto, AcceptInviteDto } from './dto/invite-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SkipTenantGuard } from '../../common/decorators/skip-tenant-guard.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('auth')
@SkipTenantGuard()
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterTenantDto) {
    return this.auth.registerTenant(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('superadmin/login')
  superAdminLogin(@Body() dto: SuperAdminLoginDto) {
    return this.auth.superAdminLogin(dto);
  }

  @Post('refresh')
  refresh(@Body('refreshToken') token: string) {
    return this.auth.refresh(token);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: { sub: string }) {
    return this.auth.logout(user.sub);
  }

  @Post('invite')
  @UseGuards(JwtAuthGuard)
  @Roles('OWNER', 'ADMIN')
  invite(@Body() dto: InviteUserDto, @Req() req: any) {
    return this.auth.inviteUser(req.tenant.id, dto, req.user.sub);
  }

  @Post('accept-invite')
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.auth.acceptInvite(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: any, @Req() req: any) {
    return {
      user,
      tenant: req.tenant ?? null,
      role: req.tenantRole ?? null,
    };
  }
}
