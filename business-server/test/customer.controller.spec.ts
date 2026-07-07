import request from 'supertest';
import express from 'express';
import { CustomerController } from '../src/callbacks/customer.controller';
import { CustomerModel } from '../src/models/customer.model';
import * as db from '../src/db';

jest.mock('uuid', () => ({ v4: () => 'mock-uuid-123' }));
jest.mock('../src/models/customer.model');
jest.mock('../src/db');

const app = express();
app.use(express.json());
app.get('/customer', CustomerController.getCustomer);
app.put('/customer', CustomerController.putCustomer);

describe('SEP-12 Customer Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /customer', () => {
    it('unknown id → 200 NEEDS_INFO with required fields list', async () => {
      (CustomerModel.findById as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .get('/customer?id=unknown-uuid&type=sep31-receiver');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('NEEDS_INFO');
      expect(res.body.fields).toHaveProperty('first_name');
      expect(res.body.fields).toHaveProperty('id_number');
      expect(res.body.fields).toHaveProperty('id_country');
    });

    it('unknown sender → 200 NEEDS_INFO without receiver-only ID fields', async () => {
      (CustomerModel.findById as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .get('/customer?id=sender-uuid&type=sep31-sender');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('NEEDS_INFO');
      expect(res.body.fields).toHaveProperty('first_name');
      expect(res.body.fields).toHaveProperty('last_name');
      expect(res.body.fields).toHaveProperty('email_address');
      expect(res.body.fields).not.toHaveProperty('id_number');
      expect(res.body.fields).not.toHaveProperty('id_country');
    });

    it('known id → 200 ACCEPTED with provided_fields', async () => {
      (CustomerModel.findById as jest.Mock).mockResolvedValue({
        id: '12345678-1234-4234-8234-123456789012',
        status: 'ACCEPTED',
        first_name: 'Nguyen',
        last_name: 'Van A',
        email_address: 'a@test.com',
        id_number_enc: 'encrypted',
      });

      const res = await request(app).get('/customer?id=12345678-1234-4234-8234-123456789012');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ACCEPTED');
      expect(res.body.provided_fields.first_name.status).toBe('ACCEPTED');
      expect(res.body.provided_fields.id_number.status).toBe('ACCEPTED');
      expect(JSON.stringify(res.body)).not.toContain('encrypted');
      expect(res.body).not.toHaveProperty('id_number_enc');
    });

    it('missing both id and account → 200 NEEDS_INFO with default required fields', async () => {
      const res = await request(app).get('/customer?type=sep31-receiver');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('NEEDS_INFO');
      expect(res.body.fields).toHaveProperty('first_name');
      expect(res.body.fields).toHaveProperty('id_number');
    });

    it('should find by account if id is not provided', async () => {
      (CustomerModel.findByAccount as jest.Mock).mockResolvedValue({
        id: '456',
        status: 'PROCESSING',
        first_name: 'Nguyen',
        last_name: 'Van A',
      });

      const res = await request(app).get('/customer?account=GABC123');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('456');
      expect(res.body.status).toBe('PROCESSING');
      expect(res.body.provided_fields.first_name.status).toBe('ACCEPTED');
    });
  });

  describe('PUT /customer', () => {
    it('creates record and returns UUID', async () => {
      (CustomerModel.createOrUpdate as jest.Mock).mockResolvedValue({
        id: '111-222',
        status: 'ACCEPTED'
      });
      
      const res = await request(app).put('/customer')
        .send({ 
          first_name: 'A', 
          last_name: 'B',
          email_address: 'ab@test.com', 
          id_number: '123',
          id_country: 'VNM', 
          type: 'sep31-receiver' 
        });

      expect(res.status).toBe(202);
      expect(res.body.id).toBe('111-222');
      expect(db.auditLog).toHaveBeenCalledWith('111-222', 'kyc_updated', expect.any(Object));
    });

    it('rejects invalid SEP-9 fields', async () => {
      const res = await request(app).put('/customer')
        .send({ 
          firstName: 'A', // invalid camelCase
          type: 'sep31-receiver' 
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid SEP-9 fields');
      expect(res.body.details.some((e: string) => e.includes('snake_case'))).toBe(true);
    });

    it('sender needs fewer fields to reach ACCEPTED', async () => {
      (CustomerModel.createOrUpdate as jest.Mock).mockResolvedValue({
        id: 'sender-id',
        status: 'ACCEPTED'
      });

      const res = await request(app).put('/customer')
        .send({ 
          first_name: 'Corp', 
          last_name: 'Inc',
          email_address: 'corp@test.com', 
          type: 'sep31-sender' 
        });

      expect(res.status).toBe(202);
      expect(CustomerModel.createOrUpdate).toHaveBeenCalledWith(expect.objectContaining({
        type: 'sep31-sender',
        id_number: undefined
      }));
    });

    it('missing id_number for receiver still returns 202 but state is PROCESSING', async () => {
      (CustomerModel.createOrUpdate as jest.Mock).mockResolvedValue({
        id: 'receiver-no-id',
        status: 'PROCESSING'
      });

      const res = await request(app).put('/customer')
        .send({ 
          first_name: 'A', 
          last_name: 'B',
          email_address: 'ab@test.com', 
          type: 'sep31-receiver' 
        });

      expect(res.status).toBe(202);
      expect(CustomerModel.createOrUpdate).toHaveBeenCalledWith(expect.objectContaining({
        type: 'sep31-receiver',
        id_number: undefined
      }));
    });
    it('idempotency: same stellar_account → update existing, not create new', async () => {
      const existingCustomer = { id: 'existing-id', status: 'ACCEPTED', stellar_account: 'GABC123' };
      (CustomerModel.findByAccount as jest.Mock).mockResolvedValue(existingCustomer);
      (CustomerModel.createOrUpdate as jest.Mock).mockResolvedValue(existingCustomer);

      const res1 = await request(app).put('/customer')
        .send({ first_name: 'A', last_name: 'B', email_address: 'a@b.c', id_number: '123', type: 'sep31-receiver', account: 'GABC123' });
      const res2 = await request(app).put('/customer')
        .send({ first_name: 'A', last_name: 'B', email_address: 'a@b.c', id_number: '123', type: 'sep31-receiver', account: 'GABC123' });

      expect(res1.body.id).toBe('existing-id');
      expect(res2.body.id).toBe('existing-id'); // Same ID, doesn't create new
      
      expect(CustomerModel.createOrUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'existing-id' })
      );
    });
  });
});
