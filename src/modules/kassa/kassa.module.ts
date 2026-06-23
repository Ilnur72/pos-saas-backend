import { Module } from '@nestjs/common';
import { KassaController } from './kassa.controller';
import { KassaService } from './kassa.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [KassaController],
  providers: [KassaService],
})
export class KassaModule {}
