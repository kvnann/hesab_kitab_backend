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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { ContactsService, ContactsSummary } from './contacts.service';
import { CreateContactDto, UpdateContactDto } from './dto/contact.dto';
import { Contact } from './entities/contact.entity';

@ApiTags('contacts')
@ApiBearerAuth()
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a contact with an optional initial balance' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateContactDto,
  ): Promise<Contact> {
    return this.contactsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all contacts of the current user' })
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<Contact[]> {
    return this.contactsService.findAll(user.id);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Totals: receivable, payable and net balance' })
  summary(@CurrentUser() user: AuthenticatedUser): Promise<ContactsSummary> {
    return this.contactsService.summary(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single contact' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Contact> {
    return this.contactsService.findOne(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a contact' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
  ): Promise<Contact> {
    return this.contactsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a contact (wagon/transaction links are kept, unlinked)' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.contactsService.remove(user.id, id);
  }
}
