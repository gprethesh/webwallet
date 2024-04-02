import { ENDIAN, SMALLEST, CURVE } from "./constants.js";
const elliptic = (await import("elliptic")).default;
const EC = elliptic.ec;
const ecurve = new EC("p256");
import {
  byteLength,
  stringToPoint,
  stringToBytes,
  OutputType,
} from "./helpers.js";

function isPoint(obj) {
  if (obj && typeof obj === "object") {
    return typeof obj.getX === "function" && typeof obj.getY === "function";
  }
  return false;
}

class TransactionOutput {
  constructor(address, amount, transactionType = OutputType.REGULAR) {
    if (isPoint(address)) {
      throw new Error(
        "TransactionOutput does not accept Point anymore. Pass the address string instead"
      );
    }
    this.address = address;
    this.addressBytes = stringToBytes(address);
    this.publicKey = stringToPoint(address);
    if (!Number.isInteger(amount * SMALLEST)) {
      throw new Error("too many decimal digits");
    }
    this.amount = amount;
    this.transactionType = transactionType;
    this.isStake = transactionType === OutputType.STAKE;
  }

  toBytes() {
    const amountBigInt = BigInt(Math.floor(this.amount * SMALLEST));
    const count = byteLength(amountBigInt);
    let amountBytes = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      const byte = (amountBigInt >> (8n * BigInt(i))) & 0xffn;
      amountBytes[i] = Number(byte);
    }

    if (ENDIAN === "le") {
      amountBytes = amountBytes.reverse();
    }

    const transactionTypeByte = new Uint8Array([this.transactionType]);
    const countByte = new Uint8Array([count]);

    let buffer = new Uint8Array(this.addressBytes.length + 1 + count + 1);
    buffer.set(this.addressBytes, 0);
    buffer.set(countByte, this.addressBytes.length);
    buffer.set(amountBytes, this.addressBytes.length + 1);
    buffer.set(transactionTypeByte, this.addressBytes.length + 1 + count);

    return buffer;
  }

  verify() {
    return this.amount > 0 && CURVE.isPointOnCurve(this.publicKey);
  }

  get asDict() {
    let res = { ...this };
    delete res.publicKey;
    return res;
  }
}

export { TransactionOutput };
