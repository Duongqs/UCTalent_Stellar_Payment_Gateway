import {
  Controller,
  Get,
  Put,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  CustomerEntity,
  Sep9ValidationService,
  EncryptionService,
  AuditLogService,
  CustomerService,
  KYCStatus,
} from '@uc/core';
import { PutCustomerDto } from './dtos/put-customer.dto';
import { GetCustomerDto } from './dtos/get-customer.dto';

export function computeKycStatus(
  type: string,
  fields: {
    first_name?: string;
    last_name?: string;
    email_address?: string;
    id_number?: string;
  },
): KYCStatus {
  const { first_name, last_name, email_address, id_number } = fields;

  if (type === 'sep31-sender' && first_name && last_name && email_address) {
    return 'ACCEPTED';
  }
  if (
    type === 'sep31-receiver' &&
    first_name &&
    last_name &&
    email_address &&
    id_number
  ) {
    return 'ACCEPTED';
  }
  if (first_name && last_name) {
    return 'PROCESSING';
  }
  return 'NEEDS_INFO';
}

@Controller('customer')
export class KycController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly encryption: EncryptionService,
    private readonly sep9Validation: Sep9ValidationService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Get()
  async getCustomer(@Query() query: GetCustomerDto) {
    const { id, account, type } = query;
    if (!id && !account && !type) {
      throw new BadRequestException('Must provide id, account, or type');
    }

    try {
      let customer: CustomerEntity | null = null;
      if (id) {
        const isUuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            id,
          );
        if (isUuid) {
          customer = await this.customerService.findById(id);
        }
      } else if (account) {
        customer = await this.customerService.findByAccount(account);
      }

      if (!customer) {
        const fields: Record<string, any> = {
          first_name: {
            description: 'First name',
            type: 'string',
            optional: false,
          },
          last_name: {
            description: 'Last name',
            type: 'string',
            optional: false,
          },
          email_address: {
            description: 'Email address',
            type: 'string',
            optional: false,
          },
        };

        if (type === 'sep31-receiver') {
          fields.id_number = {
            description: 'National ID (CCCD)',
            type: 'string',
            optional: false,
          };
          fields.id_country = {
            description: 'ID issuing country (ISO 3166-1 alpha-3)',
            type: 'string',
            optional: false,
          };
        }

        return {
          ...(id || account ? { id: id || account } : {}),
          status: 'NEEDS_INFO',
          fields,
        };
      }

      const provided_fields: Record<string, any> = {};
      if (customer.firstName)
        provided_fields.first_name = {
          description: 'First name',
          type: 'string',
          status: 'ACCEPTED',
        };
      if (customer.lastName)
        provided_fields.last_name = {
          description: 'Last name',
          type: 'string',
          status: 'ACCEPTED',
        };
      if (customer.emailAddress)
        provided_fields.email_address = {
          description: 'Email address',
          type: 'string',
          status: 'ACCEPTED',
        };
      if (customer.idNumberEnc)
        provided_fields.id_number = {
          description: 'National ID Number',
          type: 'string',
          status: 'ACCEPTED',
        };

      return {
        id: customer.id,
        status: customer.status,
        provided_fields:
          Object.keys(provided_fields).length > 0 ? provided_fields : undefined,
      };
    } catch (error: any) {
      console.error('[Customer] Error in getCustomer:', error);
      throw new InternalServerErrorException('Internal server error');
    }
  }

  @Put()
  @HttpCode(HttpStatus.ACCEPTED)
  async putCustomer(@Body() body: PutCustomerDto) {
    const validation = this.sep9Validation.validate(body);
    if (!validation.isValid) {
      throw new BadRequestException({
        error: 'Invalid SEP-9 fields',
        details: validation.errors,
      });
    }

    try {
      let idToUpdate = body.id;
      if (!idToUpdate && body.account) {
        const existing = await this.customerService.findByAccount(body.account);
        if (existing) idToUpdate = existing.id;
      }

      const status = computeKycStatus(body.type, body);
      const encIdNumber = body.id_number
        ? this.encryption.encrypt(body.id_number)
        : undefined;

      let customer: CustomerEntity;
      if (idToUpdate) {
        customer =
          (await this.customerService.findById(idToUpdate)) ||
          this.customerService.create({});
        if (!customer.id) {
          customer.id = idToUpdate;
        }
      } else {
        customer = this.customerService.create({});
      }

      if (body.account) customer.stellarAccount = body.account;
      if (body.first_name) customer.firstName = body.first_name;
      if (body.last_name) customer.lastName = body.last_name;
      if (body.email_address) customer.emailAddress = body.email_address;
      if (encIdNumber) customer.idNumberEnc = encIdNumber;
      if (body.id_type) customer.idType = body.id_type;
      customer.customerType = body.type;
      customer.status = status;

      const saved = await this.customerService.save(customer);

      await this.auditLog.log(saved.id, 'kyc_updated', {
        type: body.type,
        status: saved.status,
      });

      return { id: saved.id };
    } catch (error: any) {
      console.error('[Customer] Error in putCustomer:', error);
      throw new InternalServerErrorException('Internal server error');
    }
  }
}
