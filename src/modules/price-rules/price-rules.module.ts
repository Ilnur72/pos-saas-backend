import { Module } from '@nestjs/common';
import { PriceRulesController, BatchController } from './price-rules.controller';
import { PriceRulesService } from './price-rules.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PriceRulesController, BatchController],
  providers: [PriceRulesService],
})
export class PriceRulesModule {}
