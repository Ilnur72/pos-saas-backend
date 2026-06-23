import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import * as bcrypt from 'bcrypt';
import slugify from 'slugify';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantProvisioningService } from '../tenant-provisioning/tenant-provisioning.service';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { LoginDto, SuperAdminLoginDto } from './dto/login.dto';
import { InviteUserDto, AcceptInviteDto } from './dto/invite-user.dto';
import { TenantRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private provisioning: TenantProvisioningService,
    @InjectRedis() private redis: Redis,
  ) {}

  async registerTenant(dto: RegisterTenantDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Bu email allaqachon ro\'yxatdan o\'tgan');

    const slug = await this.generateUniqueSlug(dto.tenantName);
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: dto.email, passwordHash, name: dto.ownerName, phone: dto.phone },
      });

      const tenant = await tx.tenant.create({
        data: { slug, name: dto.tenantName, plan: 'FREE', status: 'TRIAL', trialEndsAt },
      });

      await tx.tenantUser.create({
        data: { tenantId: tenant.id, userId: user.id, role: 'OWNER', joinedAt: new Date() },
      });

      return { user, tenant };
    });

    await this.provisioning.provisionTenant(slug);

    const tokens = await this.generateTokens(
      result.user.id,
      result.user.email,
      slug,
      'OWNER',
    );

    return { ...tokens, tenant: { id: result.tenant.id, slug, name: result.tenant.name, plan: result.tenant.plan } };
  }

  async login(dto: LoginDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: dto.tenantSlug } });
    if (!tenant) throw new NotFoundException('Tenant topilmadi');

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Email yoki parol noto\'g\'ri');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Email yoki parol noto\'g\'ri');

    const tenantUser = await this.prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    });
    if (!tenantUser?.isActive) throw new UnauthorizedException('Ruxsat yo\'q');

    const tokens = await this.generateTokens(user.id, user.email, tenant.slug, tenantUser.role);
    return { ...tokens, role: tenantUser.role, tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, plan: tenant.plan } };
  }

  async superAdminLogin(dto: SuperAdminLoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user?.isSuperAdmin) throw new UnauthorizedException('Ruxsat yo\'q');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Email yoki parol noto\'g\'ri');

    const secret = this.config.get<string>('jwt.superadminSecret')!;
    const token = this.jwt.sign(
      { sub: user.id, email: user.email, isSuperAdmin: true },
      { secret, expiresIn: '8h' },
    );

    return { accessToken: token, user: { id: user.id, email: user.email, name: user.name } };
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; tenantSlug?: string; role?: string };
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: this.config.get('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token yaroqsiz');
    }

    const stored = await this.redis.get(`refresh:${payload.sub}`);
    if (stored !== refreshToken) throw new UnauthorizedException('Refresh token muddati o\'tgan');

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException();

    return this.generateTokens(user.id, user.email, payload.tenantSlug!, payload.role as TenantRole);
  }

  async logout(userId: string) {
    await this.redis.del(`refresh:${userId}`);
  }

  async inviteUser(tenantId: string, dto: InviteUserDto, invitedBy: string) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (user) {
      const exists = await this.prisma.tenantUser.findFirst({
        where: { tenantId, userId: user.id },
      });
      if (exists) throw new ConflictException('Foydalanuvchi allaqachon do\'konda bor');
    }

    const token = uuid();
    const inviteData = JSON.stringify({ tenantId, email: dto.email, role: dto.role, invitedBy });
    await this.redis.setex(`invite:${token}`, 48 * 3600, inviteData);

    return { token, message: 'Taklif yuborildi' };
  }

  async acceptInvite(dto: AcceptInviteDto) {
    const raw = await this.redis.get(`invite:${dto.token}`);
    if (!raw) throw new BadRequestException('Taklif topilmadi yoki muddati o\'tgan');

    const invite: { tenantId: string; email: string; role: TenantRole } = JSON.parse(raw);

    let user = await this.prisma.user.findUnique({ where: { email: invite.email } });
    if (!user) {
      const passwordHash = await bcrypt.hash(dto.password, 12);
      user = await this.prisma.user.create({
        data: { email: invite.email, passwordHash, name: dto.name },
      });
    }

    await this.prisma.tenantUser.create({
      data: { tenantId: invite.tenantId, userId: user.id, role: invite.role, joinedAt: new Date() },
    });

    await this.redis.del(`invite:${dto.token}`);
    return { message: 'Muvaffaqiyatli qo\'shildi' };
  }

  private async generateTokens(userId: string, email: string, tenantSlug: string, role: TenantRole) {
    const secret = this.config.get<string>('jwt.secret')!;
    const refreshSecret = this.config.get<string>('jwt.refreshSecret')!;

    const accessToken = this.jwt.sign(
      { sub: userId, email, tenantSlug, role },
      { secret, expiresIn: this.config.get('jwt.expiresIn') ?? '15m' },
    );

    const refreshToken = this.jwt.sign(
      { sub: userId, tenantSlug, role },
      { secret: refreshSecret, expiresIn: this.config.get('jwt.refreshExpiresIn') ?? '7d' },
    );

    await this.redis.setex(`refresh:${userId}`, 7 * 24 * 3600, refreshToken);

    return { accessToken, refreshToken };
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name, { lower: true, strict: true });
    let slug = base;
    let attempt = 0;
    while (await this.prisma.tenant.findUnique({ where: { slug } })) {
      attempt++;
      slug = `${base}-${attempt}`;
    }
    return slug;
  }
}
