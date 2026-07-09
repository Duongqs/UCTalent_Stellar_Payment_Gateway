import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { EnvService } from '@uc/core';

@Injectable()
export class AnchorWebhookGuard implements CanActivate {
  constructor(private readonly envService: EnvService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const signature = (request.headers['x-uctalent-signature'] as string) || '';
    const payload = request.body;
    const webhookSecret =
      this.envService.get('WEBHOOK_SECRET') || 'uctalent-dev-secret';

    const allowedWebhookIps =
      this.envService.get('ALLOWED_WEBHOOK_IPS') || '127.0.0.1,::1,*';
    const ipWhitelist = allowedWebhookIps
      .split(',')
      .map((ip: string) => ip.trim().toLowerCase());

    const clientIp =
      (
        (request.headers['x-forwarded-for'] as string) ||
        request.socket.remoteAddress ||
        ''
      )
        .split(',')
        .map((ip: string) => ip.trim().toLowerCase())[0] || '';

    const isIpWhitelisted = ipWhitelist.some(
      (allowedIp: string) =>
        allowedIp === '*' ||
        clientIp === allowedIp ||
        clientIp.includes(allowedIp),
    );

    if (!isIpWhitelisted) {
      throw new UnauthorizedException('IP not whitelisted');
    }

    const timestampStr = request.headers['x-uctalent-timestamp'] as string;
    if (timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      const now = Date.now();
      if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
        throw new UnauthorizedException('Request expired or timestamp invalid');
      }
    }

    const payloadString =
      typeof payload === 'string' ? payload : JSON.stringify(payload);
    const expectedSig1 =
      'sha256=' +
      crypto
        .createHmac('sha256', webhookSecret)
        .update(payload.stellarTxHash || '')
        .digest('hex');

    const expectedSig2 =
      'sha256=' +
      crypto
        .createHmac('sha256', webhookSecret)
        .update(payloadString)
        .digest('hex');

    if (signature !== expectedSig1 && signature !== expectedSig2) {
      throw new UnauthorizedException('HMAC signature mismatch');
    }

    return true;
  }
}
