import { 
  Controller, 
  Get, 
  Put, 
  Query, 
  Body, 
  HttpCode, 
  HttpStatus, 
  BadRequestException, 
  InternalServerErrorException 
} from '@nestjs/common';
import { CustomerModel, Sep9ValidationService, auditLog } from '@uc/core';

@Controller('customer')
export class KycController {
  @Get()
  async getCustomer(
    @Query('id') id?: string,
    @Query('account') account?: string,
    @Query('type') type?: string,
  ) {
    if (!id && !account && !type) {
      throw new BadRequestException('Must provide id, account, or type');
    }

    try {
      let customer;
      if (id) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
        if (isUuid) {
          customer = await CustomerModel.findById(id);
        }
      } else if (account) {
        customer = await CustomerModel.findByAccount(account);
      }

      if (!customer) {
        const fields: Record<string, any> = {
          first_name: { description: 'First name', type: 'string', optional: false },
          last_name: { description: 'Last name', type: 'string', optional: false },
          email_address: { description: 'Email address', type: 'string', optional: false },
        };

        if (type === 'sep31-receiver') {
          fields.id_number = { description: 'National ID (CCCD)', type: 'string', optional: false };
          fields.id_country = { description: 'ID issuing country (ISO 3166-1 alpha-3)', type: 'string', optional: false };
        }

        return {
          ...(id || account ? { id: id || account } : {}),
          status: 'NEEDS_INFO',
          fields,
        };
      }

      const provided_fields: Record<string, any> = {};
      if (customer.first_name) provided_fields.first_name = { description: 'First name', type: 'string', status: 'ACCEPTED' };
      if (customer.last_name) provided_fields.last_name = { description: 'Last name', type: 'string', status: 'ACCEPTED' };
      if (customer.email_address) provided_fields.email_address = { description: 'Email address', type: 'string', status: 'ACCEPTED' };
      if (customer.id_number_enc) provided_fields.id_number = { description: 'National ID Number', type: 'string', status: 'ACCEPTED' };

      return {
        id: customer.id,
        status: customer.status,
        provided_fields: Object.keys(provided_fields).length > 0 ? provided_fields : undefined,
      };
    } catch (error: any) {
      console.error('[Customer] Error in getCustomer:', error);
      throw new InternalServerErrorException('Internal server error');
    }
  }

  @Put()
  @HttpCode(HttpStatus.ACCEPTED)
  async putCustomer(@Body() body: Record<string, any>) {
    const validation = Sep9ValidationService.validate(body);
    if (!validation.isValid) {
      throw new BadRequestException({
        error: 'Invalid SEP-9 fields',
        details: validation.errors
      });
    }

    try {
      let idToUpdate = body.id;
      if (!idToUpdate && body.account) {
        const existing = await CustomerModel.findByAccount(body.account);
        if (existing) idToUpdate = existing.id;
      }

      const customer = await CustomerModel.createOrUpdate({
        id: idToUpdate,
        stellar_account: body.account,
        first_name: body.first_name,
        last_name: body.last_name,
        email_address: body.email_address,
        id_number: body.id_number,
        id_country: body.id_country,
        id_type: body.id_type || 'national_id',
        type: body.type,
      });

      await auditLog(customer.id, 'kyc_updated', {
        type: body.type,
        status: customer.status,
      });

      return { id: customer.id };
    } catch (error: any) {
      console.error('[Customer] Error in putCustomer:', error);
      throw new InternalServerErrorException('Internal server error');
    }
  }
}
