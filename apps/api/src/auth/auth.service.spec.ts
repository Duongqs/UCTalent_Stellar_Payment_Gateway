import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { EnvService } from '@uc/core';
import { Keypair, Networks, TransactionBuilder, Server } from '@stellar/stellar-sdk';
import * as jwt from 'jsonwebtoken';

describe('AuthService', () => {
  let service: AuthService;
  let envService: EnvService;

  const mockSecretKey = Keypair.random().secret();
  const mockJwtSecret = 'super_secret_jwt_key_that_is_at_least_32_bytes_long!';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: EnvService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'ANCHOR_SIGNING_SECRET') return mockSecretKey;
              if (key === 'JWT_SECRET') return mockJwtSecret;
              if (key === 'NETWORK_PASSPHRASE') return Networks.TESTNET;
              if (key === 'WEB_AUTH_ENDPOINT') return 'http://localhost:4000/auth';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    envService = module.get<EnvService>(EnvService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should complete the full SEP-10 flow successfully', async () => {
    const clientKeypair = Keypair.random();
    
    // 1. Get Challenge
    const { transaction, network_passphrase } = await service.getChallenge(clientKeypair.publicKey());
    expect(transaction).toBeDefined();
    expect(network_passphrase).toBe(Networks.TESTNET);

    // 2. Client signs the challenge
    // Note: We don't have stellar-sdk fully mocked, so we just use the real SDK logic.
    // The challenge is a base64 encoded transaction. We parse it and sign it.
    // Since stellar-sdk 16 changed things, let's just use the transaction object or assume it works if we mock it, 
    // but testing real SDK logic is better. Let's see if we can sign it using Keypair.
    // Wait, WebAuth.readChallengeTx parses it. So we can parse and sign.
    // We will use the Transaction object. But since it's base64, we can import Transaction from stellar-sdk.
    // But since it's just a unit test and I don't want to import deep stellar-sdk types that might break, 
    // I will just spy on WebAuth or use it directly.
    const { Transaction } = require('@stellar/stellar-sdk');
    const tx = new Transaction(transaction, network_passphrase);
    tx.sign(clientKeypair);
    const signedTxBase64 = tx.toXDR();

    // 3. Verify Challenge and Issue Token
    const { token } = await service.verifyChallengeAndIssueToken(signedTxBase64);
    expect(token).toBeDefined();

    // 4. Verify the JWT
    const decoded = jwt.verify(token, mockJwtSecret) as any;
    expect(decoded.sub).toBe(clientKeypair.publicKey());
    expect(decoded.iss).toBe('localhost:4000');
  });

  it('should throw UnauthorizedException if signature is missing or invalid', async () => {
    const clientKeypair = Keypair.random();
    const wrongKeypair = Keypair.random();
    
    // 1. Get Challenge
    const { transaction, network_passphrase } = await service.getChallenge(clientKeypair.publicKey());

    // 2. Client signs with WRONG key
    const { Transaction } = require('@stellar/stellar-sdk');
    const tx = new Transaction(transaction, network_passphrase);
    tx.sign(wrongKeypair); // wrong signature
    const signedTxBase64 = tx.toXDR();

    // 3. Verify should fail
    await expect(service.verifyChallengeAndIssueToken(signedTxBase64)).rejects.toThrow('Transaction is not signed by the client');
  });
});
