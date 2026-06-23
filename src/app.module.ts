import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from '@nestjs-modules/ioredis';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import configuration, { validationSchema } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { TenantProvisioningModule } from './modules/tenant-provisioning/tenant-provisioning.module';
import { ProductsModule } from './modules/products/products.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { WarehouseModule } from './modules/warehouse/warehouse.module';
import { OrdersModule } from './modules/orders/orders.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { CustomersModule } from './modules/customers/customers.module';
import { BillingModule } from './modules/billing/billing.module';
import { SuperAdminModule } from './modules/superadmin/superadmin.module';
import { UploadModule } from './modules/upload/upload.module';
import { PurchaseOrdersModule } from './modules/purchase-orders/purchase-orders.module';
import { ImportModule } from './modules/import/import.module';
import { ReportsModule } from './modules/reports/reports.module';
import { PriceRulesModule } from './modules/price-rules/price-rules.module';
import { KassaModule } from './modules/kassa/kassa.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { PublicModule } from './modules/public/public.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),
    ScheduleModule.forRoot(),
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({ secret: config.get('jwt.secret') }),
      inject: [ConfigService],
    }),
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'single' as const,
        url: `redis://${config.get('redis.host')}:${config.get('redis.port')}`,
        options: config.get('redis.password') ? { password: config.get('redis.password') } : {},
      }),
      inject: [ConfigService],
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    PrismaModule,
    TenantProvisioningModule,
    AuthModule,
    TenantModule,
    ProductsModule,
    CategoriesModule,
    WarehouseModule,
    OrdersModule,
    SuppliersModule,
    CustomersModule,
    BillingModule,
    SuperAdminModule,
    UploadModule,
    PurchaseOrdersModule,
    ImportModule,
    ReportsModule,
    PriceRulesModule,
    KassaModule,
    ExpensesModule,
    TelegramModule,
    PublicModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
