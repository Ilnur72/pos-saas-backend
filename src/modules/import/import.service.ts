import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import * as ExcelJS from 'exceljs';
import slugify from 'slugify';
import { v4 as uuid } from 'uuid';

interface ImportRow {
  name: string; sku?: string; category?: string; description?: string;
  basePrice?: number; salePrice?: number; minStockLevel?: number; isActive?: boolean;
}
interface ImportError { row: number; field: string; value: string; message: string }
export interface ImportResult { total: number; success: number; errors: ImportError[]; created: number; updated: number }

@Injectable()
export class ImportService {
  constructor(private tenantPrisma: TenantPrismaService) {}

  private async db(slug: string) {
    return this.tenantPrisma.getClient(slug) as any;
  }

  async getTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Mahsulotlar');

    ws.columns = [
      { header: 'nomi*', key: 'name', width: 30 },
      { header: 'sku', key: 'sku', width: 15 },
      { header: 'kategoriya', key: 'category', width: 20 },
      { header: 'tavsif', key: 'description', width: 40 },
      { header: 'asosiy_narx*', key: 'basePrice', width: 15 },
      { header: 'sotuv_narxi', key: 'salePrice', width: 15 },
      { header: 'min_stok', key: 'minStockLevel', width: 12 },
      { header: 'aktiv', key: 'isActive', width: 10 },
    ];

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9D5FF' } };

    ws.addRow(['Misol mahsulot', 'SKU-001', 'Elektronika', 'Tavsif matni', 150000, 120000, 5, true]);
    ws.addRow(['Ikkinchi mahsulot', 'SKU-002', 'Kiyim', '', 80000, '', 10, true]);

    const infoWs = wb.addWorksheet("Ko'rsatmalar");
    infoWs.addRow(['Maydon', 'Tavsif', 'Majburiy']);
    const cols = [
      ['nomi', 'Mahsulot nomi', 'Ha'],
      ['sku', 'Unikal kod (avtomatik yaratiladi)', "Yo'q"],
      ['kategoriya', 'Kategoriya nomi (mavjud bo\'lmasa yaratiladi)', "Yo'q"],
      ['tavsif', 'Mahsulot tavsifi', "Yo'q"],
      ['asosiy_narx', 'Asosiy narx (so\'m)', 'Ha'],
      ['sotuv_narxi', 'Sotuv narxi (bo\'sh bo\'lsa asosiy narx qo\'llaniladi)', "Yo'q"],
      ['min_stok', 'Minimum stok darajasi', "Yo'q"],
      ['aktiv', 'true yoki false', "Yo'q"],
    ];
    cols.forEach((c) => infoWs.addRow(c));
    infoWs.getRow(1).font = { bold: true };

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async importProducts(tenantSlug: string, file: Express.Multer.File, options: { updateExisting?: boolean; skipErrors?: boolean }): Promise<ImportResult> {
    if (!file) throw new BadRequestException('Fayl yuklanmadi');

    const rows = await this.parseFile(file);
    const db = await this.db(tenantSlug);

    const result: ImportResult = { total: rows.length, success: 0, errors: [], created: 0, updated: 0 };

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const row = rows[i];

      if (!row.name?.trim()) {
        result.errors.push({ row: rowNum, field: 'nomi', value: '', message: 'Nom bo\'sh bo\'lishi mumkin emas' });
        if (!options.skipErrors) break;
        continue;
      }

      if (row.basePrice == null || isNaN(row.basePrice) || row.basePrice < 0) {
        result.errors.push({ row: rowNum, field: 'asosiy_narx', value: String(row.basePrice), message: 'Narx noto\'g\'ri' });
        if (!options.skipErrors) break;
        continue;
      }

      try {
        let categoryId: string | null = null;
        if (row.category?.trim()) {
          const cat = await db.category.upsert({
            where: { slug: slugify(row.category.trim(), { lower: true, strict: true }) },
            update: {},
            create: {
              name: row.category.trim(),
              slug: slugify(row.category.trim(), { lower: true, strict: true }),
            },
          });
          categoryId = cat.id;
        }

        const sku = row.sku?.trim() || `SKU-${uuid().slice(0, 6).toUpperCase()}`;
        const existing = await db.product.findUnique({ where: { sku } });

        const data = {
          name: row.name.trim(),
          slug: await this.uniqueSlug(db, row.name.trim(), existing?.id),
          categoryId,
          description: row.description?.trim() || null,
          basePrice: row.basePrice,
          salePrice: row.salePrice ?? null,
          minStockLevel: row.minStockLevel ?? 0,
          isActive: row.isActive !== false,
        };

        if (existing) {
          if (options.updateExisting) {
            await db.product.update({ where: { id: existing.id }, data });
            result.updated++;
          }
        } else {
          await db.product.create({ data: { ...data, sku } });
          result.created++;
        }
        result.success++;
      } catch (e: any) {
        result.errors.push({ row: rowNum, field: '', value: '', message: e.message ?? 'Noma\'lum xato' });
        if (!options.skipErrors) break;
      }
    }

    return result;
  }

  private async parseFile(file: Express.Multer.File): Promise<ImportRow[]> {
    const wb = new ExcelJS.Workbook();
    const ext = file.originalname.split('.').pop()?.toLowerCase();

    if (ext === 'xlsx' || ext === 'xls') {
      await wb.xlsx.load(file.buffer as any);
      const ws = wb.worksheets[0];
      const headers: Record<number, string> = {};
      ws.getRow(1).eachCell((cell: ExcelJS.Cell, col: number) => {
        headers[col] = String(cell.value ?? '').toLowerCase().trim();
      });

      const rows: ImportRow[] = [];
      ws.eachRow((row: ExcelJS.Row, rowNum: number) => {
        if (rowNum === 1) return;
        const obj: any = {};
        row.eachCell((cell: ExcelJS.Cell, col: number) => {
          const key = headers[col];
          if (key) obj[key] = cell.value;
        });
        if (obj['nomi*'] || obj['nomi']) {
          rows.push({
            name: obj['nomi*'] ?? obj['nomi'],
            sku: obj['sku'] ? String(obj['sku']) : undefined,
            category: obj['kategoriya'] ? String(obj['kategoriya']) : undefined,
            description: obj['tavsif'] ? String(obj['tavsif']) : undefined,
            basePrice: obj['asosiy_narx*'] != null ? Number(obj['asosiy_narx*']) : obj['asosiy_narx'] != null ? Number(obj['asosiy_narx']) : undefined,
            salePrice: obj['sotuv_narxi'] != null ? Number(obj['sotuv_narxi']) : undefined,
            minStockLevel: obj['min_stok'] != null ? Number(obj['min_stok']) : 0,
            isActive: obj['aktiv'] !== 'false' && obj['aktiv'] !== false,
          });
        }
      });
      return rows;
    }

    if (ext === 'csv') {
      const text = file.buffer.toString('utf-8');
      const lines = text.split('\n').filter((l) => l.trim());
      if (lines.length < 2) return [];

      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      return lines.slice(1).map((line) => {
        const vals = line.split(',').map((v) => v.trim());
        const obj: any = {};
        headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
        return {
          name: obj['nomi*'] ?? obj['nomi'],
          sku: obj['sku'] || undefined,
          category: obj['kategoriya'] || undefined,
          description: obj['tavsif'] || undefined,
          basePrice: obj['asosiy_narx*'] ? Number(obj['asosiy_narx*']) : obj['asosiy_narx'] ? Number(obj['asosiy_narx']) : undefined,
          salePrice: obj['sotuv_narxi'] ? Number(obj['sotuv_narxi']) : undefined,
          minStockLevel: obj['min_stok'] ? Number(obj['min_stok']) : 0,
          isActive: obj['aktiv'] !== 'false',
        };
      }).filter((r) => r.name);
    }

    throw new BadRequestException('Faqat xlsx, xls yoki csv fayl qabul qilinadi');
  }

  private async uniqueSlug(db: any, name: string, excludeId?: string): Promise<string> {
    const base = slugify(name, { lower: true, strict: true });
    let slug = base;
    let i = 0;
    while (true) {
      const found = await db.product.findUnique({ where: { slug } });
      if (!found || found.id === excludeId) break;
      slug = `${base}-${++i}`;
    }
    return slug;
  }
}
