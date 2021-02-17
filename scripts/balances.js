const { ethers } = require("hardhat");
const fs = require('fs');
const retry = require('p-retry');
const tokenAbi = require("./abi/xhdx.json");
const exchangeAbi = require("./abi/balancer-exchange.json");
const exchange1Abi = require("./abi/balancer-exchange1.json");
const poolAbi = require("./abi/pool.json");
const Promise = require('bluebird');
const ProgressBar = require('progress');
const json2csv = require('json2csv');
const { provider, utils } = ethers;

const concurrency = 20;
const FROM_BLOCK = 11750733;
// const TO_BLOCK = 11817090;
const TO_BLOCK = 11836883; // pause block
const ethPrice = 1763.9025;
const hdxPrice = 0.080590606687;
const excluded = ['0xC2C5A77d9f434F424Df3d39de9e90d95A0Df5Aca'.toLowerCase()];
const daiAddress = '0x6b175474e89094c44da98b954eedeac495271d0f';
const tokenAddress = '0x6fcb6408499a7c0f242e32d77eb51ffa1dd28a7e';
const poolAddress = '0xF014fC5d0F02C19D617a30a745Ab86A8cA32C92F'.toLowerCase();
const exchangeAddress = '0x3e66b66fd1d0b02fda6c811da9e0547970db2f21';
const exchange1Address = '0x6317C5e82A06E1d8bf200d21F4510Ac2c038AC81'.toLowerCase();
const etherscan = new ethers.providers.EtherscanProvider('homestead', process.env.ETHERSCAN_API_KEY);
const xHDX = new ethers.Contract(tokenAddress, tokenAbi);
const contracts = {
  [tokenAddress]: xHDX,
  [exchangeAddress]: new ethers.Contract(exchangeAddress, exchangeAbi),
  [exchange1Address]: new ethers.Contract(exchange1Address, exchange1Abi),
  [poolAddress]: new ethers.Contract(poolAddress, poolAbi),
}

const bn = n => ethers.BigNumber.from(n);

const ethHdx = utils.parseEther(String(ethPrice / hdxPrice));
const ethToHdx = eth => eth.mul(ethHdx).div(bn(10).pow(24));
const formatHdx = hdx => utils.formatUnits(hdx, 12);

const groupBy = function(xs, key) {
  return xs.reduce(function(rv, x) {
    (rv[x[key]] = rv[x[key]] || []).push(x);
    return rv;
  }, {});
};
const diff = (a, b) => Object.keys(a).filter(i => !Object.keys(b).includes(i));
const toMap = (a, [k, v]) => ({...a, [k]: v});

const chunky = async (
    callback,
    fromBlock = FROM_BLOCK,
    toBlock = TO_BLOCK,
    blockChunk = 2000,
) => {
  const bar = new ProgressBar('processing blocks [:bar] :percent', { total: toBlock - fromBlock });
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
  return Promise.map(
      chunks,
      ({ fromBlock, toBlock }) =>
          retry(async () => {
            const res = await callback(fromBlock, toBlock);
            bar.tick(blockChunk);
            return res;
          }, { retries: 3 }),
      { concurrency },
  ).then(chunks => chunks.flat());
};

const pastEvents = async (
    contract,
    eventName,
    additionalTopics = [],
) => {
  const eventTopic = contract.interface.getEventTopic(eventName);
  const topics = [eventTopic, ...additionalTopics];
  return chunky(
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

const fetchTransactions = async address => chunky((fromBlock, toBlock) =>
    etherscan.getHistory(address, fromBlock, toBlock)
        .then(txs => txs.map(tx => {
          let parsed = null;
          try {
            parsed = contracts[address].interface.parseTransaction(tx);
          } catch (e) { }
          return {...tx, ...parsed, from: tx.from.toLowerCase()};
        })));

const isContract = address => retry(() => ethers.provider.getCode(address), { retries: 3 }).then(r => r !== '0x');

const filterBy = async (map, predicate) => Promise.map(
    Object.entries(map),
    async ([key, value]) => ([key, value, await predicate([key, value])]),
    { concurrency })
    .then(r => r.filter(([, , result]) => result))
    .reduce(toMap, {});

async function fetchBalances() {
  const transfers = await pastEvents(xHDX, 'Transfer');
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

async function loadReceipts(txs) {
  const bar = new ProgressBar('loading receipts [:bar] :rate/txs :percent :etas', { total: txs.length });
  return await Promise.map(txs, async tx => {
    const receipt = await retry(() => ethers.provider.getTransactionReceipt(tx.hash), { retries: 3 });
    bar.tick();
    return { ...tx, receipt };
  }, { concurrency });
}

async function main() {
  console.log('current block', (await ethers.provider.getBlock('latest')).number);
  console.log('fetching transactions from exchange 2');
  const transactions2 = await fetchTransactions(exchangeAddress);
  console.log('fetching transactions from exchange 1');
  const transactions1 = await fetchTransactions(exchange1Address);
  console.log('fetching transactions from pool');
  const transactionsPool = await fetchTransactions(poolAddress);
  const transactions = [...transactions1, ...transactions2, ...transactionsPool];
  console.log('transactions fetched', transactions.length);
  let buys = transactions.filter(({args}) => args && args.tokenOut && args.tokenOut.toLowerCase() === tokenAddress.toLowerCase());
  console.log('fetched buys', buys.length);
  buys = await loadReceipts(buys);
  console.log('failed buys', buys.filter(({receipt}) => !receipt.status).length);
  buys = buys.map(tx => {
    const gasCost = tx.gasPrice.mul(tx.receipt.gasUsed);
    const gasCostHdx = ethToHdx(gasCost);
    const logs = tx.receipt.logs.map(log => {
      try {
        return {...log, ...xHDX.interface.parseLog(log)}
      } catch (e) {
        return log;
      }
    });
    return {...tx, gasCost, gasCostHdx, logs }
  });
  console.log('fetching balances');
  const balances = await fetchBalances();
  console.log('fetched balances', Object.keys(balances).length);
  const buyers = Object.entries(groupBy(buys, 'from')).map(([address, txs]) => {
    const buys = txs.length;
    const failed = txs.filter(({receipt}) => !receipt.status).length;
    const gasCost = txs.reduce((a, { gasCost }) => a.add(gasCost), bn(0));
    const gasCostHdx = ethToHdx(gasCost);
    const balance = balances[address] || bn(0);
    return [address, { balance, buys, failed, gasCost, gasCostHdx, txs }];
  }).reduce(toMap, {});
  console.log('buyers', Object.keys(buyers).length);
  const holders = Object.entries(balances)
      .filter(([, balance]) => balance.gt(0))
      .reduce(toMap, {});
  console.log('holders', Object.keys(holders).length);
  const unaccountedHolders = diff(holders, buyers);
  console.log('holders without buy', unaccountedHolders.length);
  const exitedBuyers = diff(buyers, holders);
  console.log('buyers with zero balance', exitedBuyers.length);
  const onlyFailed = await filterBy(buyers, async ([address, {buys, failed}]) => buys === failed && !(await isContract(address)));
  console.log('buyers with only failed transactions', Object.keys(onlyFailed).length);
  const contracts = await filterBy(holders, ([address]) => isContract(address));
  console.log('contract holders', Object.keys(contracts).length);
  console.log(Object.entries(contracts).map(([k, balance]) => ([k, formatHdx(balance)])).reduce(toMap, {}));
  console.log('value locked', formatHdx(Object.values(contracts).reduce((a, b) => a.add(b), bn(0))));

  const eligible = [holders, onlyFailed].map(Object.keys).flat()
      .filter(address => !excluded.includes(address))
      .map(address => ([address, { balance: holders[address] || bn(0), gasCostHdx: bn(0), gasCost: bn(0), txs: [], ...(buyers[address] || {})}]))
      .reduce(toMap, {});
  console.log('eligible to claim', Object.keys(eligible).length)
  console.log('total bought xHDX to be claimed', formatHdx(Object.values(eligible).reduce((a, { balance }) => a.add(balance), bn(0))));
  const totalGasCost = Object.values(eligible).reduce((a, { gasCost }) => a.add(gasCost), bn(0));
  console.log('gas refunded', utils.formatEther(totalGasCost), 'ETH');
  console.log('in xHDX', formatHdx(ethToHdx(totalGasCost)));
  const claimsDb = Object.entries(eligible).map(([address, { balance, gasCostHdx, txs }]) => ([address, {
    totalClaim: formatHdx(balance.add(gasCostHdx)),
    bought: formatHdx(balance),
    gasRefund: formatHdx(gasCostHdx),
    refundedTxs: txs.map(tx => tx.hash)
  }])).reduce(toMap, {});
  console.log('exporting json');
  fs.writeFileSync('claims.json', JSON.stringify(claimsDb, null, 2));
  console.log('exporting hashed jsons');
  let hashed = Object.entries(claimsDb)
      .map(([address,data]) => ({hash: String(address[2]), data: [address, data]}));
  hashed = Object.entries(groupBy(hashed, 'hash'))
      .map(([hash, claims]) => ([hash, claims.map(c => c.data).reduce(toMap, {})]))
      .reduce(toMap, {});
  Object.entries(hashed).forEach(([hash, claims]) => fs.writeFileSync(`claims-${hash}.json`, JSON.stringify(claims, null, 2)));
  console.log('exporting csv');
  const rows = Object.entries(claimsDb).map(([address, data]) => ({ address, ...data, refundedTxs: data.refundedTxs.length }));
  const claimsCsv = json2csv.parse(rows);
  fs.writeFileSync('claims.csv', claimsCsv);
  console.log('exporting rs');
  const vec = Object.entries(eligible).reduce((str, [address, { balance, gasCostHdx }]) => {
    str += `    ("${address}", ${balance.add(gasCostHdx).toString()}),\n`;
    return str;
  }, '');
  fs.writeFileSync('claims_data.rs', `use lazy_static;
use sp_std::vec;
lazy_static::lazy_static! {
pub static ref CLAIMS_DATA: vec::Vec<(&'static str, u128)> = vec![
${vec}];
}`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
