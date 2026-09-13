import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { UpdateSettingsDto } from './dto/settings.dto';
import { Settings } from './entities/settings.entity';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: "Get the current user's settings" })
  find(@CurrentUser() user: AuthenticatedUser): Promise<Settings> {
    return this.settingsService.findByUserId(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update currencies or the manual exchange rate' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSettingsDto,
  ): Promise<Settings> {
    return this.settingsService.update(user.id, dto);
  }
}
