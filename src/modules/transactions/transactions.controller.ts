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
import { Paginated } from '../../common/dto/pagination.dto';
import {
  CreateTransactionDto,
  ListTransactionsDto,
  MonthSummaryDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';
import { Transaction } from './entities/transaction.entity';
import { CashSummary, MonthSummary, TransactionsService } from './transactions.service';

@ApiTags('transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @ApiOperation({
    summary:
      'Record a transaction; income/expense with a contact updates their balance',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTransactionDto,
  ): Promise<Transaction> {
    return this.transactionsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List transactions with date/type/relation filters' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filter: ListTransactionsDto,
  ): Promise<Paginated<Transaction>> {
    return this.transactionsService.findAll(user.id, filter);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Per-day income/expense totals for a month (calendar)' })
  monthSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: MonthSummaryDto,
  ): Promise<MonthSummary> {
    return this.transactionsService.monthSummary(user.id, dto);
  }

  @Get('cash')
  @ApiOperation({ summary: 'All-time till balance (Kassa): income, expense and net' })
  cashSummary(@CurrentUser() user: AuthenticatedUser): Promise<CashSummary> {
    return this.transactionsService.cashSummary(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single transaction' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Transaction> {
    return this.transactionsService.findOne(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a transaction; balance effects are recalculated' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionDto,
  ): Promise<Transaction> {
    return this.transactionsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a transaction, reversing its balance effect' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.transactionsService.remove(user.id, id);
  }
}
