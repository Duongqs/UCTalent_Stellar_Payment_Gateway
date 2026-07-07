import { Request, Response } from 'express';
import { BankVaultService } from '../services/bank-vault.service';
import { NinePayGatewayService } from '../services/ninepay-gateway.service';

export class BankVaultController {
  static async inquiry(req: Request, res: Response) {
    try {
      const { bankCode, accountNumber } = req.body;
      if (!bankCode || !accountNumber) {
        return res.status(400).json({ message: 'Missing bankCode or accountNumber' });
      }

      const accountName = await NinePayGatewayService.lookupAccount(accountNumber, bankCode);
      if (!accountName) {
        return res.status(404).json({ message: 'Account not found or invalid' });
      }

      res.status(200).json({ accountName });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  static async register(req: Request, res: Response) {
    try {
      const { userId, kycId, bankCode, accountNumber, accountName } = req.body;
      if (!userId || !bankCode || !accountNumber || !accountName) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      const { CustomerModel } = require('../models/customer.model');
      
      const customerId = kycId || require('crypto').randomUUID();
      
      // Upsert the customer so bank_profiles FK constraint is satisfied.
      // We intentionally do NOT provide dummy KYC data. The status will naturally 
      // become NEEDS_INFO, which accurately reflects that the user has not completed SEP-12 KYC.
      await CustomerModel.createOrUpdate({
        id: customerId,
        type: 'sep31-receiver',
        first_name: accountName,
      });

      const record = await BankVaultService.registerProfile({
        customer_id: customerId,
        stellar_wallet: '', // Default or unused here
        account_number: accountNumber,
        legal_name: accountName,
        bank_code: bankCode
      });

      res.status(200).json({ beneficiaryRefId: record.beneficiary_ref_id });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }
}
