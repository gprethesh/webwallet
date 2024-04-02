const ecLib = (await import("elliptic")).default;
import { fileURLToPath } from "url";
import path from "path";
import { promises as fs } from "fs";
import { CURVE } from "./constants.js";
import { pointToString, sha256 } from "./helpers.js";
import { Utils } from "./utils.js";
import readline from "readline";

import axios from "axios";

async function pushTx(tx) {
  console.log("tx", tx);
  try {
    const response = await axios.get(`https://api.upow.ai/push_tx`, {
      params: { tx_hex: tx.hex() },
      timeout: 10000,
    });
    console.log("response", response);

    const res = response.data;
    if (res.ok) {
      console.log(`Transaction pushed. Transaction hash: ${sha256(tx.hex())}`);
    } else {
      console.error("\nTransaction has not been pushed");
    }
  } catch (error) {
    console.error(`Error during request to node: ${error}`);
  }
}

class Wallet {
  constructor() {
    this.ec = new ecLib.ec(CURVE);
    this.utils = new Utils();
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    this.keyPairListPath = path.join(__dirname, "key_pair_list.json");
  }

  // Function to create a new wallet
  async createWallet() {
    let keyPairList = await this.loadKeyPairs();
    // Ensure keyPairList is an array
    if (!Array.isArray(keyPairList)) {
      console.error(
        "Loaded key pair list is not an array. Initializing to an empty array."
      );
      keyPairList = [];
    }

    const key = this.ec.genKeyPair();
    const privateKey = key.getPrivate().toString(10);
    const publicKey = pointToString(key.getPublic());
    keyPairList.push({ privateKey, publicKey });

    await this.saveKeyPairs(keyPairList);
    console.log(
      `Private key: ${privateKey}\nAddress (Public Key): ${publicKey}`
    );
  }

  // Function to send a transaction
  async send(recipient, amount, message = "") {
    const selectedKeyPair = await this.selectKey();
    if (!selectedKeyPair) {
      console.log("No keys available. Please create a wallet first.");
      return;
    }

    const tx = await this.utils.createTransaction(
      selectedKeyPair.privateKey,
      recipient,
      amount,
      message ? Buffer.from(message, "utf-8").toString("hex") : null
    );

    await pushTx(tx);
  }

  // Stake an amount
  async stake(amount) {
    const selectedKeyPair = await this.selectKey();
    if (!selectedKeyPair) {
      console.log("No keys available. Please create a wallet first.");
      return;
    }

    const tx = await this.utils.createStakeTransaction(
      selectedKeyPair.privateKey,
      amount
    );

    await pushTx(tx);
  }

  // Unstake an amount
  async unstake() {
    const selectedKeyPair = await this.selectKey();
    if (!selectedKeyPair) {
      console.log("No keys available. Please create a wallet first.");
      return;
    }

    const tx = await this.utils.createUnstakeTransaction(
      selectedKeyPair.privateKey
    );
    await pushTx(tx);
  }

  // Register as an inode
  async registerINode() {
    const selectedKeyPair = await this.selectKey();
    if (!selectedKeyPair) {
      console.log("No keys available. Please create a wallet first.");
      return;
    }

    const tx = await this.utils.createINodeRegistrationTransaction(
      selectedKeyPair.privateKey
    );
    await pushTx(tx);
  }

  // De-register as an inode
  async deRegisterINode() {
    const selectedKeyPair = await this.selectKey();
    if (!selectedKeyPair) {
      console.log("No keys available. Please create a wallet first.");
      return;
    }

    const tx = await this.utils.createINodeDeRegistrationTransaction(
      selectedKeyPair.privateKey
    );
    await pushTx(tx);
  }

  // Register as a validator
  async registerValidator() {
    const selectedKeyPair = await this.selectKey();
    if (!selectedKeyPair) {
      console.log("No keys available. Please create a wallet first.");
      return;
    }

    const tx = await this.utils.createValidatorRegistrationTransaction(
      selectedKeyPair.privateKey
    );
    await pushTx(tx);
  }

  // Vote
  async vote(voteRange, recipient) {
    const selectedKeyPair = await this.selectKey();
    if (!selectedKeyPair) {
      console.log("No keys available. Please create a wallet first.");
      return;
    }

    const tx = await this.utils.createVotingTransaction(
      selectedKeyPair.privateKey,
      voteRange,
      recipient
    );

    await pushTx(tx);
  }

  // Revoke a vote
  async revoke(revokeFrom) {
    const selectedKeyPair = await this.selectKey();
    if (!selectedKeyPair) {
      console.log("No keys available. Please create a wallet first.");
      return;
    }

    const tx = await this.utils.createRevokeTransaction(
      selectedKeyPair.privateKey,
      revokeFrom
    );
    await pushTx(tx);
  }

  async loadKeyPairs() {
    try {
      await fs.access(this.keyPairListPath);
      const data = await fs.readFile(this.keyPairListPath, {
        encoding: "utf8",
      });
      const keyPairList = JSON.parse(data);

      if (Array.isArray(keyPairList)) {
        return keyPairList;
      } else {
        console.error("Invalid key pair list format. Expected an array.");
        return [];
      }
    } catch (error) {
      return [];
    }
  }

  async saveKeyPairs(keyPairList) {
    await fs.writeFile(
      this.keyPairListPath,
      JSON.stringify(keyPairList, null, 2),
      { encoding: "utf8" }
    );
  }

  async selectKey() {
    const keyPairList = await this.loadKeyPairs();
    if (!Array.isArray(keyPairList) || keyPairList.length === 0) {
      console.error("No keys available. Please create a wallet first.");
      return null;
    }

    if (keyPairList.length === 1) {
      return keyPairList[0];
    }

    console.log("Available keys:");
    keyPairList.forEach((pair, index) => {
      console.log(`${index}: ${pair.publicKey}`);
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const selectedIndex = await new Promise((resolve) => {
      rl.question("Select key by index: ", (answer) => {
        rl.close();
        resolve(answer);
      });
    });

    const index = parseInt(selectedIndex, 10);
    if (isNaN(index) || index < 0 || index >= keyPairList.length) {
      console.error("Invalid selection.");
      return null;
    }
    return keyPairList[index];
  }
}

async function main() {
  const [, , command, ...args] = process.argv;

  const wallet = new Wallet();

  switch (command) {
    case "createwallet":
      await wallet.createWallet();
      break;
    case "send":
      if (args.length < 2) {
        console.log(
          "Usage: node wallet.js send <recipient> <amount> [message]"
        );
        return;
      }
      const [recipient, amount, message] = args;
      await wallet.send(recipient, amount, message);
      break;
    case "stake":
      if (args.length < 1) {
        console.log("Usage: node wallet.js stake <amount>");
        return;
      }
      await wallet.stake(args[0]);
      break;
    case "unstake":
      await wallet.unstake();
      break;
    case "register_inode":
      await wallet.registerINode();
      break;
    case "de_register_inode":
      await wallet.deRegisterINode();
      break;
    case "register_validator":
      await wallet.registerValidator();
      break;
    case "vote":
      if (args.length < 2) {
        console.log("Usage: node wallet.js vote <range> <recipient>");
        return;
      }
      await wallet.vote(args[0], args[1]);
      break;
    case "revoke":
      if (args.length < 1) {
        console.log("Usage: node wallet.js revoke <from_address>");
        return;
      }
      await wallet.revoke(args[0]);
      break;
    default:
      console.log("Unknown command or not implemented.");
  }
}

main().catch(console.error);
