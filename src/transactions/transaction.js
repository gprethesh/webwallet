const Decimal = (await import("decimal.js")).Decimal;
const ec = (await import("elliptic")).default;
import { CoinbaseTransaction } from "./coinbaseTransaction.js";
import { ENDIAN, SMALLEST, CURVE } from "./constants.js";
import {
  getTransactionTypeFromMessage,
  sha256,
  OutputType,
  bytesToString,
  pointToString,
  InputType,
} from "./helpers.js";

import { TransactionInput } from "./transactionInput.js";
import { TransactionOutput } from "./transactionOutput.js";

class Transaction {
  constructor(inputs, outputs, message = null, version = null) {
    if (inputs.length >= 256) {
      throw new Error(
        `You can spend max 255 inputs in a single transaction, not ${inputs.length}`
      );
    }
    if (outputs.length >= 256) {
      throw new Error(
        `You can have max 255 outputs in a single transaction, not ${outputs.length}`
      );
    }
    this.inputs = inputs;
    this.outputs = outputs;
    this.message = message;
    this.transactionType = getTransactionTypeFromMessage(message);

    console.log("Logging addressBytes lengths for each output:");
    outputs.forEach((output, index) => {
      console.log(
        `Output ${index}: addressBytes length = ${output.addressBytes.length}`
      );
    });
    if (version === null) {
      if (outputs.every((output) => output.addressBytes.length === 64)) {
        version = 1;
      } else if (outputs.every((output) => output.addressBytes.length === 33)) {
        version = 3;
      } else {
        throw new Error("Not implemented");
      }
    }
    if (version > 3) {
      throw new Error("Not implemented");
    }
    this.version = version;
    this._hex = null;
    this.fees = null;
    this.txHash = null;
  }

  hex(full = true) {
    const inputsHex = this.inputs
      .map((input) => input.toBytes().toString("hex"))
      .join("");
    const outputsHex = this.outputs
      .map((output) => output.toBytes().toString("hex"))
      .join("");

    this._hex = [
      this.version.toString(16).padStart(2, "0"),
      this.inputs.length.toString(16).padStart(2, "0"),
      inputsHex,
      this.outputs.length.toString(16).padStart(2, "0"),
      outputsHex,
    ].join("");

    if (!full && (this.version <= 2 || this.message === null)) {
      return this._hex;
    }

    if (this.message !== null) {
      const messageLengthHex =
        this.version <= 2
          ? [1, this.message.length]
              .map((byte) => byte.toString(16).padStart(2, "0"))
              .join("")
          : `01${this.message.length.toString(16).padStart(4, "0")}`;
      this._hex += messageLengthHex + this.message.toString("hex");
    } else {
      this._hex += "00";
    }
    let signatures = [];
    this.inputs.forEach((input) => {
      let signed = input.getSignature();
      if (!signatures.includes(signed)) {
        signatures.push(signed);
        this._hex += signed.toString("hex");
      }
    });

    return this._hex;
  }

  hash() {
    if (this.txHash === null) {
      this.txHash = sha256(this.hex());
    }
    return this.txHash;
  }

  _verify_double_spend_same_transaction() {
    const usedInputs = new Set();
    for (const txInput of this.inputs) {
      const inputHash = `${txInput.txHash}${txInput.index}`;
      if (usedInputs.has(inputHash)) {
        return false;
      }
      usedInputs.add(inputHash);
    }
    return true;
  }

  async _check_signature() {
    const txHex = this.hex(false);
    const checkedSignatures = new Set();
    for (const txInput of this.inputs) {
      if (txInput.signed === null) {
        console.log("not signed");
        return false;
      }
      await txInput.getPublicKey();
      const signature = `${txInput.publicKey}:${txInput.signed}`;
      if (checkedSignatures.has(signature)) {
        continue;
      }
      if (!(await txInput.verify(txHex))) {
        console.log("signature not valid");
        return false;
      }
      checkedSignatures.add(signature);
    }
    return true;
  }

  sign(privateKeys = []) {
    for (const privateKey of privateKeys) {
      for (const input of this.inputs) {
        if (
          input.privateKey === null &&
          (input.publicKey || input.transaction)
        ) {
          input.sign(privateKey, this.hex(false));
        }
      }
    }
  }

  static async from_hex(hexString, checkSignatures = true) {
    console.log(
      "from_hex method needs to be implemented based on your transaction format."
    );
  }

  equals(other) {
    return this.hex() === other.hex();
  }

  notEquals(other) {
    return !this.equals(other);
  }
}

export { Transaction };
