// Bridge between the IOTA dApp Kit browser wallet and the identity library's
// TransactionSigner interface:
//   interface TransactionSigner {
//     sign(tx_data_bcs: Uint8Array): Promise<string>;
//     publicKey(): Promise<PublicKey>;   // from @iota/iota-sdk/cryptography
//   }
//
// The identity library builds a full TransactionData (with gas), BCS-encodes it,
// and calls sign(). We pass those bytes as a base64 string directly to the wallet,
// which signs them without any re-serialisation (avoiding a potential bytes mismatch
// that would occur if we round-tripped through Transaction.from()).

import { Ed25519PublicKey } from "@iota/iota-sdk/keypairs/ed25519";
import { Secp256k1PublicKey } from "@iota/iota-sdk/keypairs/secp256k1";
import { PublicKey } from "@iota/iota-sdk/cryptography";
import { toBase64, toHex } from "@iota/iota-sdk/utils";

// Typed to match the subset of UseSignTransactionArgs we actually use.
export type SignTransactionFn = (args: {
  transaction: string;
}) => Promise<{ bytes: string; signature: string }>;

export class WalletSigner {
  private readonly _publicKeyBytes: Uint8Array;
  private readonly _signFn: SignTransactionFn;

  constructor(publicKeyBytes: Uint8Array, signFn: SignTransactionFn) {
    this._publicKeyBytes = publicKeyBytes;
    this._signFn = signFn;
  }

  // Returns a PublicKey instance whose toIotaAddress() matches the connected wallet.
  //
  // IOTA wallets expose publicKey in one of three formats:
  //   32 bytes  — raw Ed25519 key
  //   33 bytes  — either IOTA-prefixed Ed25519 [0x00 + 32 raw]
  //               or raw Secp256k1 compressed [0x02/0x03 + 32 raw]
  //   34 bytes  — IOTA-prefixed Secp256k1 [0x01 + 33 raw]
  //
  // The dApp Kit burner wallet uses toIotaBytes() → 33 bytes, flag 0x00 (Ed25519).
  // We must check the flag rather than blindly treating every 33-byte key as Secp256k1.
  async publicKey(): Promise<PublicKey> {
    const bytes = this._publicKeyBytes;

    if (bytes.length === 32) {
      return new Ed25519PublicKey(bytes);
    }

    if (bytes.length === 33) {
      if (bytes[0] === 0x00) {
        // IOTA-prefixed Ed25519: [flag(1)] + [raw(32)]
        return new Ed25519PublicKey(bytes.slice(1));
      }
      // Raw Secp256k1 compressed: starts with 0x02 or 0x03
      return new Secp256k1PublicKey(bytes);
    }

    // 34 bytes: IOTA-prefixed Secp256k1 [flag(1)] + [raw(33)]
    return new Secp256k1PublicKey(bytes.slice(1));
  }

  // Required by TransactionSigner: returns [flag_byte, ...raw_key_bytes].
  // The WASM uses this to derive the on-chain address and verify the sender.
  async iotaPublicKeyBytes(): Promise<Uint8Array> {
    return (await this.publicKey()).toIotaBytes();
  }

  // Required by TransactionSigner: stable identifier for this key.
  // We use the hex encoding of the raw public key bytes.
  keyId(): string {
    return toHex(this._publicKeyBytes);
  }

  // Called by the identity library with BCS-encoded TransactionData bytes.
  // The wallet standard treats a base64 string as pre-serialised TransactionData
  // and signs it as-is, guaranteeing the signature covers exactly those bytes.
  async sign(txDataBcs: Uint8Array): Promise<string> {
    const { signature } = await this._signFn({ transaction: toBase64(txDataBcs) });
    return signature;
  }
}
