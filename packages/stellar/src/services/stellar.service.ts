import {
  rpc,
  scValToNative,
  Keypair,
  Asset,
  TransactionBuilder,
  Networks,
  Operation,
  Horizon,
  xdr
} from '@stellar/stellar-sdk';
import { Injectable } from '@nestjs/common';

@Injectable()
export class StellarService {
  private rpcUrl = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
  private rpcServer = new rpc.Server(this.rpcUrl);

  getRpcServer(): rpc.Server {
    return this.rpcServer;
  }

  toNative(scValOrBase64: any): any {
    try {
      let scVal = scValOrBase64;
      if (typeof scVal === 'string') {
        scVal = xdr.ScVal.fromXDR(scVal, 'base64');
      } else if (scVal && scVal.xdr) {
        scVal = xdr.ScVal.fromXDR(scVal.xdr, 'base64');
      }
      return scValToNative(scVal);
    } catch (err: any) {
      console.warn('[Stellar] Failed to parse ScVal:', err.message);
      return null;
    }
  }

  async verifyTransaction(txHash: string): Promise<{ success: boolean; status: string }> {
    try {
      const txStatus = await this.rpcServer.getTransaction(txHash);
      return {
        success: txStatus.status === 'SUCCESS',
        status: txStatus.status,
      };
    } catch (err: any) {
      console.warn(`[Stellar] Could not query tx ${txHash} on-chain:`, err.message);
      return { success: false, status: 'UNKNOWN' };
    }
  }

  async faucet(destinationAddress: string): Promise<string> {
    const horizonUrl = 'https://horizon-testnet.stellar.org';
    const server = new Horizon.Server(horizonUrl);

    const fundingSecret = process.env.FUNDING_SECRET || 'SCQMGZP23PYPUUG652FNE4M44O5CB3NV3CPEXXVF7H6EJJ3SCUJZL6HO';
    const funderKeypair = Keypair.fromSecret(fundingSecret);
    const funderAccount = await server.loadAccount(funderKeypair.publicKey());

    const usdcAsset = new Asset(
      'USDC',
      process.env.USDC_ISSUER || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
    );

    const txBuilder = new TransactionBuilder(funderAccount, {
      fee: '15000',
      networkPassphrase: process.env.NETWORK_PASSPHRASE || Networks.TESTNET,
    });

    txBuilder.addOperation(Operation.pathPaymentStrictReceive({
      sendAsset: Asset.native(),
      sendMax: '10000',
      destination: destinationAddress,
      destAsset: usdcAsset,
      destAmount: '2000',
      path: []
    }));

    const tx = txBuilder.setTimeout(300).build();
    tx.sign(funderKeypair);

    const result = await server.submitTransaction(tx);
    if (!result.hash) {
      throw new Error('No transaction hash returned from horizon submission');
    }
    return result.hash;
  }

  async sponsorTransaction(innerXdr: string): Promise<string> {
    const anchorSigningKey = process.env.ANCHOR_SIGNING_KEY;
    if (!anchorSigningKey) {
      return innerXdr;
    }

    try {
      const feeWalletKeypair = Keypair.fromSecret(anchorSigningKey);
      const passphrase = process.env.NETWORK_PASSPHRASE || Networks.TESTNET;
      const innerTx = TransactionBuilder.fromXDR(innerXdr, passphrase);

      if ('innerTransaction' in innerTx) {
        throw new Error('Transaction is already fee-bumped');
      }

      const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
        feeWalletKeypair,
        '10000',
        innerTx as any,
        passphrase
      );

      feeBumpTx.sign(feeWalletKeypair);
      return feeBumpTx.toXDR();
    } catch (err: any) {
      console.error('[Stellar] Fee bump sponsorship failed:', err.message);
      throw new Error(`sponsor_failed: ${err.message}`);
    }
  }
}
