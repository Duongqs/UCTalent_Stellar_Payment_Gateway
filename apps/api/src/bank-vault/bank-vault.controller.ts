import { 
  Controller, 
  Post, 
  Body, 
  BadRequestException, 
  NotFoundException, 
  InternalServerErrorException,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { BankVaultService, NinePayGatewayService } from '@uc/banking';
import { CustomerModel } from '@uc/core';
import { randomUUID } from 'crypto';

@Controller('api/v1/bank-vault')
export class BankVaultController {
  @Post('inquiry')
  @HttpCode(HttpStatus.OK)
  async inquiry(@Body() body: { bankCode?: string; accountNumber?: string }) {
    const { bankCode, accountNumber } = body;
    if (!bankCode || !accountNumber) {
      throw new BadRequestException('Missing bankCode or accountNumber');
    }

    try {
      const accountName = await NinePayGatewayService.lookupAccount(accountNumber, bankCode);
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
  async register(@Body() body: { userId?: string; kycId?: string; bankCode?: string; accountNumber?: string; accountName?: string }) {
    const { userId, kycId, bankCode, accountNumber, accountName } = body;
    if (!userId || !bankCode || !accountNumber || !accountName) {
      throw new BadRequestException('Missing required fields');
    }

    try {
      const customerId = kycId || randomUUID();

      await CustomerModel.createOrUpdate({
        id: customerId,
        type: 'sep31-receiver',
        first_name: accountName,
      });

      const record = await BankVaultService.registerProfile({
        customer_id: customerId,
        stellar_wallet: '',
        account_number: accountNumber,
        legal_name: accountName,
        bank_code: bankCode,
      });

      return { beneficiaryRefId: record.beneficiary_ref_id };
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }
}
