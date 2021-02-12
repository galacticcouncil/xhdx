const { ethers } = require("hardhat");
const abiDecoder = require('abi-decoder');
const retry = require('p-retry');
const tokenAbi = require("./abi/xhdx.json");
const exchangeAbi = require("./abi/balancer-exchange.json");
const Promise = require('bluebird');
const { provider } = ethers;

const concurrency = 20;
const fromBlock = 11750733;
const toBlock = 11836799;
const tokenAddress = '0x6fcb6408499a7c0f242e32d77eb51ffa1dd28a7e';
const exchangeAddress = '0x3e66b66fd1d0b02fda6c811da9e0547970db2f21';

const bn = n => ethers.BigNumber.from(n);

const pastEvents = async (
    contract,
    eventName,
    additionalTopics = [],
    fromBlock = 0,
    toBlock = 'latest',
    blockChunk = 2000,
    showProgress = false,
) => {
  class Progress {
    constructor(status, threshold = 1) {
      this.status = status;
      this.threshold = threshold;
      this.progress = 0;
    }

    tick() {
      this.progress += 1;
      if (this.progress % this.threshold === 0) {
        console.log(`${this.status} ${this.progress}`);
      }
    }
  }
  const eventTopic = contract.interface.getEventTopic(eventName);
  const topics = [eventTopic, ...additionalTopics];
  let chunks = [{ fromBlock, toBlock }];
  if (fromBlock) {
    const from = fromBlock;
    const to = toBlock === 'latest' ? (await provider.getBlock('latest')).number : toBlock;
    if (to - from > blockChunk) {
      chunks = [];
      let block = from;
      while (block + blockChunk < to) {
        chunks.push({ fromBlock: block, toBlock: (block += blockChunk) });
        block++;
      }
      if (block < to) {
        chunks.push({ fromBlock: block, toBlock });
      }
    }
  }
  const progress = new Progress('event chunks', 1);
  return Promise.map(
      chunks,
      ({ fromBlock, toBlock }) =>
          retry(async () => {
            const logs = await provider.getLogs({
              fromBlock,
              toBlock,
              address: contract.address,
              topics,
            });
            if (showProgress) {
              progress.tick();
            }
            return logs.map(event => ({ ...event, ...contract.interface.parseLog(event) }));
          }, { retries: 3 }),
      { concurrency },
  ).then(chunks => chunks.flat());
};

const isContract = address => retry(() => ethers.provider.getCode(address).then(r => r !== '0x'), { retries: 3 });

async function fetchBalances() {
  const xHDX = new ethers.Contract(tokenAddress, tokenAbi);
  const transfers = await pastEvents(xHDX, 'Transfer', [], fromBlock);
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
  return balances;
}

async function fetchTransactions(address) {
  const provider = new ethers.providers.EtherscanProvider();
  return provider.getHistory(address, fromBlock, toBlock);
}

async function main() {
  abiDecoder.addABI(exchangeAbi)
  const swaps = await fetchTransactions('0x6dba3f038becc02f4fc81ef25b3059d55a28cabc')
      .then(r => r.map(tx => ({...tx, method: abiDecoder.decodeMethod(tx.data)})));
  console.log('current block', (await ethers.provider.getBlock('latest')).number);
  const balances = await fetchBalances();
  const holders = Object.entries(balances)
      .filter(([_,value]) => value.gt(0))
      .reduce((a, [k, v]) => ({...a, [k]: v}), {});
  const contracts = await Promise.map(
        Object.entries(holders),
        async ([key, value]) => ([key, value, await isContract(key)]),
        { concurrency })
      .then(r => r.filter(([, , contract]) => contract))
      .reduce((a, [k, v]) => ({...a, [k]: v}), {});
  console.log('contracts', Object.keys(contracts).length);
  console.log(Object.keys(contracts));
  console.log('value locked', Number(Object.values(contracts).reduce((a, b) => a.add(b), bn(0)).div(bn(10).pow(12))));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
