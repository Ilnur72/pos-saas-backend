import { PrismaClient } from '@prisma/client';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient: TenantPrismaClient } = require('.prisma/tenant-client');
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { spawn } from 'child_process';
import * as path from 'path';

dotenv.config();

async function runMigration(tenantUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'npx', ['prisma', 'db', 'push', '--schema', 'prisma/tenant-schema.prisma', '--skip-generate', '--accept-data-loss'],
      {
        env: { ...process.env, DATABASE_URL: tenantUrl, TENANT_DATABASE_URL: tenantUrl },
        cwd: path.resolve(__dirname, '..'),
        stdio: 'inherit',
      },
    );
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`prisma db push failed with exit code ${code}`));
    });
  });
}

const prisma = new PrismaClient();

function tenantDb() {
  const base = process.env.DATABASE_URL!;
  const url = new URL(base);
  url.searchParams.set('schema', 'tenant_demo_store');
  return new TenantPrismaClient({ datasources: { db: { url: url.toString() } } }) as any;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}


async function main() {
  // ─── Public schema ───────────────────────────────────────────────────────

  console.log('🌱 Seeding public schema...');

  await prisma.user.upsert({
    where: { email: 'superadmin@warehouse.uz' },
    update: {},
    create: {
      email: 'superadmin@warehouse.uz',
      passwordHash: await bcrypt.hash('SuperAdmin123!', 12),
      name: 'Super Admin',
      isSuperAdmin: true,
    },
  });

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 90);

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-store' },
    update: { status: 'ACTIVE', plan: 'PRO' },
    create: {
      slug: 'demo-store',
      name: "AquaMaster Santexnika",
      plan: 'PRO',
      status: 'ACTIVE',
      trialEndsAt,
      maxSkus: 5000,
      maxUsers: 20,
      maxMonthlyOrders: 2000,
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: 'owner@demo-store.uz' },
    update: {},
    create: {
      email: 'owner@demo-store.uz',
      passwordHash: await bcrypt.hash('Demo123!', 12),
      name: "Do'kon Egasi",
    },
  });

  await prisma.tenantUser.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: owner.id } },
    update: {},
    create: { tenantId: tenant.id, userId: owner.id, role: 'OWNER', joinedAt: new Date() },
  });

  console.log('✅ Public schema seeded');

  // ─── Tenant schema ───────────────────────────────────────────────────────

  console.log('🗑️  Resetting tenant_demo_store schema...');
  await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS tenant_demo_store CASCADE');
  await prisma.$executeRawUnsafe('CREATE SCHEMA tenant_demo_store');
  console.log('✅ Schema reset');

  console.log('🔧 Running migrations for tenant_demo_store...');
  const base = process.env.DATABASE_URL!;
  const tenantUrl = (() => { const u = new URL(base); u.searchParams.set('schema', 'tenant_demo_store'); return u.toString(); })();
  await runMigration(tenantUrl);
  console.log('✅ Migrations applied');

  console.log('🌱 Seeding tenant schema: tenant_demo_store...');
  const db = tenantDb();
  await db.$connect();

  // ─── Categories (ichma-ich daraxt tuzilishi) ──────────────────────────────

  const kranlar = await db.category.upsert({ where: { slug: 'kranlar' }, update: {}, create: { name: 'Kranlar va armatura', slug: 'kranlar', sortOrder: 1 } });
  const trubalar = await db.category.upsert({ where: { slug: 'trubalar' }, update: {}, create: { name: 'Trubalar', slug: 'trubalar', sortOrder: 2 } });
  const fitinglar = await db.category.upsert({ where: { slug: 'fitinglar' }, update: {}, create: { name: 'Fitinglar', slug: 'fitinglar', sortOrder: 3 } });
  const nasoslar = await db.category.upsert({ where: { slug: 'nasoslar' }, update: {}, create: { name: 'Nasoslar va uskunalar', slug: 'nasoslar', sortOrder: 4 } });
  const sanitariya = await db.category.upsert({ where: { slug: 'sanitariya' }, update: {}, create: { name: 'Sanitariya jihozlari', slug: 'sanitariya', sortOrder: 5 } });
  const isitish = await db.category.upsert({ where: { slug: 'isitish' }, update: {}, create: { name: 'Isitish jihozlari', slug: 'isitish', sortOrder: 6 } });

  // Sub-kategoriyalar
  await Promise.all([
    // Kranlar → ichida
    db.category.upsert({ where: { slug: 'aralashtirgich' }, update: {}, create: { name: 'Aralashtirgich', slug: 'aralashtirgich', parentId: kranlar.id, sortOrder: 1 } }),
    db.category.upsert({ where: { slug: 'sharik-kranlar' }, update: {}, create: { name: 'Sharik kranlar', slug: 'sharik-kranlar', parentId: kranlar.id, sortOrder: 2 } }),
    db.category.upsert({ where: { slug: 'oshxona-kranlari' }, update: {}, create: { name: 'Oshxona kranlari', slug: 'oshxona-kranlari', parentId: kranlar.id, sortOrder: 3 } }),

    // Trubalar → ichida
    db.category.upsert({ where: { slug: 'ppr-trubalar' }, update: {}, create: { name: 'PPR trubalar', slug: 'ppr-trubalar', parentId: trubalar.id, sortOrder: 1 } }),
    db.category.upsert({ where: { slug: 'metall-plastik' }, update: {}, create: { name: 'Metall-plastik trubalar', slug: 'metall-plastik', parentId: trubalar.id, sortOrder: 2 } }),
    db.category.upsert({ where: { slug: 'kanalizatsiya' }, update: {}, create: { name: 'Kanalizatsiya trubalari', slug: 'kanalizatsiya', parentId: trubalar.id, sortOrder: 3 } }),

    // Fitinglar → ichida
    db.category.upsert({ where: { slug: 'burchak-fitinglar' }, update: {}, create: { name: 'Burchak fitinglar', slug: 'burchak-fitinglar', parentId: fitinglar.id, sortOrder: 1 } }),
    db.category.upsert({ where: { slug: 'troynik-fitinglar' }, update: {}, create: { name: 'Troyniklar', slug: 'troynik-fitinglar', parentId: fitinglar.id, sortOrder: 2 } }),

    // Sanitariya → ichida
    db.category.upsert({ where: { slug: 'unitazlar' }, update: {}, create: { name: 'Unitazlar', slug: 'unitazlar', parentId: sanitariya.id, sortOrder: 1 } }),
    db.category.upsert({ where: { slug: 'vannalar' }, update: {}, create: { name: 'Vannalar', slug: 'vannalar', parentId: sanitariya.id, sortOrder: 2 } }),
    db.category.upsert({ where: { slug: 'dush-kabina' }, update: {}, create: { name: 'Dush kabinalar', slug: 'dush-kabina', parentId: sanitariya.id, sortOrder: 3 } }),

    // Isitish → ichida
    db.category.upsert({ where: { slug: 'radiatorlar' }, update: {}, create: { name: 'Radiatorlar', slug: 'radiatorlar', parentId: isitish.id, sortOrder: 1 } }),
    db.category.upsert({ where: { slug: 'qozonlar' }, update: {}, create: { name: 'Gaz qozonlari', slug: 'qozonlar', parentId: isitish.id, sortOrder: 2 } }),
    db.category.upsert({ where: { slug: 'issiq-zamin' }, update: {}, create: { name: 'Issiq zamin', slug: 'issiq-zamin', parentId: isitish.id, sortOrder: 3 } }),
  ]);

  const cats = [kranlar, trubalar, fitinglar, nasoslar, sanitariya, isitish];
  console.log('✅ Categories:', cats.length, '+ sub-kategoriyalar');

  // ─── Suppliers ────────────────────────────────────────────────────────────

  const supplierData = [
    { name: 'SantexOpt OAJ',       phone: '+998901234567', email: 'info@santexopt.uz',    address: "Toshkent, Yunusobod, Amir Temur ko'chasi 15" },
    { name: 'UzSantex Savdo',       phone: '+998711234567', email: 'sales@uzsantex.uz',    address: "Toshkent, Chilonzor, Qoratosh 8-kvartal" },
    { name: 'AquaTrade LLC',        phone: '+998931234567', email: 'order@aquatrade.uz',   address: "Toshkent, Shayxontohur, Do'stlik ko'chasi 22" },
    { name: 'ThermoImport',         phone: '+998951234567', email: 'thermo@import.uz',     address: "Toshkent, Sergeli tumani, Yangi Sergeli 5" },
    { name: 'GlobalSantex Samarqand', phone: '+998881234567', email: 'info@globalsantex.uz', address: "Samarqand, Registon ko'chasi 7" },
  ];
  const sups: any[] = [];
  for (const s of supplierData) {
    const existing = await db.supplier.findFirst({ where: { name: s.name } });
    sups.push(existing ?? await db.supplier.create({ data: s }));
  }
  console.log('✅ Suppliers:', sups.length);

  // ─── Products (30 ta) ─────────────────────────────────────────────────────

  const productData = [
    // Kranlar va armatura (7 ta)
    { sku: 'KRN-001', name: 'Grohe Europlus lavabo aralashtirgich',      slug: 'grohe-europlus-lavabo',      catId: kranlar.id,    base: 485000,   sale: 449000,  min: 5,   unit: 'PIECE' },
    { sku: 'KRN-002', name: 'Hansgrohe Logis hammom aralashtirgich',     slug: 'hansgrohe-logis-hammom',     catId: kranlar.id,    base: 620000,   sale: 585000,  min: 5,   unit: 'PIECE' },
    { sku: 'KRN-003', name: "To'sish krani 1/2\" (sharli)",              slug: 'tosish-krani-12',            catId: kranlar.id,    base: 28000,    sale: null,    min: 50,  unit: 'PIECE' },
    { sku: 'KRN-004', name: "To'sish krani 3/4\" (sharli)",              slug: 'tosish-krani-34',            catId: kranlar.id,    base: 35000,    sale: null,    min: 50,  unit: 'PIECE' },
    { sku: 'KRN-005', name: "To'sish krani 1\" (sharli)",                slug: 'tosish-krani-1',             catId: kranlar.id,    base: 48000,    sale: null,    min: 30,  unit: 'PIECE' },
    { sku: 'KRN-006', name: 'Oshxona aralashtirgich (uzun novda)',        slug: 'oshxona-aralashtirgich',     catId: kranlar.id,    base: 320000,   sale: 289000,  min: 8,   unit: 'PIECE' },
    { sku: 'KRN-007', name: ' Vannaxona aralashtirgich (Cersanit)',        slug: ' vannaxona-aralashtirgich',   catId: kranlar.id,    base: 390000,   sale: 359000,  min: 8,   unit: 'PIECE' },
    // Trubalar (5 ta)
    { sku: 'TRB-001', name: 'PPR truba 20mm (1 metr)',                    slug: 'ppr-truba-20mm',             catId: trubalar.id,   base: 8500,     sale: null,    min: 500, unit: 'METER' },
    { sku: 'TRB-002', name: 'PPR truba 25mm (1 metr)',                    slug: 'ppr-truba-25mm',             catId: trubalar.id,   base: 11000,    sale: null,    min: 300, unit: 'METER' },
    { sku: 'TRB-003', name: 'PPR truba 32mm (1 metr)',                    slug: 'ppr-truba-32mm',             catId: trubalar.id,   base: 15000,    sale: null,    min: 200, unit: 'METER' },
    { sku: 'TRB-004', name: 'Metall-plastik truba 16mm (1 metr)',         slug: 'metall-plastik-16mm',        catId: trubalar.id,   base: 12000,    sale: 10500,   min: 300, unit: 'METER' },
    { sku: 'TRB-005', name: 'Metall-plastik truba 20mm (1 metr)',         slug: 'metall-plastik-20mm',        catId: trubalar.id,   base: 15500,    sale: 14000,   min: 200, unit: 'METER' },
    // Fitinglar (6 ta)
    { sku: 'FIT-001', name: 'PPR tirsak 20mm (90°)',                      slug: 'ppr-tirsak-20mm',            catId: fitinglar.id,  base: 2500,     sale: null,    min: 200, unit: 'PIECE' },
    { sku: 'FIT-002', name: 'PPR tirsak 25mm (90°)',                      slug: 'ppr-tirsak-25mm',            catId: fitinglar.id,  base: 3200,     sale: null,    min: 150, unit: 'PIECE' },
    { sku: 'FIT-003', name: 'PPR muft 20mm',                              slug: 'ppr-muft-20mm',              catId: fitinglar.id,  base: 1800,     sale: null,    min: 300, unit: 'PIECE' },
    { sku: 'FIT-004', name: 'PPR muft 25mm',                              slug: 'ppr-muft-25mm',              catId: fitinglar.id,  base: 2200,     sale: null,    min: 200, unit: 'PIECE' },
    { sku: 'FIT-005', name: 'PPR uch yo\'lak (tee) 20mm',                 slug: 'ppr-tee-20mm',               catId: fitinglar.id,  base: 3500,     sale: null,    min: 150, unit: 'PIECE' },
    { sku: 'FIT-006', name: 'PPR uch yo\'lak (tee) 25mm',                 slug: 'ppr-tee-25mm',               catId: fitinglar.id,  base: 4800,     sale: null,    min: 100, unit: 'PIECE' },
    // Nasoslar va uskunalar (4 ta)
    { sku: 'NAS-001', name: 'Grundfos CM 3-2 sikillos nasos',             slug: 'grundfos-cm3-2',             catId: nasoslar.id,   base: 1850000,  sale: 1750000, min: 3,   unit: 'PIECE' },
    { sku: 'NAS-002', name: 'Wilo Stratos PICO 25/1-6 sirkul nasos',     slug: 'wilo-stratos-pico',          catId: nasoslar.id,   base: 1250000,  sale: 1190000, min: 3,   unit: 'PIECE' },
    { sku: 'NAS-003', name: 'Kengaytgich bak (gidrоakkyumulyator) 24L',  slug: 'kengaytgich-bak-24l',        catId: nasoslar.id,   base: 380000,   sale: 349000,  min: 5,   unit: 'PIECE' },
    { sku: 'NAS-004', name: "Pressostat (bosim o'lchagich) PM5",          slug: 'pressostat-pm5',             catId: nasoslar.id,   base: 145000,   sale: null,    min: 10,  unit: 'PIECE' },
    // Sanitariya jihozlari (5 ta)
    { sku: 'SAN-001', name: 'Cersanit Colour унитаз (to\'liq komplet)',   slug: 'cersanit-colour-unitaz',     catId: sanitariya.id, base: 890000,   sale: 829000,  min: 3,   unit: 'PIECE' },
    { sku: 'SAN-002', name: 'Cersanit Economy vanna 120x70',              slug: 'cersanit-economy-vanna',     catId: sanitariya.id, base: 1250000,  sale: null,    min: 2,   unit: 'PIECE' },
    { sku: 'SAN-003', name: 'Vidima lavabo 55sm (osilma)',                 slug: 'vidima-lavabo-55sm',         catId: sanitariya.id, base: 420000,   sale: 389000,  min: 5,   unit: 'PIECE' },
    { sku: 'SAN-004', name: "Duş garniturasi (Grohe Vitalio) to'plami",  slug: 'grohе-vitalio-dus',          catId: sanitariya.id, base: 285000,   sale: 259000,  min: 5,   unit: 'PIECE' },
    { sku: 'SAN-005', name: 'Ideal Standard umivalnik 60sm',              slug: 'ideal-standard-umivalnik',   catId: sanitariya.id, base: 380000,   sale: null,    min: 5,   unit: 'PIECE' },
    // Isitish jihozlari (3 ta)
    { sku: 'ISI-001', name: 'Global ISEO 500 radiator seksiyasi',         slug: 'global-iseo-500',            catId: isitish.id,    base: 75000,    sale: 69000,   min: 50,  unit: 'PIECE' },
    { sku: 'ISI-002', name: 'Ariston Genus One 24 qozon (gaz)',           slug: 'ariston-genus-one-24',       catId: isitish.id,    base: 8500000,  sale: 7990000, min: 1,   unit: 'PIECE' },
    { sku: 'ISI-003', name: 'Issiq zamin quvuri 16mm (1 metr)',           slug: 'issiq-zamin-quvuri-16mm',    catId: isitish.id,    base: 18500,    sale: null,    min: 200, unit: 'METER' },
  ];

  const products: any[] = [];
  for (const p of productData) {
    const prod = await db.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        sku: p.sku, name: p.name, slug: p.slug,
        categoryId: p.catId, basePrice: p.base, salePrice: p.sale,
        minStockLevel: p.min, unit: p.unit, isActive: true,
      },
    });
    products.push(prod);
  }
  console.log('✅ Products:', products.length);

  // ─── Boshlang'ich qoldiq ──────────────────────────────────────────────────

  // Har mahsulot uchun yetkazib beruvchi
  const supMap = [
    sups[0], sups[0], sups[0], sups[0], sups[0], sups[0], sups[0], // kranlar
    sups[1], sups[1], sups[1], sups[1], sups[1],                    // trubalar
    sups[2], sups[2], sups[2], sups[2], sups[2], sups[2],           // fitinglar
    sups[3], sups[3], sups[3], sups[3],                             // nasoslar
    sups[0], sups[0], sups[0], sups[0], sups[0],                    // sanitariya
    sups[4], sups[4], sups[4],                                      // isitish
  ];

  const initialQtys = [
    10, 8, 120, 100, 80, 15, 12,   // kranlar
    800, 600, 400, 500, 350,         // trubalar
    400, 300, 600, 400, 300, 200,    // fitinglar
    5, 4, 10, 18,                    // nasoslar
    6, 4, 10, 12, 8,                 // sanitariya
    80, 2, 400,                      // isitish
  ];

  for (let i = 0; i < products.length; i++) {
    const existing = await db.warehouseTransaction.findFirst({
      where: { productId: products[i].id, type: 'PURCHASE' },
    });
    if (!existing) {
      await db.warehouseTransaction.create({
        data: {
          productId: products[i].id,
          type: 'PURCHASE',
          qty: initialQtys[i],
          unitCost: Math.round(productData[i].base * 0.65),
          supplierId: supMap[i].id,
          note: "Boshlang'ich qoldiq",
          createdBy: owner.id,
          createdAt: daysAgo(90),
        },
      });
    }
  }
  console.log('✅ Initial stock created');

  // ─── Customers (10 ta) ────────────────────────────────────────────────────

  const customerData = [
    { name: 'Aziz Qurilish MChJ',         phone: '+998901111111', email: 'aziz@qurilish.uz' },
    { name: 'Bahodir Santexnik (usta)',    phone: '+998902222222', email: null },
    { name: 'UzQurilish Kompaniyasi',      phone: '+998903333333', email: 'info@uzqurilish.uz' },
    { name: 'Rustam Abbosov (usta)',       phone: '+998904444444', email: null },
    { name: 'Golden Build LLC',            phone: '+998905555555', email: 'order@goldenbuild.uz' },
    { name: 'Sardor Xasanov (usta)',       phone: '+998906666666', email: null },
    { name: 'QurMaster OAJ',              phone: '+998907777777', email: 'info@qurmaster.uz' },
    { name: 'Dilshod Nazarov (usta)',      phone: '+998908888888', email: null },
    { name: 'Mega Qurilish',              phone: '+998909999999', email: 'mega@qurilish.uz' },
    { name: 'Jamoliddin Holiqov (usta)',   phone: '+998900000000', email: null },
  ];

  const customers: any[] = [];
  for (const c of customerData) {
    const cust = await db.customer.upsert({
      where: { phone: c.phone },
      update: {},
      create: c,
    });
    customers.push(cust);
  }
  console.log('✅ Customers:', customers.length);

  // ─── Orders (25 ta) ───────────────────────────────────────────────────────

  const statuses = [
    'DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED',
    'DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED',
    'DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED',
    'PROCESSING', 'PROCESSING', 'PROCESSING',
    'PENDING', 'PENDING', 'PENDING',
    'CONFIRMED', 'CONFIRMED',
    'CANCELLED', 'CANCELLED',
  ];
  const payMethods = [
    'CASH', 'PAYME', 'TRANSFER', 'CASH', 'TRANSFER',
    'CASH', 'PAYME', 'CASH', 'TRANSFER', 'CASH',
    'CASH', 'TRANSFER', 'CASH', 'PAYME', 'CASH',
    'CASH', 'PAYME', 'TRANSFER', 'CASH', 'CASH',
    'PAYME', 'CASH', 'TRANSFER', 'CASH', 'CASH',
  ];
  const orderDays = [
    88, 82, 75, 70, 65, 60, 55, 50, 45, 42,
    38, 34, 30, 27, 24,
    20, 17, 14,
    10, 7, 5,
    3, 2,
    1, 0,
  ];

  // [productIndex, qty, unitPrice]
  const orderProducts: [number, number, number][][] = [
    [[2, 8, 28000], [3, 5, 35000], [14, 20, 1800]],              // kranlar + fitinglar
    [[0, 1, 449000], [6, 1, 359000], [12, 10, 2500]],            // 2 ta kran + tirsak
    [[7, 50, 8500], [8, 30, 11000], [12, 60, 2500]],             // trubalar + fitinglar
    [[18, 1, 1750000], [20, 1, 349000], [21, 2, 145000]],        // nasos to'plami
    [[22, 2, 829000], [23, 1, 1250000], [3, 4, 35000]],          // sanitariya
    [[27, 10, 69000], [29, 50, 18500]],                          // isitish
    [[0, 2, 449000], [5, 2, 289000], [2, 6, 28000]],             // kranlar
    [[7, 100, 8500], [9, 60, 15000], [13, 80, 3200]],            // trubalar + fitinglar
    [[22, 1, 829000], [24, 1, 389000], [3, 8, 35000]],           // sanitariya
    [[19, 1, 1190000], [20, 2, 349000]],                         // nasos + bak
    [[2, 20, 28000], [4, 10, 48000], [14, 30, 1800], [15, 20, 2200]], // to'sish kranlar + muftlar
    [[28, 1, 7990000]],                                          // qozon (katta buyurtma)
    [[7, 200, 8500], [10, 150, 12000], [12, 120, 2500]],         // trubalar ulgurji
    [[22, 3, 829000], [25, 3, 259000]],                          // sanitariya
    [[27, 20, 69000], [29, 100, 18500], [20, 1, 349000]],        // isitish
    [[1, 1, 585000], [6, 1, 359000], [2, 4, 28000]],             // kranlar
    [[8, 80, 11000], [9, 40, 15000], [16, 60, 3500]],            // trubalar + tee
    [[18, 2, 1750000], [21, 3, 145000]],                         // nasoslar
    [[22, 1, 829000], [24, 2, 389000]],                          // sanitariya
    [[2, 15, 28000], [3, 10, 35000], [4, 5, 48000]],             // kranlar
    [[27, 5, 69000], [29, 30, 18500]],                           // isitish
    [[0, 1, 449000], [5, 1, 289000]],                            // kranlar
    [[7, 30, 8500], [12, 40, 2500], [14, 30, 1800]],             // trubalar + fitinglar
    [[18, 1, 1750000]],                                          // cancelled — nasos
    [[22, 1, 829000]],                                           // cancelled — unitaz
  ];

  let orderCount = 0;
  for (let i = 0; i < 25; i++) {
    const num = String(i + 1).padStart(4, '0');
    const orderNum = `ORD-2026-${num}`;
    const existing = await db.order.findUnique({ where: { orderNumber: orderNum } });
    if (existing) continue;

    const customer = customers[i % customers.length];
    const status = statuses[i] as any;
    const payMethod = payMethods[i] as any;
    const createdAt = daysAgo(orderDays[i]);
    const items = orderProducts[i];

    let subtotal = 0;
    const itemsData = items.map(([pidx, qty, price]: [number, number, number]) => {
      const prod = products[Math.min(pidx, products.length - 1)];
      const total = qty * price;
      subtotal += total;
      return { productId: prod.id, qty, unitPrice: price, totalPrice: total, productSnapshot: { name: prod.name, sku: prod.sku } };
    });

    const isPaid = ['DELIVERED', 'PROCESSING', 'CONFIRMED'].includes(status);
    const order = await db.order.create({
      data: {
        orderNumber: orderNum,
        status,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        subtotal,
        totalAmount: subtotal,
        paymentMethod: payMethod,
        paymentStatus: isPaid ? 'PAID' : 'UNPAID',
        paidAt: isPaid ? createdAt : null,
        createdBy: owner.id,
        createdAt,
        updatedAt: createdAt,
        items: { create: itemsData },
      },
    });

    if (['DELIVERED', 'CONFIRMED', 'PROCESSING'].includes(status)) {
      for (const item of itemsData) {
        await db.warehouseTransaction.create({
          data: {
            productId: item.productId,
            type: 'SALE',
            qty: -item.qty,
            orderId: order.id,
            createdBy: owner.id,
            createdAt,
          },
        });
      }
      await db.customer.update({
        where: { id: customer.id },
        data: {
          totalOrders: { increment: 1 },
          totalSpent: { increment: subtotal },
          lastOrderAt: createdAt,
        },
      });
    }

    orderCount++;
  }
  console.log('✅ Orders:', orderCount);

  // ─── Price rules ──────────────────────────────────────────────────────────

  const priceRuleExists = await db.priceRule.findFirst();
  if (!priceRuleExists) {
    await db.priceRule.createMany({
      data: [
        { name: 'Ulgurji chegirma (VIP mijoz)', type: 'PERCENT', target: 'ALL', value: 7, direction: 'DECREASE', priority: 2, isActive: true, stackable: false },
        { name: 'Sanitariya jihozlari -5%',     type: 'PERCENT', target: 'CATEGORY', targetId: sanitariya.id, value: 5, direction: 'DECREASE', priority: 1, isActive: true, stackable: true },
        { name: 'Isitish jihozlari bayram aksiya', type: 'PERCENT', target: 'CATEGORY', targetId: isitish.id, value: 10, direction: 'DECREASE', priority: 3, isActive: false, stackable: false },
      ],
    });
    console.log('✅ Price rules: 3');
  }

  // ─── Purchase orders ──────────────────────────────────────────────────────

  const poExists = await db.purchaseOrder.findFirst();
  if (!poExists) {
    await db.purchaseOrder.create({
      data: {
        orderNumber: 'PO-2026-001',
        supplierId: sups[0].id,
        status: 'RECEIVED',
        createdBy: owner.id,
        createdAt: daysAgo(45),
        items: {
          create: [
            { productId: products[0].id, requestedQty: 10,  receivedQty: 10,  unitCost: Math.round(productData[0].base * 0.65) },
            { productId: products[2].id, requestedQty: 100, receivedQty: 100, unitCost: Math.round(productData[2].base * 0.65) },
            { productId: products[3].id, requestedQty: 80,  receivedQty: 80,  unitCost: Math.round(productData[3].base * 0.65) },
          ],
        },
      },
    });

    await db.purchaseOrder.create({
      data: {
        orderNumber: 'PO-2026-002',
        supplierId: sups[1].id,
        status: 'CONFIRMED',
        createdBy: owner.id,
        createdAt: daysAgo(15),
        items: {
          create: [
            { productId: products[7].id, requestedQty: 500, unitCost: Math.round(productData[7].base * 0.65) },
            { productId: products[8].id, requestedQty: 300, unitCost: Math.round(productData[8].base * 0.65) },
            { productId: products[9].id, requestedQty: 200, unitCost: Math.round(productData[9].base * 0.65) },
          ],
        },
      },
    });

    await db.purchaseOrder.create({
      data: {
        orderNumber: 'PO-2026-003',
        supplierId: sups[4].id,
        status: 'DRAFT',
        createdBy: owner.id,
        createdAt: daysAgo(3),
        items: {
          create: [
            { productId: products[27].id, requestedQty: 50, unitCost: Math.round(productData[27].base * 0.65) },
            { productId: products[28].id, requestedQty: 2,  unitCost: Math.round(productData[28].base * 0.65) },
          ],
        },
      },
    });
    console.log('✅ Purchase orders: 3');
  }

  await db.$disconnect();

  console.log('\n✅ Demo data seeding complete!');
  console.log('\n📋 Login credentials:');
  console.log('  Tenant:     slug=demo-store | owner@demo-store.uz / Demo123!');
  console.log('  SuperAdmin: superadmin@warehouse.uz / SuperAdmin123!');
  console.log('\n📊 Demo data (Santexnika):');
  console.log('  6 kategoriya (kranlar, trubalar, fitinglar, nasoslar, sanitariya, isitish)');
  console.log('  30 mahsulot, 5 yetkazib beruvchi, 10 mijoz (ustalar va qurilish kompaniyalari)');
  console.log('  25 buyurtma, 3 narx qoidasi, 3 zakaz buyurtma');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
