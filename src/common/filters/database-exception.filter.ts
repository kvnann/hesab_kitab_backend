import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';

interface PgError {
  code?: string;
  constraint?: string;
  detail?: string;
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  uq_users_username: 'This username is already taken',
  uq_contacts_user_name: 'A contact with this name already exists',
  uq_settings_user_id: 'Settings already exist for this user',
  chk_wagons_side_present: 'A wagon needs buying details, selling details, or both',
  chk_wagons_buy_pair: 'Buy volume and buy price must be provided together',
  chk_wagons_sell_pair: 'Sell volume and sell price must be provided together',
  chk_transactions_amount_positive: 'Amount must be greater than zero',
  chk_contacts_name_not_blank: 'Contact name must not be blank',
};

/**
 * Maps Postgres constraint violations to meaningful HTTP errors instead of
 * leaking raw driver errors as 500s.
 */
@Catch(QueryFailedError)
export class DatabaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DatabaseExceptionFilter.name);

  catch(exception: QueryFailedError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const pgError = exception.driverError as PgError;

    let httpError: HttpException;
    if (pgError.code === '23505' || pgError.code === '23514') {
      const message =
        (pgError.constraint && CONSTRAINT_MESSAGES[pgError.constraint]) ??
        'The request conflicts with existing data';
      httpError = new ConflictException(message);
    } else {
      this.logger.error(`Unhandled database error: ${exception.message}`, exception.stack);
      httpError = new InternalServerErrorException('Internal server error');
    }

    response.status(httpError.getStatus()).json(httpError.getResponse());
  }
}
