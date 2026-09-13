import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateSettingsDto } from './dto/settings.dto';
import { Settings } from './entities/settings.entity';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Settings)
    private readonly settingsRepository: Repository<Settings>,
  ) {}

  async findByUserId(userId: string): Promise<Settings> {
    const settings = await this.settingsRepository.findOneBy({ userId });
    if (!settings) throw new NotFoundException('Settings not found');
    return settings;
  }

  async update(userId: string, dto: UpdateSettingsDto): Promise<Settings> {
    const settings = await this.findByUserId(userId);

    if (dto.primaryCurrency !== undefined) settings.primaryCurrency = dto.primaryCurrency;
    if (dto.secondaryCurrency !== undefined) {
      settings.secondaryCurrency = dto.secondaryCurrency;
    }
    if ((settings.primaryCurrency as string) === (settings.secondaryCurrency as string)) {
      throw new BadRequestException(
        'Primary and secondary currencies must be different',
      );
    }
    if (dto.exchangeRate !== undefined && dto.exchangeRate !== settings.exchangeRate) {
      settings.exchangeRate = dto.exchangeRate;
      settings.lastChangedDate = new Date();
    }

    return this.settingsRepository.save(settings);
  }
}
