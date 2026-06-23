import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private jwt: JwtService,
    private config: ConfigService,
    private prisma: PrismaService,
    private tenantPrisma: TenantPrismaService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.slice(7);
    let payload: { sub: string; tenantSlug?: string; role?: string; isSuperAdmin?: boolean };

    try {
      payload = this.jwt.verify(token, {
        secret: this.config.get('jwt.secret'),
      });
    } catch {
      return next();
    }

    if (payload.isSuperAdmin) {
      (req as any).user = payload;
      return next();
    }

    if (!payload.tenantSlug) {
      return next();
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: payload.tenantSlug },
    });

    if (!tenant) {
      throw new HttpException('Tenant topilmadi', HttpStatus.NOT_FOUND);
    }

    if (tenant.status === 'SUSPENDED') {
      throw new HttpException(
        { message: 'Hisob to\'xtatilgan. To\'lov qiling.', code: 'SUSPENDED' },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    (req as any).tenantSlug = tenant.slug;
    (req as any).tenant = tenant;
    (req as any).tenantRole = payload.role;
    (req as any).user = payload;

    const db = await this.tenantPrisma.getClient(tenant.slug);
    (req as any).tenantDb = db;

    next();
  }
}
