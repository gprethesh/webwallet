import Decimal from "decimal.js";
import { ENDIAN } from "./constants.js";
import { InputType, sha256 } from "./helpers.js";
import { TransactionOutput } from "./transactionOutput.js";

class CoinbaseTransaction {
  _hex = null;

  constructor(block_hash, address, amount) {
    this.block_hash = block_hash;
    this.address = address;
    this.amount = new Decimal(amount);
    this.outputs = [new TransactionOutput(address, this.amount)];
  }

  hex() {
    if (this._hex !== null) {
      return this._hex;
    }

    const hexInputs =
      Buffer.from(this.block_hash, "hex").toString("hex") +
      Buffer.from([0]).toString("hex") +
      Buffer.from([InputType.REGULAR.value], ENDIAN).toString("hex");

    const hexOutputs = this.outputs
      .map((tx_output) => tx_output.tobytes().toString("hex"))
      .join("");

    let version;
    if (
      this.outputs.every((tx_output) => tx_output.address_bytes.length === 64)
    ) {
      version = 1;
    } else if (
      this.outputs.every((tx_output) => tx_output.address_bytes.length === 33)
    ) {
      version = 2;
    } else {
      throw new Error("NotImplementedError");
    }

    this._hex = Buffer.concat([
      Buffer.from([version]),
      Buffer.from([1]),
      Buffer.from(hexInputs, "hex"),
      Buffer.from([this.outputs.length]),
      Buffer.from(hexOutputs, "hex"),
      Buffer.from([36]),
    ]).toString("hex");

    return this._hex;
  }

  hash() {
    return sha256(this.hex());
  }
}

export { CoinbaseTransaction };
