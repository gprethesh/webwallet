const Decimal = (await import("decimal.js")).Decimal;
import { stringToPoint, roundUpDecimal } from "./helpers.js";
import { TransactionInput } from "./transactionInput.js";

class WalletRepository {
  constructor(nodeUrl) {
    this.nodeUrl = nodeUrl;
  }

  async fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async get_address_info(
    address,
    stake_outputs = false,
    delegate_spent_votes = false,
    delegate_unspent_votes = false,
    address_state = false,
    inode_registration_outputs = false,
    validator_unspent_votes = false
  ) {
    const params = new URLSearchParams({
      address,
      transactions_count_limit: 0,
      show_pending: true,
      stake_outputs,
      delegate_spent_votes,
      delegate_unspent_votes,
      address_state,
      inode_registration_outputs,
      validator_unspent_votes,
    });

    const result = await this.fetchJson(
      `${this.nodeUrl}/get_address_info?${params.toString()}`
    );
    return result.result;
  }

  async get_dobby_info() {
    const result = await this.fetchJson(`${this.nodeUrl}/dobby_info`);
    return result.result;
  }

  async get_validators_info(inode = null) {
    const params = inode ? new URLSearchParams({ inode }).toString() : "";
    const result = await this.fetchJson(
      `${this.nodeUrl}/get_validators_info?${params}`
    );
    return result;
  }

  get_inode_ballot_input_by_address_from_json(
    json,
    address,
    inodeAddress,
    pendingSpentOutputs = [],
    checkPendingTxs = true
  ) {
    const pendingSpent = checkPendingTxs
      ? pendingSpentOutputs.map((output) => output.tx_hash + output.index)
      : [];
    return json.flatMap((validatorInfo) =>
      validatorInfo.validator === address
        ? validatorInfo.vote
            .filter(
              (vote) =>
                !pendingSpent.includes(vote.tx_hash + vote.index) &&
                vote.wallet === inodeAddress
            )
            .map((validVote) => {
              const txInput = new TransactionInput(
                validVote.tx_hash,
                validVote.index
              );
              txInput.amount = new Decimal(validVote.vote_count.toString());
              txInput.public_key = stringToPoint(address);
              return txInput;
            })
        : []
    );
  }

  async get_delegates_info(validator = null) {
    const params = validator
      ? new URLSearchParams({ validator }).toString()
      : "";
    const result = await this.fetchJson(
      `${this.nodeUrl}/get_delegates_info?${params}`
    );
    return result;
  }

  get_validator_ballot_input_by_address_from_json(
    json,
    address,
    validatorAddress,
    pendingSpentOutputs = [],
    checkPendingTxs = true
  ) {
    const pendingSpent = checkPendingTxs
      ? pendingSpentOutputs.map((output) => output.tx_hash + output.index)
      : [];
    return json.flatMap((delegateInfo) =>
      delegateInfo.delegate === address
        ? delegateInfo.vote
            .filter(
              (vote) =>
                !pendingSpent.includes(vote.tx_hash + vote.index) &&
                vote.wallet === validatorAddress
            )
            .map((validVote) => {
              const txInput = new TransactionInput(
                validVote.tx_hash,
                validVote.index
              );
              txInput.amount = new Decimal(validVote.vote_count.toString());
              txInput.public_key = stringToPoint(address);
              return txInput;
            })
        : []
    );
  }

  get_address_input_from_json(result, address) {
    const pendingSpentOutputs = result.pending_spent_outputs.map(
      (output) => output.tx_hash + output.index
    );
    return result.spendable_outputs
      .filter(
        (output) => !pendingSpentOutputs.includes(output.tx_hash + output.index)
      )
      .map((spendableOutput) => {
        const txInput = new TransactionInput(
          spendableOutput.tx_hash,
          spendableOutput.index
        );
        txInput.amount = new Decimal(spendableOutput.amount.toString());
        txInput.publicKey = stringToPoint(address);
        return txInput;
      });
  }

  get_stake_input_from_json(result, address) {
    const pendingSpentOutputs = result.pending_spent_outputs.map(
      (output) => output.tx_hash + output.index
    );
    return (result.stake_outputs || [])
      .filter(
        (output) => !pendingSpentOutputs.includes(output.tx_hash + output.index)
      )
      .map((stakeOutput) => {
        const txInput = new TransactionInput(
          stakeOutput.tx_hash,
          stakeOutput.index
        );
        txInput.amount = new Decimal(stakeOutput.amount.toString());
        txInput.public_key = stringToPoint(address);
        return txInput;
      });
  }

  get_inode_registration_input_from_json(json, address) {
    const pendingSpentOutputs = json.pending_spent_outputs.map(
      (output) => output.tx_hash + output.index
    );
    return (json.inode_registration_outputs || [])
      .filter(
        (output) => !pendingSpentOutputs.includes(output.tx_hash + output.index)
      )
      .map((regOutput) => {
        const txInput = new TransactionInput(
          regOutput.tx_hash,
          regOutput.index
        );
        txInput.amount = new Decimal(regOutput.amount.toString());
        txInput.public_key = stringToPoint(address);
        return txInput;
      });
  }

  get_delegate_spent_votes_from_json(json, checkPendingTxs = true) {
    const pendingSpentOutputs = checkPendingTxs
      ? json.pending_spent_outputs.map(
          (output) => output.tx_hash + output.index
        )
      : [];
    return (json.delegate_spent_votes || [])
      .filter(
        (vote) => !pendingSpentOutputs.includes(vote.tx_hash + vote.index)
      )
      .map((spentVote) => {
        const txInput = new TransactionInput(
          spentVote.tx_hash,
          spentVote.index
        );
        txInput.amount = new Decimal(spentVote.amount.toString());
        return txInput;
      });
  }

  get_delegate_unspent_votes_from_json(
    json,
    address = null,
    checkPendingTxs = true
  ) {
    const pendingSpentOutputs = checkPendingTxs
      ? json.pending_spent_outputs.map(
          (output) => output.tx_hash + output.index
        )
      : [];
    return (json.delegate_unspent_votes || [])
      .filter(
        (vote) => !pendingSpentOutputs.includes(vote.tx_hash + vote.index)
      )
      .map((unspentVote) => {
        const txInput = new TransactionInput(
          unspentVote.tx_hash,
          unspentVote.index
        );
        txInput.amount = new Decimal(unspentVote.amount.toString());
        if (address) txInput.public_key = stringToPoint(address);
        return txInput;
      });
  }

  get_validator_unspent_votes_from_json(json, address, checkPendingTxs = true) {
    const pendingSpentOutputs = checkPendingTxs
      ? json.pending_spent_outputs.map(
          (output) => output.tx_hash + output.index
        )
      : [];
    return (json.validator_unspent_votes || [])
      .filter(
        (vote) => !pendingSpentOutputs.includes(vote.tx_hash + vote.index)
      )
      .map((unspentVote) => {
        const txInput = new TransactionInput(
          unspentVote.tx_hash,
          unspentVote.index
        );
        txInput.amount = new Decimal(unspentVote.amount.toString());
        txInput.public_key = stringToPoint(address);
        return txInput;
      });
  }

  get_delegates_all_power(json) {
    const delegatesUnspentVotes = this.get_delegate_unspent_votes_from_json(
      json,
      null,
      false
    );
    const delegatesSpentVotes = this.get_delegate_spent_votes_from_json(
      json,
      false
    );
    const allVotes = delegatesUnspentVotes.concat(delegatesSpentVotes);
    const totalPower = allVotes.reduce(
      (acc, vote) => acc.plus(vote.amount),
      new Decimal(0)
    );
    console.assert(totalPower.lte(10), "Total delegate power exceeds limit");
    return allVotes;
  }

  async get_balance_info(address) {
    try {
      const response = await fetch(
        `${this.nodeUrl}/get_address_info?${new URLSearchParams({
          address,
          show_pending: true,
        }).toString()}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const { result } = await response.json();

      let totalBalance = new Decimal(result.balance.toString());
      let pendingBalance = new Decimal(0);
      let stakeBalance = new Decimal(result.stake.toString());
      let pendingStakeBalance = new Decimal(0);

      // Logic to calculate balances...

      return {
        totalBalance: roundUpDecimal(totalBalance),
        pendingBalance: roundUpDecimal(pendingBalance),
        stakeBalance: roundUpDecimal(stakeBalance),
        pendingStakeBalance: roundUpDecimal(pendingStakeBalance),
        error: false,
      };
    } catch (error) {
      console.error(`Error during request to node: ${error}`);
      return {
        totalBalance: null,
        pendingBalance: null,
        stakeBalance: null,
        pendingStakeBalance: null,
        error: true,
      };
    }
  }
}

export { WalletRepository };
