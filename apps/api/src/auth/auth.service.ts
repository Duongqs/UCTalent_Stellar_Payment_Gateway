import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { EnvService } from '@uc/core';
import { Keypair, WebAuth, Networks } from '@stellar/stellar-sdk';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthService {
  private readonly anchorKeypair: Keypair;
  private readonly networkPassphrase: string;
  private readonly jwtSecret: string;
  private readonly serverDomain: string;

  constructor(private readonly envService: EnvService) {
    const secretKeyStr = String(this.envService.get('ANCHOR_SIGNING_SECRET') || this.envService.get('PLATFORM_SECRET_KEY') || '');
    if (!secretKeyStr) {
      throw new Error('ANCHOR_SIGNING_SECRET or PLATFORM_SECRET_KEY must be set in environment variables');
    }
    const secretKey = secretKeyStr;
    this.anchorKeypair = Keypair.fromSecret(secretKey);
    this.networkPassphrase = String(this.envService.get('NETWORK_PASSPHRASE') || Networks.TESTNET);
    this.jwtSecret = String(this.envService.get('JWT_SECRET') || 'super_secret_jwt_key_that_is_at_least_32_bytes_long!');
    const urlStr = String(this.envService.get('WEB_AUTH_ENDPOINT') || 'http://localhost:4000/auth');
    let domain = 'localhost:4000';
    try {
      const url = new URL(urlStr);
      domain = url.host;
    } catch(e) {}
    this.serverDomain = domain;
  }

  async getChallenge(account: string, memo?: string, clientDomain?: string): Promise<{ transaction: string; network_passphrase: string }> {
    try {
      const tx = WebAuth.buildChallengeTx(
        this.anchorKeypair,
        account,
        this.serverDomain, // homeDomain
        900,
        this.networkPassphrase,
        this.serverDomain, // webAuthDomain
        memo || null,
        clientDomain || null
      );

      return {
        transaction: tx,
        network_passphrase: this.networkPassphrase,
      };
    } catch (e: any) {
      throw new BadRequestException({ error: 'invalid_account', message: e.message || 'Invalid account provided' });
    }
  }

  async verifyChallengeAndIssueToken(transactionBase64: string): Promise<{ token: string }> {
    try {
      const txPayload = WebAuth.readChallengeTx(
        transactionBase64,
        this.anchorKeypair.publicKey(),
        this.networkPassphrase,
        this.serverDomain,
        this.serverDomain
      );
      
      const clientAccountID = txPayload.clientAccountID;
      
      const isSigned = WebAuth.verifyTxSignedBy(txPayload.tx, clientAccountID);
      if (!isSigned) {
        throw new UnauthorizedException('Transaction is not signed by the client');
      }
      
      const token = jwt.sign(
        { sub: clientAccountID },
        this.jwtSecret,
        { expiresIn: '24h', issuer: this.serverDomain }
      );

      return { token };
    } catch (e: any) {
      throw new UnauthorizedException({ error: 'invalid_transaction', message: e.message || 'Invalid transaction' });
    }
  }
}
