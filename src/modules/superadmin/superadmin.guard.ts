import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private jwt: JwtService, private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException();

    try {
      const payload = this.jwt.verify(auth.slice(7), {
        secret: this.config.get<string>('jwt.superadminSecret'),
      });
      if (!payload.isSuperAdmin) throw new UnauthorizedException();
      request.superAdmin = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Super admin token yaroqsiz');
    }
  }
}
