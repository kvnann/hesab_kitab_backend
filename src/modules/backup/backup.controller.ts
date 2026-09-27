import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { BackupFile, BackupService } from './backup.service';

@ApiTags('backup')
@ApiBearerAuth()
@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get()
  @ApiOperation({
    summary:
      "Export the signed-in user's contacts, wagons, transactions and settings as JSON",
  })
  export(@CurrentUser() user: AuthenticatedUser): Promise<BackupFile> {
    return this.backupService.export(user.id);
  }
}
