import { IsString, IsOptional, IsIn, ValidateIf, IsISO8601 } from 'class-validator';

export class PostQuoteDto {
  @IsString()
  sell_asset: string;

  @IsString()
  buy_asset: string;

  @ValidateIf(o => !o.buy_amount)
  @IsString()
  sell_amount?: string;

  @ValidateIf(o => !o.sell_amount)
  @IsString()
  buy_amount?: string;

  @IsString()
  @IsIn(['sep6', 'sep24', 'sep31'])
  context: string;

  @IsOptional()
  @IsISO8601()
  expire_after?: string;

  @IsOptional()
  @IsString()
  buy_delivery_method?: string;

  @IsOptional()
  @IsString()
  country_code?: string;
}
