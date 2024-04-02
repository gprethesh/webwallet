import { ENDIAN, SMALLEST, CURVE } from "./constants.js";
import { pointToString, stringToPoint, InputType } from "./helpers.js";
const elliptic = (await import("elliptic")).default;
const EC = elliptic.ec;
const ec = new EC("p256");
const BN = (await import("bn.js")).default;
const Decimal = (await import("decimal.js")).Decimal;

class TransactionInput {
  constructor(
    inputTxHash,
    index,
    privateKey = null,
    transaction = null,
    amount = null,
    publicKey = null,
    inputType = InputType.REGULAR
  ) {
    this.txHash = inputTxHash;
    this.index = index;
    this.privateKey = privateKey;
    this.transaction = transaction;
    this.transactionInfo = null;
    this.amount = amount ? new Decimal(amount) : null;
    this.publicKey = publicKey;
    this.inputType = inputType;
    if (transaction !== null && amount === null) {
      this.getRelatedOutput();
    }
  }

  async getTransaction() {
    return this.transaction;
  }

  async getTransactionInfo() {
    if (this.transactionInfo === null)
      throw new Error("Transaction info is null");
    return this.transactionInfo;
  }

  async getRelatedOutput() {
    const tx = await this.getTransaction();
    const relatedOutput = tx.outputs[this.index];
    this.amount = new Decimal(relatedOutput.amount);
    return relatedOutput;
  }

  async getRelatedInput() {
    const tx = await this.getTransaction();
    return tx.inputs[0];
  }

  async getRelatedInputInfo() {
    const tx = await this.getTransactionInfo();
    return { address: tx.inputsAddresses[0] };
  }

  async getRelatedOutputInfo() {
    const tx = await this.getTransactionInfo();
    const relatedOutput = {
      address: tx.outputsAddresses[this.index],
      amount: new Decimal(tx.outputsAmounts[this.index]).div(SMALLEST),
    };
    this.amount = relatedOutput.amount;
    return relatedOutput;
  }

  async getAmount() {
    if (this.amount === null) {
      if (this.transaction !== null) {
        return this.transaction.outputs[this.index].amount;
      } else {
        await this.getRelatedOutputInfo();
      }
    }
    return this.amount;
  }

  async getAddress() {
    if (this.transaction !== null) {
      return (await this.getRelatedOutput()).address;
    }
    return (await this.getRelatedOutputInfo()).address;
  }

  async getVoterAddress() {
    if (this.transaction !== null) {
      return (await this.getRelatedInput()).address;
    }
    return (await this.getRelatedInputInfo()).address;
  }

  sign(txHex, privateKey = null) {
    privateKey = privateKey || this.privateKey;
    console.log("privateKey", privateKey);
    const key = ec.keyFromPrivate(privateKey, "hex");
    this.signed = key.sign(txHex);
  }

  async getPublicKey() {
    if (this.publicKey) return this.publicKey;
    return stringToPoint(await this.getAddress());
  }

  async getVoterPublicKey() {
    if (this.publicKey) return this.publicKey;
    return stringToPoint(await this.getVoterAddress());
  }

  toBytes() {
    const txHashBytes = Buffer.from(this.txHash, "hex");
    const indexBytes = Buffer.alloc(1);
    indexBytes.writeInt8(this.index, 0);
    const inputTypeBytes = Buffer.alloc(1);
    inputTypeBytes.writeInt8(this.inputType, 0);
    return Buffer.concat([txHashBytes, indexBytes, inputTypeBytes]);
  }

  getSignature() {
    return this.signed.r.toString(16, 32) + this.signed.s.toString(16, 32);
  }

  async verify(inputTx) {
    try {
      const publicKey = await this.getPublicKey();
      const key = ec.keyFromPublic(publicKey, "hex");
      return key.verify(inputTx, this.signed);
    } catch (error) {
      return false;
    }
  }

  async verifyRevokeTx(inputTx) {
    try {
      const publicKey = await this.getVoterPublicKey();
      const key = ec.keyFromPublic(publicKey, "hex");
      return key.verify(inputTx, this.signed);
    } catch (error) {
      return false;
    }
  }

  get asDict() {
    const selfDict = { ...this };
    selfDict.signed = selfDict.signed !== null;
    if ("publicKey" in selfDict)
      selfDict.publicKey = pointToString(selfDict.publicKey);
    delete selfDict.transaction;
    delete selfDict.privateKey;
    return selfDict;
  }

  equals(other) {
    if (!(other instanceof TransactionInput)) return false;
    return this.txHash === other.txHash && this.index === other.index;
  }
}

export { TransactionInput };
