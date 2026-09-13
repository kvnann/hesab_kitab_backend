import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { CreateWagonDto, ListWagonsDto, UpdateWagonDto } from './dto/wagon.dto';
import { Wagon } from './entities/wagon.entity';
import { WagonsService } from './wagons.service';

@ApiTags('wagons')
@ApiBearerAuth()
@Controller('wagons')
export class WagonsController {
  constructor(private readonly wagonsService: WagonsService) {}

  @Post()
  @ApiOperation({
    summary:
      'Create a wagon (buy side, sell side, or both); auto-creates contacts and updates balances',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWagonDto,
  ): Promise<Wagon> {
    return this.wagonsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List wagons, optionally filtered by status' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filter: ListWagonsDto,
  ): Promise<Wagon[]> {
    return this.wagonsService.findAll(user.id, filter);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single wagon' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Wagon> {
    return this.wagonsService.findOne(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a wagon; balance effects are reversed and re-applied consistently',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWagonDto,
  ): Promise<Wagon> {
    return this.wagonsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a wagon, reversing its balance effects' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.wagonsService.remove(user.id, id);
  }
}
