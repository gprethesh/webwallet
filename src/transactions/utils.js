const Decimal = (await import("decimal.js")).Decimal;
const ec = (await import("elliptic")).default;
import { WalletRepository } from "./repository.js";
import { ENDIAN, SMALLEST, CURVE, MAX_INODES } from "./constants.js";
import { pointToString, OutputType, TransactionType } from "./helpers.js";
import { Transaction } from "./transaction.js";
import { TransactionOutput } from "./transactionOutput.js";

class Utils {
  constructor() {
    this.NODE_URL = "https://api.upow.ai";
    this.repo = new WalletRepository(this.NODE_URL);
  }

  async getBalanceInfo(address) {
    const result = await this.repo.get_balance_info(address);
    return result;
  }

  async createTransaction(
    privateKey,
    receivingAddress,
    amount,
    message = null,
    sendBackAddress = null
  ) {
    amount = new Decimal(amount);
    let inputs = [];
    const ecInstance = new ec.ec(CURVE);
    const keyPair = ecInstance.keyFromPrivate(privateKey, "hex");
    const senderAddress = pointToString(keyPair.getPublic());
    if (!sendBackAddress) {
      sendBackAddress = senderAddress;
    }

    const rJson = await this.repo.get_address_info(senderAddress);

    const addressInputs = await this.repo.get_address_input_from_json(
      rJson,
      senderAddress
    );

    inputs = inputs.concat(addressInputs);
    if (inputs.length === 0) {
      throw new Error("No spendable outputs");
    }

    const totalInputAmount = inputs.reduce(
      (acc, input) => acc.plus(new Decimal(input.amount)),
      new Decimal(0)
    );
    if (totalInputAmount.lessThan(amount)) {
      throw new Error("Error: You don't have enough funds");
    }

    const transactionInputs = this.selectTransactionInput(inputs, amount);
    const transactionAmount = transactionInputs.reduce(
      (acc, input) => acc.plus(new Decimal(input.amount)),
      new Decimal(0)
    );

    const transaction = new Transaction(
      transactionInputs,
      [new TransactionOutput(receivingAddress, amount)],
      message
    );

    if (transactionAmount.greaterThan(amount)) {
      transaction.outputs.push(
        new TransactionOutput(sendBackAddress, transactionAmount.minus(amount))
      );
    }

    transaction.sign([privateKey]);

    return transaction;
  }

  async createTransactionToSendMultipleWallets(
    privateKey,
    receivingAddresses,
    amounts,
    message = null,
    sendBackAddress = null
  ) {
    if (receivingAddresses.length !== amounts.length) {
      throw new Error(
        "Receiving addresses length is different from amounts length"
      );
    }

    let totalAmount = amounts.reduce(
      (acc, amount) => acc.plus(new Decimal(amount)),
      new Decimal(0)
    );
    let inputs = [];
    const ecInstance = new ec.ec(CURVE);
    const keyPair = ecInstance.keyFromPrivate(privateKey, "hex");
    const senderAddress = pointToString(keyPair.getPublic());
    if (!sendBackAddress) {
      sendBackAddress = senderAddress;
    }

    const rJson = await this.repo.get_address_info(senderAddress);
    const addressInputs = await this.repo.get_address_input_from_json(
      rJson,
      senderAddress
    );
    inputs = inputs.concat(addressInputs);

    if (inputs.length === 0) {
      throw new Error("No spendable outputs");
    }

    const totalInputAmount = inputs.reduce(
      (acc, input) => acc.plus(new Decimal(input.amount)),
      new Decimal(0)
    );
    if (totalInputAmount.lessThan(totalAmount)) {
      throw new Error("Error: You don't have enough funds");
    }

    const transactionInputs = this.selectTransactionInput(inputs, totalAmount);
    const transactionOutputs = receivingAddresses.map(
      (address, index) =>
        new TransactionOutput(address, new Decimal(amounts[index]))
    );

    const transactionAmount = transactionInputs.reduce(
      (acc, input) => acc.plus(new Decimal(input.amount)),
      new Decimal(0)
    );
    if (transactionAmount.greaterThan(totalAmount)) {
      transactionOutputs.push(
        new TransactionOutput(
          sendBackAddress,
          transactionAmount.minus(totalAmount)
        )
      );
    }

    const transaction = new Transaction(
      transactionInputs,
      transactionOutputs,
      message
    );
    transaction.sign([privateKey]);

    return transaction;
  }

  async createStakeTransaction(privateKey, amount, sendBackAddress = null) {
    amount = new Decimal(amount);
    let inputs = [];
    const ecInstance = new ec.ec(CURVE);
    const keyPair = ecInstance.keyFromPrivate(privateKey, "hex");
    const senderAddress = pointToString(keyPair.getPublic());
    if (!sendBackAddress) {
      sendBackAddress = senderAddress;
    }

    const resultJson = await this.repo.get_address_info(
      senderAddress,
      true,
      true,
      true
    );
    const stakeInputs = await this.repo.get_stake_input_from_json(
      resultJson,
      senderAddress
    );
    if (stakeInputs.length > 0) {
      throw new Error("Already staked");
    }

    const addressInputs = await this.repo.get_address_input_from_json(
      resultJson,
      senderAddress
    );
    inputs = inputs.concat(addressInputs);

    if (inputs.length === 0) {
      throw new Error("No spendable outputs");
    }

    const totalInputAmount = inputs.reduce(
      (acc, input) => acc.plus(new Decimal(input.amount)),
      new Decimal(0)
    );
    if (totalInputAmount.lessThan(amount)) {
      throw new Error("Error: You don't have enough funds");
    }

    const transactionInputs = this.selectTransactionInput(inputs, amount);
    const transaction = new Transaction(
      transactionInputs,
      [new TransactionOutput(senderAddress, amount, OutputType.STAKE)],
      null
    );

    if (totalInputAmount.greaterThan(amount)) {
      transaction.outputs.push(
        new TransactionOutput(sendBackAddress, totalInputAmount.minus(amount))
      );
    }

    transaction.sign([privateKey]);

    return transaction;
  }

  async createUnstakeTransaction(privateKey) {
    const ecInstance = new ec.ec(CURVE);
    const keyPair = ecInstance.keyFromPrivate(privateKey, "hex");
    const senderAddress = pointToString(keyPair.getPublic());

    const resultJson = await this.repo.get_address_info(senderAddress, true);
    const stakeInputs = await this.repo.get_stake_input_from_json(
      resultJson,
      senderAddress
    );
    if (stakeInputs.length === 0) {
      throw new Error("Error: There is nothing staked");
    }

    const amount = new Decimal(stakeInputs[0].amount);
    const transaction = new Transaction(
      [stakeInputs[0]],
      [new TransactionOutput(senderAddress, amount, OutputType.UN_STAKE)],
      null
    );

    transaction.sign([privateKey]);
    return transaction;
  }
  async createInodeRegistrationTransaction(privateKey) {
    const amount = new Decimal(1000);
    let inputs = [];
    const ecInstance = new ec.ec(CURVE);
    const keyPair = ecInstance.keyFromPrivate(privateKey, "hex");
    const address = pointToString(keyPair.getPublic());

    const resultJson = await this.repo.get_address_info(address, true, true);
    const stakeInputs = await this.repo.get_stake_input_from_json(
      resultJson,
      address
    );
    if (stakeInputs.length === 0) {
      throw new Error("You are not a delegate. Become a delegate by staking.");
    }

    if (resultJson.is_inode) {
      throw new Error("This address is already registered as inode.");
    }

    if (resultJson.is_validator) {
      throw new Error(
        "This address is registered as validator and a validator cannot be an inode."
      );
    }

    const inodeAddresses = await this.repo.get_dobby_info();
    if (inodeAddresses.length >= MAX_INODES) {
      throw new Error(`${MAX_INODES} inodes are already registered.`);
    }

    const addressInputs = await this.repo.get_address_input_from_json(
      resultJson,
      address
    );
    inputs = inputs.concat(addressInputs);

    if (inputs.length === 0) {
      throw new Error("No spendable outputs");
    }

    const transactionInputs = this.selectTransactionInput(inputs, amount);
    const transaction = new Transaction(
      transactionInputs,
      [new TransactionOutput(address, amount, OutputType.INODE_REGISTRATION)],
      null
    );

    transaction.sign([privateKey]);

    return transaction;
  }

  async createInodeDeRegistrationTransaction(privateKey) {
    let inputs = [];
    const ecInstance = new ec.ec(CURVE);
    const keyPair = ecInstance.keyFromPrivate(privateKey, "hex");
    const address = pointToString(keyPair.getPublic());

    const resultJson = await this.repo.get_address_info(address, false, true);
    const inodeRegistrationInputs =
      await this.repo.get_inode_registration_input_from_json(
        resultJson,
        address
      );

    if (inodeRegistrationInputs.length === 0) {
      throw new Error("This address is not registered as an inode.");
    }

    const transaction = new Transaction(
      inodeRegistrationInputs,
      [new TransactionOutput(address, inodeRegistrationInputs[0].amount)],
      this.stringToBytes(TransactionType.INODE_DE_REGISTRATION.toString())
    );

    transaction.sign([privateKey]);

    return transaction;
  }

  async createValidatorRegistrationTransaction(privateKey) {
    const amount = new Decimal(1);
    let inputs = [];
    const ecInstance = new ec.ec(CURVE);
    const keyPair = ecInstance.keyFromPrivate(privateKey, "hex");
    const address = pointToString(keyPair.getPublic());

    const resultJson = await this.repo.get_address_info(address, true, true);
    if (resultJson.is_validator) {
      throw new Error("This address is already registered as validator.");
    }

    if (resultJson.is_inode) {
      throw new Error(
        "This address is registered as inode and an inode cannot be a validator."
      );
    }

    const addressInputs = await this.repo.get_address_input_from_json(
      resultJson,
      address
    );
    inputs = inputs.concat(addressInputs);

    const transactionInputs = this.selectTransactionInput(inputs, amount);
    const transaction = new Transaction(
      transactionInputs,
      [
        new TransactionOutput(
          address,
          amount,
          OutputType.VALIDATOR_REGISTRATION
        ),
      ],
      this.stringToBytes(TransactionType.VALIDATOR_REGISTRATION.toString())
    );

    transaction.sign([privateKey]);

    return transaction;
  }

  async createVotingTransaction(privateKey, voteRange, voteReceivingAddress) {
    voteRange = new Decimal(voteRange);
    if (voteRange.lessThanOrEqualTo(0) || voteRange.greaterThan(10)) {
      throw new Error("Voting should be in the range of 1 to 10");
    }

    const ecInstance = new ec.ec(CURVE);
    const keyPair = ecInstance.keyFromPrivate(privateKey, "hex");
    const address = pointToString(keyPair.getPublic());
    const resultJson = await this.repo.get_address_info(
      address,
      true,
      true,
      true,
      true
    );

    const isValidatorRegistered = resultJson.is_validator;
    const isINodeRegistered = resultJson.is_inode;
    if (isINodeRegistered) {
      throw new Error("This address is registered as inode. Cannot vote.");
    }

    if (isValidatorRegistered) {
      return await this.voteAsValidator(
        privateKey,
        voteRange,
        voteReceivingAddress,
        resultJson
      );
    } else {
      return await this.voteAsDelegate(
        privateKey,
        voteRange,
        voteReceivingAddress,
        resultJson
      );
    }
  }

  async voteAsValidator(
    privateKey,
    voteRange,
    voteReceivingAddress,
    resultJson
  ) {
    const ecInstance = new ec.ec(CURVE);
    const keyPair = ecInstance.keyFromPrivate(privateKey, "hex");
    const address = pointToString(keyPair.getPublic());

    let inputs = await this.repo.get_validator_unspent_votes_from_json(
      resultJson,
      address
    );
    if (inputs.length === 0) {
      throw new Error("No voting outputs");
    }

    const totalVotingPower = inputs.reduce(
      (acc, input) => acc.plus(new Decimal(input.amount)),
      new Decimal(0)
    );
    if (totalVotingPower.lessThan(voteRange)) {
      throw new Error(
        "Error: You don't have enough voting power left. Kindly revoke some voting power."
      );
    }

    const transactionInputs = this.selectTransactionInput(inputs, voteRange);
    const transaction = new Transaction(
      transactionInputs,
      [
        new TransactionOutput(
          voteReceivingAddress,
          voteRange,
          OutputType.VOTE_AS_VALIDATOR
        ),
      ],
      this.stringToBytes(TransactionType.VOTE_AS_VALIDATOR.toString())
    );

    transaction.sign([privateKey]);
    return transaction;
  }

  async voteAsDelegate(
    privateKey,
    voteRange,
    voteReceivingAddress,
    resultJson
  ) {
    const ecInstance = new ec.ec(CURVE);
    const keyPair = ecInstance.keyFromPrivate(privateKey, "hex");
    const address = pointToString(keyPair.getPublic());

    let inputs = await this.repo.get_delegate_unspent_votes_from_json(
      resultJson,
      address
    );
    if (inputs.length === 0) {
      throw new Error("No voting outputs");
    }

    const totalVotingPower = inputs.reduce(
      (acc, input) => acc.plus(new Decimal(input.amount)),
      new Decimal(0)
    );
    if (totalVotingPower.lessThan(voteRange)) {
      throw new Error(
        "Error: You don't have enough voting power left. Kindly release some voting power."
      );
    }

    const transactionInputs = this.selectTransactionInput(inputs, voteRange);
    const transaction = new Transaction(
      transactionInputs,
      [
        new TransactionOutput(
          voteReceivingAddress,
          voteRange,
          OutputType.VOTE_AS_DELEGATE
        ),
      ],
      this.stringToBytes(TransactionType.VOTE_AS_DELEGATE.toString())
    );

    transaction.sign([privateKey]);
    return transaction;
  }

  async createRevokeTransaction(privateKey, revokeFromAddress) {
    const ecInstance = new ec.ec(CURVE);
    const keyPair = ecInstance.keyFromPrivate(privateKey, "hex");
    const address = pointToString(keyPair.getPublic());
    const resultJson = await this.repo.get_address_info(address, true, true);

    const isValidatorRegistered = resultJson.is_validator;
    if (isValidatorRegistered) {
      return await this.revokeVoteAsValidator(
        privateKey,
        revokeFromAddress,
        resultJson
      );
    } else {
      return await this.revokeVoteAsDelegate(
        privateKey,
        revokeFromAddress,
        resultJson
      );
    }
  }

  async revokeVoteAsValidator(privateKey, inodeAddress, addressInfo) {
    const ecInstance = new ec.ec(CURVE);
    const keyPair = ecInstance.keyFromPrivate(privateKey, "hex");
    const address = pointToString(keyPair.getPublic());

    const inodeBallot = await this.repo.get_validators_info(inodeAddress);
    let inodeBallotInputs =
      await this.repo.get_inode_ballot_input_by_address_from_json(
        inodeBallot,
        address,
        inodeAddress,
        addressInfo.pending_spent_outputs
      );

    if (inodeBallotInputs.length === 0) {
      throw new Error("You have not voted.");
    }

    const sumOfVotes = inodeBallotInputs.reduce(
      (acc, input) => acc.plus(new Decimal(input.amount)),
      new Decimal(0)
    );
    const transaction = new Transaction(
      inodeBallotInputs,
      [
        new TransactionOutput(
          address,
          sumOfVotes,
          OutputType.VALIDATOR_VOTING_POWER
        ),
      ],
      this.stringToBytes(TransactionType.REVOKE_AS_VALIDATOR.toString())
    );

    transaction.sign([privateKey]);
    return transaction;
  }

  async revokeVoteAsDelegate(privateKey, validatorAddress, addressInfo) {
    const ecInstance = new ec.ec(CURVE);
    const keyPair = ecInstance.keyFromPrivate(privateKey, "hex");
    const address = pointToString(keyPair.getPublic());

    const validatorBallot = await this.repo.get_delegates_info(
      validatorAddress
    );
    let validatorBallotInputs =
      await this.repo.get_validator_ballot_input_by_address_from_json(
        validatorBallot,
        address,
        validatorAddress,
        addressInfo.pending_spent_outputs
      );

    if (validatorBallotInputs.length === 0) {
      throw new Error("You have not voted.");
    }

    const sumOfVotes = validatorBallotInputs.reduce(
      (acc, input) => acc.plus(new Decimal(input.amount)),
      new Decimal(0)
    );
    const transaction = new Transaction(
      validatorBallotInputs,
      [
        new TransactionOutput(
          address,
          sumOfVotes,
          OutputType.DELEGATE_VOTING_POWER
        ),
      ],
      this.stringToBytes(TransactionType.REVOKE_AS_DELEGATE.toString())
    );

    transaction.sign([privateKey]);
    return transaction;
  }

  selectTransactionInput(inputs, amount) {
    let transactionInputs = [];
    let total = new Decimal(0);

    // Sort inputs by amount in descending order
    inputs.sort((a, b) => new Decimal(b.amount).minus(new Decimal(a.amount)));

    for (let input of inputs) {
      if (total.greaterThanOrEqualTo(amount)) break;
      transactionInputs.push(input);
      total = total.plus(new Decimal(input.amount));
    }

    // If exact amount not met, sort by ascending and try to match exactly
    if (total.lessThan(amount)) {
      transactionInputs = [];
      total = new Decimal(0);
      inputs.sort((a, b) => new Decimal(a.amount).minus(new Decimal(b.amount)));

      for (let input of inputs) {
        if (total.greaterThanOrEqualTo(amount)) break;
        transactionInputs.push(input);
        total = total.plus(new Decimal(input.amount));
      }
    }

    return transactionInputs;
  }
  stringToBytes(string) {
    if (!string) return null;
    try {
      return Buffer.from(string, "hex");
    } catch (error) {
      return Buffer.from(string);
    }
  }
}

export { Utils };
