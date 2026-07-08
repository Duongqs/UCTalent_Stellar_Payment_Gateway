import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerEntity } from '../entities/customer.entity';

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly customerRepo: Repository<CustomerEntity>
  ) {}

  async findById(id: string): Promise<CustomerEntity | null> {
    return this.customerRepo.findOne({ where: { id } });
  }

  async findByAccount(account: string): Promise<CustomerEntity | null> {
    return this.customerRepo.findOne({ where: { stellarAccount: account } });
  }

  create(data: Partial<CustomerEntity>): CustomerEntity {
    return this.customerRepo.create(data);
  }

  async save(customer: CustomerEntity): Promise<CustomerEntity> {
    return this.customerRepo.save(customer);
  }
}
