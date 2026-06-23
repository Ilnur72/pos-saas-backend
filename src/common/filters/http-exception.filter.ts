import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Ichki server xatosi';
    let code = 'INTERNAL_ERROR';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        message = (r['message'] as string) ?? message;
        code = (r['error'] as string) ?? code;
        details = r['details'];
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          message = 'Bu qiymat allaqachon mavjud';
          code = 'CONFLICT';
          details = (exception.meta as { target?: string[] })?.target;
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Yozuv topilmadi';
          code = 'NOT_FOUND';
          break;
        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          message = 'Bog\'liq yozuv topilmadi';
          code = 'FOREIGN_KEY_VIOLATION';
          break;
        default:
          this.logger.error(`Prisma error ${exception.code}`, exception.message);
      }
    } else {
      this.logger.error('Unhandled exception', exception);
    }

    response.status(status).json({
      error: { code, message, details },
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
