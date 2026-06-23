import { Body, Controller, Get, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ImportService, ImportResult } from './import.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('products/import')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ImportController {
  constructor(private importService: ImportService) {}

  @Get('template')
  async getTemplate(@Res() res: Response) {
    const buffer = await this.importService.getTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="products-template.xlsx"');
    res.send(buffer);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async import(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('updateExisting') updateExisting: string,
    @Body('skipErrors') skipErrors: string,
  ): Promise<ImportResult> {
    return this.importService.importProducts(req.tenantSlug, file, {
      updateExisting: updateExisting === 'true',
      skipErrors: skipErrors !== 'false',
    });
  }
}
