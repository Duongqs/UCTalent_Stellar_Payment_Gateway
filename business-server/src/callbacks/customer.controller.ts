import { Request, Response } from 'express';
import { CustomerModel } from '../models/customer.model';
import { auditLog } from '../db';
import { Sep9ValidationService } from '../services/sep9-validation.service';

export class CustomerController {
  static async getCustomer(req: Request, res: Response): Promise<void> {
    try {
      const { id, account, memo, memo_type, type } = req.query;

      if (!id && !account && !type) {
        res.status(400).json({ error: 'Must provide id, account, or type' });
        return;
      }

      // If neither id nor account is provided, we just return the required fields
      let customer;
      if (id) {
        const idStr = id as string;
        // Postgres will throw an error if id is not a valid UUID
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idStr);
        if (isUuid) {
          customer = await CustomerModel.findById(idStr);
        }
      } else if (account) {
        customer = await CustomerModel.findByAccount(account as string);
      }

      if (!customer) {
        // Return required fields — AP will collect them from the sending wallet
        const fields: Record<string, any> = {
          first_name: { description: 'First name', type: 'string', optional: false },
          last_name: { description: 'Last name', type: 'string', optional: false },
          email_address: { description: 'Email address', type: 'string', optional: false },
        };

        if (type === 'sep31-receiver') {
          fields.id_number = { description: 'National ID (CCCD)', type: 'string', optional: false };
          fields.id_country = { description: 'ID issuing country (ISO 3166-1 alpha-3)', type: 'string', optional: false };
        }

        res.status(200).json({
          ...(id || account ? { id: id || account } : {}),
          status: 'NEEDS_INFO',
          fields,
        });
        return;
      }

      // Build provided_fields with per-field ACCEPTED status
      const provided_fields: Record<string, any> = {};
      if (customer.first_name) provided_fields.first_name = { description: 'First name', type: 'string', status: 'ACCEPTED' };
      if (customer.last_name) provided_fields.last_name = { description: 'Last name', type: 'string', status: 'ACCEPTED' };
      if (customer.email_address) provided_fields.email_address = { description: 'Email address', type: 'string', status: 'ACCEPTED' };
      if (customer.id_number_enc) provided_fields.id_number = { description: 'National ID Number', type: 'string', status: 'ACCEPTED' };

      res.status(200).json({
        id: customer.id,
        status: customer.status,
        provided_fields: Object.keys(provided_fields).length > 0 ? provided_fields : undefined,
      });
      return;
    } catch (error) {
      console.error('[Customer] Error in getCustomer:', error);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
  }

  // PUT /customer — Anchor Platform sends KYC data to store
  static async putCustomer(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body;

      const validation = Sep9ValidationService.validate(body);
      if (!validation.isValid) {
        res.status(400).json({ error: 'Invalid SEP-9 fields', details: validation.errors });
        return;
      }

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

      res.status(202).json({ id: customer.id });
      return;
    } catch (error) {
      console.error('[Customer] Error in putCustomer:', error);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
  }
}
