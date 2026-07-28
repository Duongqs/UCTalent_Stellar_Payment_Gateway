import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { EnvService } from '@uc/core';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class Sep10Guard implements CanActivate {
  private readonly jwtSecret: string;

  constructor(private readonly envService: EnvService) {
    const secret = this.envService.get('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }
    this.jwtSecret = String(secret);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is missing');
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid authorization format. Expected Bearer token');
    }

    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      if (!decoded.sub) {
        throw new UnauthorizedException('Invalid token payload');
      }
      
      // Attach the Stellar account ID to the request object
      request.stellarAccountId = decoded.sub;
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
