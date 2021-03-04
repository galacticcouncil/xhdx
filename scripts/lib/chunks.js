const Promise = require('bluebird');
const {ethers} = require("hardhat");
const retry = require('p-retry');
const ProgressBar = require('progress');

const { bn } = require('./utils');
const {provider} = ethers;
const etherscanProvider = new ethers.providers.EtherscanProvider('homestead', process.env.ETHERSCAN_API_KEY);

class Chunks {

  constructor(fromBlock, toBlock, concurrency = 20) {
    this.fromBlock = fromBlock;
    this.toBlock = toBlock;
    this.concurrency = concurrency;
  };

  /**
   * loads indexed transactions of contract from etherscan
   *
   * @param contract instance
   * @returns {Promise<*>}
   */
  fetchTransactions = async contract => this.chunky((fromBlock, toBlock) =>
      etherscanProvider.getHistory(contract.address, fromBlock, toBlock)
          .then(txs => txs.map(tx => {
            let parsed;
            try {
              parsed = contract.interface.parseTransaction(tx);
            } catch (e) {
              parsed = {};
            }
            return {...tx, ...parsed, from: tx.from.toLowerCase()};
          })));

  /**
   * loads receipts of transactions
   *
   * @param txs list of transactions
   * @param concurrency
   * @returns {Promise<*>}
   */
  loadReceipts = async (txs, concurrency = this.concurrency) => {
    const bar = new ProgressBar('loading receipts [:bar] :rate/txs :percent :etas', {total: txs.length});
    return await Promise.map(txs, async tx => {
      const receipt = await retry(() => provider.getTransactionReceipt(tx.hash), {retries: 3});
      bar.tick();
      return {...tx, receipt};
    }, {concurrency})
  };

  /**
   * reconstructs balances of erc20 contracts from transfer events
   *
   * @param erc20Contract instance
   * @returns {Promise<{}>}
   */
  fetchBalances = async erc20Contract => {
    const transfers = await this.pastEvents(erc20Contract, 'Transfer');
    const balances = {};
    transfers.forEach(({args: {from, to, value}}) => {
      from = from.toLowerCase();
      to = to.toLowerCase();
      if (!balances[from]) {
        balances[from] = bn(0);
      }
      if (!balances[to]) {
        balances[to] = bn(0);
      }
      balances[from] = balances[from].sub(value);
      balances[to] = balances[to].add(value);
    });
    delete balances['0x0000000000000000000000000000000000000000'];
    return balances;
  };

  /**
   * loads past logs of contract and parsed them into events
   *
   * @param contract
   * @param eventName
   * @param additionalTopics to filter query
   * @returns {Promise<*>}
   */
  pastEvents = async (
      contract,
      eventName,
      additionalTopics = [],
  ) => {
    const eventTopic = contract.interface.getEventTopic(eventName);
    const topics = [eventTopic, ...additionalTopics];
    return this.chunky(
        async (fromBlock, toBlock) => {
          const logs = await provider.getLogs({
            fromBlock,
            toBlock,
            address: contract.address,
            topics,
          });
          return logs.map(event => ({...event, ...contract.interface.parseLog(event)}));
        });
  };

  /**
   * checks whenever there is deployed contract on address
   *
   * @param address
   * @returns {Promise<boolean>}
   */
  isContract = address => retry(() => provider.getCode(address), {retries: 3}).then(r => r !== '0x');

  /**
   * resolves request across blocks in chunks
   *
   * @param callback
   * @param fromBlock
   * @param toBlock
   * @param blockChunk
   * @param concurrency
   * @returns {Promise<*>}
   */
  chunky = async (
      callback,
      fromBlock = this.fromBlock,
      toBlock = this.toBlock,
      blockChunk = 2000,
      concurrency = this.concurrency
  ) => {
    const bar = new ProgressBar('processing blocks [:bar] :percent', {total: toBlock - fromBlock});
    let chunks = [{fromBlock, toBlock}];
    if (fromBlock) {
      const from = fromBlock;
      const to = toBlock === 'latest' ? (await provider.getBlock('latest')).number : toBlock;
      if (to - from > blockChunk) {
        chunks = [];
        let block = from;
        while (block + blockChunk < to) {
          chunks.push({fromBlock: block, toBlock: (block += blockChunk)});
          block++;
        }
        if (block < to) {
          chunks.push({fromBlock: block, toBlock});
        }
      }
    }
    return Promise.map(
        chunks,
        ({fromBlock, toBlock}) =>
            retry(async () => {
              const res = await callback(fromBlock, toBlock);
              bar.tick(blockChunk);
              return res;
            }, {retries: 3}),
        {concurrency},
    ).then(chunks => chunks.flat());
  };
}

module.exports = Chunks;
