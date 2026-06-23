import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService, slugToSchema, buildTenantUrl } from '../../prisma/tenant-prisma.service';

@Injectable()
export class TenantProvisioningService {
  private readonly logger = new Logger(TenantProvisioningService.name);

  constructor(
    private prisma: PrismaService,
    private tenantPrisma: TenantPrismaService,
    private config: ConfigService,
  ) {}

  async provisionTenant(tenantSlug: string): Promise<void> {
    const schemaName = slugToSchema(tenantSlug);
    this.logger.log(`Provisioning tenant schema: ${schemaName}`);

    const baseUrl = this.config.get<string>('databaseUrl')!;

    // 1. Schema yaratish
    await this.prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    // 2. Tenant schema ga migrate deploy
    await this.runMigrate(schemaName, baseUrl);

    // 3. Default data seed
    await this.seedDefaults(tenantSlug);

    this.logger.log(`Tenant ${tenantSlug} provisioned successfully`);
  }

  async deprovisionTenant(tenantSlug: string): Promise<void> {
    const schemaName = slugToSchema(tenantSlug);
    this.logger.log(`Deprovisioning tenant: ${schemaName}`);

    await this.prisma.tenant.update({
      where: { slug: tenantSlug },
      data: { status: 'CANCELLED' },
    });

    // Hard delete after 30 days — run this in a scheduled job
    await this.prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  }

  private async runMigrate(schemaName: string, baseUrl: string): Promise<void> {
    const tenantUrl = buildTenantUrl(schemaName, baseUrl);
    const schemaPath = path.resolve(process.cwd(), 'prisma', 'tenant-schema.prisma');

    return new Promise((resolve, reject) => {
      const child = spawn(
        'npx',
        ['prisma', 'migrate', 'deploy', '--schema', schemaPath],
        {
          env: { ...process.env, DATABASE_URL: tenantUrl, TENANT_DATABASE_URL: tenantUrl },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      let stderr = '';
      child.stderr?.on('data', (d) => (stderr += d.toString()));
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Migration failed for ${schemaName}: ${stderr}`));
      });
    });
  }

  private async seedDefaults(tenantSlug: string): Promise<void> {
    const db = await this.tenantPrisma.getClient(tenantSlug);

    const defaultCategories = [
      { name: 'Umumiy', slug: 'umumiy', sortOrder: 1 },
      { name: 'Oziq-ovqat', slug: 'oziq-ovqat', sortOrder: 2 },
      { name: 'Kiyim', slug: 'kiyim', sortOrder: 3 },
      { name: 'Elektronika', slug: 'elektronika', sortOrder: 4 },
      { name: 'Boshqa', slug: 'boshqa', sortOrder: 5 },
    ];

    for (const cat of defaultCategories) {
      await (db as any).category.upsert({
        where: { slug: cat.slug },
        update: {},
        create: cat,
      });
    }

    await (db as any).supplier.upsert({
      where: { name: 'Noma\'lum' },
      update: {},
      create: { name: 'Noma\'lum', isActive: true },
    }).catch(() => {
      // ignore if upsert fails due to missing unique field
    });
  }
}
