import {
  Controller,
  Post,
  Body,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { BankVaultService, NinePayGatewayService } from '@uc/banking';
import { CustomerService } from '@uc/core';
import { BankVaultInquiryDto } from './dtos/bank-vault-inquiry.dto';
import { BankVaultRegisterDto } from './dtos/bank-vault-register.dto';
import { AnchorWebhookGuard } from '../sep31/guards/anchor-webhook.guard';
import { randomUUID } from 'crypto';

@Controller('v1/bank-vault')
@UseGuards(AnchorWebhookGuard)
export class BankVaultController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly bankVaultService: BankVaultService,
    private readonly ninePayGateway: NinePayGatewayService,
  ) {}

  @Post('inquiry')
  @HttpCode(HttpStatus.OK)
  async inquiry(@Body() body: BankVaultInquiryDto) {
    const { bankCode, accountNumber, accountType } = body;

    try {
      const accountName = await this.ninePayGateway.lookupAccount(
        accountNumber,
        bankCode,
        accountType || '0',
      );
      if (!accountName) {
        throw new NotFoundException('Account not found or invalid');
      }

      return { accountName };
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(error.message);
    }
  }

  @Post('register')
  @HttpCode(HttpStatus.OK)
  async register(@Body() body: BankVaultRegisterDto) {
    const { userId, kycId, bankCode, accountNumber, accountName } = body;

    try {
      const customerId = kycId || randomUUID();

      let customer = await this.customerService.findById(customerId);
      if (!customer) {
        customer = this.customerService.create({});
        customer.id = customerId;
      }
      customer.firstName = accountName;
      customer.customerType = 'sep31-receiver';
      customer.status = 'NEEDS_INFO'; // default when only first name is registered
      await this.customerService.save(customer);

      const record = await this.bankVaultService.registerProfile({
        customer_id: customerId,
        stellar_wallet: '',
        account_number: accountNumber,
        legal_name: accountName,
        bank_code: bankCode,
      });

      return { beneficiaryRefId: record.beneficiaryRefId };
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }
}
