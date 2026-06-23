// Bu fayl 'npm run prisma:generate:tenant' ishlatilgunga qadar TypeScript compile xatosini oldini oladi.
// Generate qilingandan keyin .prisma/tenant-client o'z type'larini taqdim etadi.
declare module '.prisma/tenant-client' {
  export class PrismaClient {
    constructor(options?: { datasources?: { db?: { url?: string } }; log?: any[] });
    $connect(): Promise<void>;
    $disconnect(): Promise<void>;
    $transaction(operations: any[]): Promise<any[]>;
    $executeRaw(query: TemplateStringsArray, ...values: any[]): Promise<number>;
    $queryRaw(query: TemplateStringsArray, ...values: any[]): Promise<any[]>;
    readonly product: any;
    readonly category: any;
    readonly supplier: any;
    readonly customer: any;
    readonly order: any;
    readonly orderItem: any;
    readonly warehouseTransaction: any;
    readonly purchaseOrder: any;
    readonly purchaseOrderItem: any;
    readonly autoOrderRule: any;
    readonly priceRule: any;
    readonly productABC: any;
    readonly productVariant: any;
    readonly kassaSession: any;
    readonly expense: any;
    [key: string]: any;
  }
}
