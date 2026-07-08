import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FirmQuoteEntity } from '../entities/firm-quote.entity';

@Injectable()
export class FirmQuoteService {
  constructor(
    @InjectRepository(FirmQuoteEntity)
    private readonly firmQuoteRepo: Repository<FirmQuoteEntity>
  ) {}

  async findById(id: string): Promise<FirmQuoteEntity | null> {
    return this.firmQuoteRepo.findOne({ where: { id } });
  }

  create(data: Partial<FirmQuoteEntity>): FirmQuoteEntity {
    return this.firmQuoteRepo.create(data);
  }

  async save(quote: FirmQuoteEntity): Promise<FirmQuoteEntity> {
    return this.firmQuoteRepo.save(quote);
  }
}
