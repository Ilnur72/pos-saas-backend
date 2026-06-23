import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '.prisma/tenant-client';

export function slugToSchema(slug: string): string {
  return 'tenant_' + slug.replace(/-/g, '_').replace(/[^a-z0-9_]/gi, '').toLowerCase();
}

export function buildTenantUrl(schemaName: string, baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('schema', schemaName);
  return url.toString();
}

interface PoolEntry {
  client: PrismaClient;
  lastUsed: number;
  refCount: number;
}

@Injectable()
export class TenantPrismaService implements OnModuleDestroy {
  private pool = new Map<string, PoolEntry>();
  private maxPoolSize: number;
  private cleanupInterval: NodeJS.Timeout;

  constructor(private config: ConfigService) {
    this.maxPoolSize = config.get<number>('maxPoolSize') ?? 50;
    // Cleanup unused clients every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  async getClient(tenantSlug: string): Promise<PrismaClient> {
    const schemaName = slugToSchema(tenantSlug);
    const existing = this.pool.get(schemaName);

    if (existing) {
      existing.lastUsed = Date.now();
      existing.refCount++;
      return existing.client;
    }

    if (this.pool.size >= this.maxPoolSize) {
      await this.evictLRU();
    }

    const baseUrl = this.config.get<string>('databaseUrl')!;
    const tenantUrl = buildTenantUrl(schemaName, baseUrl);

    const client = new PrismaClient({
      datasources: { db: { url: tenantUrl } },
      log: process.env.NODE_ENV === 'development'
        ? [{ level: 'warn', emit: 'stdout' }]
        : [],
    });

    await client.$connect();

    this.pool.set(schemaName, { client, lastUsed: Date.now(), refCount: 1 });
    return client;
  }

  private async evictLRU(): Promise<void> {
    let oldest: [string, PoolEntry] | null = null;
    for (const entry of this.pool.entries()) {
      if (!oldest || entry[1].lastUsed < oldest[1].lastUsed) {
        oldest = entry;
      }
    }
    if (oldest) {
      await oldest[1].client.$disconnect();
      this.pool.delete(oldest[0]);
    }
  }

  private async cleanup(): Promise<void> {
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const [key, entry] of this.pool.entries()) {
      if (entry.lastUsed < tenMinutesAgo && entry.refCount === 0) {
        await entry.client.$disconnect();
        this.pool.delete(key);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.cleanupInterval);
    await Promise.all(
      Array.from(this.pool.values()).map((e) => e.client.$disconnect()),
    );
    this.pool.clear();
  }
}
