import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getSafeFxRate } from '../services/oracle.service';
import { query, auditLog } from '../db';

export class RateController {
  // GET /rate — Anchor Platform asks for indicative or firm quote
  static async getRate(req: Request, res: Response): Promise<void> {
    try {
      const { type, sell_asset, buy_asset, sell_amount, buy_amount, context } = req.query;

      // Validate type
      if (!type || (type !== 'indicative' && type !== 'firm')) {
        res.status(400).json({ error: 'Valid type (indicative or firm) is required' });
        return;
      }

      // Check buy_delivery_method if provided
      const { buy_delivery_method } = req.query;
      if (buy_delivery_method && buy_delivery_method !== 'NAPAS') {
        res.status(400).json({ error: 'Unsupported buy_delivery_method. Only NAPAS is supported.' });
        return;
      }

      // Get rate from oracle (throws if circuit breaker open)
      let baseRate: number;
      try {
        const oracleResult = await getSafeFxRate();
        baseRate = oracleResult.rate;

        console.log('[Rate API] Oracle:', {
          rate: oracleResult.rate,
          sources: oracleResult.usedSources,
          method: oracleResult.method,
        });
      } catch (apiError: any) {
        console.error('[Rate API] Oracle error:', apiError.message);
        res.status(503).json({ error: 'Exchange rate service unavailable. Please try again later.' });
        return;
      }

      const feeAmount = '0'; // 0% fee for freelancers

      const rateObj: any = {
        price: (1 / baseRate).toFixed(10).replace(/\.?0+$/, ''),
        fee: {
          total: feeAmount,
          asset: sell_asset as string || 'stellar:USDC:GBBD47IF6LWK7P7MDEVSCZA7CFYGLVOLO25E34XDBIEU7E5XPIUBIVGF',
        },
      };

      if (sell_amount && buy_amount) {
        res.status(400).json({ error: 'Please provide either sell_amount or buy_amount, but not both' });
        return;
      }

      // Calculate amounts
      if (sell_amount) {
        rateObj.sell_amount = sell_amount;
        rateObj.buy_amount = Math.floor(parseFloat(sell_amount as string) * baseRate).toString();
      } else if (buy_amount) {
        rateObj.buy_amount = buy_amount;
        rateObj.sell_amount = (parseFloat(buy_amount as string) / baseRate).toFixed(7).replace(/\.?0+$/, '');
      } else {
        res.status(400).json({ error: 'Either sell_amount or buy_amount must be provided' });
        return;
      }

      // Calculate amounts
      if (type === 'firm') {
        if (!context || !['sep6', 'sep24', 'sep31'].includes(context as string)) {
          res.status(400).json({ error: 'context must be one of sep6, sep24, or sep31 for firm quotes' });
          return;
        }

        const quoteId = uuidv4();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        await query(
          `INSERT INTO firm_quotes (id, sell_asset, buy_asset, sell_amount, buy_amount, rate, context, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            quoteId,
            sell_asset || 'stellar:USDC:GBBD47IF6LWK7P7MDEVSCZA7CFYGLVOLO25E34XDBIEU7E5XPIUBIVGF',
            buy_asset || 'iso4217:VND',
            rateObj.sell_amount,
            rateObj.buy_amount,
            rateObj.price,
            context,
            expiresAt,
          ]
        );

        await auditLog(quoteId, 'quote_locked', {
          rate: rateObj.price,
          sell_amount: rateObj.sell_amount,
          buy_amount: rateObj.buy_amount,
          context,
        });

        rateObj.id = quoteId;
        rateObj.expires_at = expiresAt.toISOString();
      }

      res.status(200).json({ rate: rateObj });
      return;
    } catch (error) {
      console.error('[Rate API] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
  }

  // GET /quote/:id — Lookup a stored firm quote
  static async getQuote(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;

    const quote = await query(
      'SELECT * FROM firm_quotes WHERE id = $1',
      [id]
    );

    if (!quote) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }

    if (quote.expires_at && new Date(quote.expires_at) < new Date()) {
      res.status(410).json({ error: 'Quote expired' });
      return;
    }

    if (quote.used_at) {
      res.status(409).json({ error: 'Quote already used' });
      return;
    }

    res.status(200).json({
      id: quote.id,
      price: (quote.sell_amount / quote.buy_amount).toFixed(10).replace(/\.?0+$/, ''),
      sell_asset: quote.sell_asset,
      buy_asset: quote.buy_asset,
      sell_amount: quote.sell_amount,
      buy_amount: quote.buy_amount,
      expires_at: quote.expires_at,
      fee: {
        total: '0',
        asset: quote.sell_asset
      }
    });
    return;
  }
}
