import { Global, Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { TelegramSchedulerService } from './telegram-scheduler.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramSchedulerService],
  exports: [TelegramService],
})
export class TelegramModule {}
