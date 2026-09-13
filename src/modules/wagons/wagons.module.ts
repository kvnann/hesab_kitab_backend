import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactsModule } from '../contacts/contacts.module';
import { Wagon } from './entities/wagon.entity';
import { WagonsController } from './wagons.controller';
import { WagonsService } from './wagons.service';

@Module({
  imports: [TypeOrmModule.forFeature([Wagon]), ContactsModule],
  controllers: [WagonsController],
  providers: [WagonsService],
  exports: [WagonsService],
})
export class WagonsModule {}
