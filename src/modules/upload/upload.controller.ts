import { Controller, Post, UploadedFiles, UseGuards, UseInterceptors, BadRequestException, Req } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuid } from 'uuid';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Controller('upload')
@UseGuards(JwtAuthGuard, TenantGuard)
export class UploadController {
  @Post('images')
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      storage: diskStorage({
        destination: './uploads',
        filename: (_req, file, cb) => cb(null, `${uuid()}${extname(file.originalname)}`),
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
          return cb(new BadRequestException('Faqat JPEG, PNG yoki WebP rasm yuklang'), false);
        }
        cb(null, true);
      },
    }),
  )
  uploadImages(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('Fayl yuklanmadi');
    return { urls: files.map((f) => `/uploads/${f.filename}`) };
  }
}
