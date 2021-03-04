const { ethers } = require('hardhat');
const { utils } = ethers;
const { assert } = require("chai");

const { filterBy, groupBy, diff, toMap, mapValues, bn, sumValues } = require('./lib/utils');
const exportClaims = require('./lib/export');
const Chunks = require('./lib/chunks');

const FROM_BLOCK = 11750733;
const TO_BLOCK = 11836883; // pause block
const ethPrice = 1763.9025;
const hdxPrice = 0.080590606687;
const governanceResolution = '🍩';

const excluded = [
  '0xC2C5A77d9f434F424Df3d39de9e90d95A0Df5Aca'.toLowerCase(), // treasury
];

const CONTRACTS = {
  xhdx: '0x6FCb6408499a7c0f242E32D77EB51fFa1dD28a7E'.toLowerCase(),
  balancer_proxy_2: '0x3E66B66Fd1d0b02fDa6C811Da9E0547970DB2f21'.toLowerCase(),
  balancer_proxy_1: '0x6317C5e82A06E1d8bf200d21F4510Ac2c038AC81'.toLowerCase(),
  balancer_pool: '0xF014fC5d0F02C19D617a30a745Ab86A8cA32C92F'.toLowerCase(),
};

const xHDX = new ethers.Contract(CONTRACTS.xhdx, require('./abi/xhdx.json')).connect(ethers.provider);
const chunks = new Chunks(FROM_BLOCK, TO_BLOCK);

async function generateClaims() {
  console.log('generating claims for', governanceResolution);
  const totalSupply = await xHDX.totalSupply();
  console.log('xHDX total supply', formatHdx(totalSupply));

  console.log('fetching balances');
  const balances = await chunks.fetchBalances(xHDX);
  console.log(Object.keys(balances).length, 'balances fetched');
  assert.equal(sumValues(balances).toString(), totalSupply.toString());

  console.log('fetching buys');
  const buys = await fetchBuys();

  const buyers = Object.entries(groupBy(buys, 'from'))
    .map(([address, txs]) => {
      const buys = txs.length;
      const failed = txs.filter(({ receipt }) => !receipt.status).length;
      const gasCost = txs.reduce((a, { gasCost }) => a.add(gasCost), bn(0));
      const gasCostHdx = ethToHdx(gasCost);
      const balance = balances[address];
      return [address, { balance, buys, failed, gasCost, gasCostHdx, txs }];
    })
    .reduce(toMap, {});
  console.log(Object.keys(buyers).length, 'buyers');

  const holders = Object.entries(balances)
    .filter(([, balance]) => balance.gt(0))
    .reduce(toMap, {});
  console.log(Object.keys(holders).length, 'holders');

  const unaccountedHolders = diff(holders, buyers);
  console.log(unaccountedHolders.length, 'holders without any buy');

  const exitedBuyers = diff(buyers, holders);
  console.log(exitedBuyers.length, 'buyers without balance');

  const onlyFailed = await filterBy(
    buyers,
    async ([address, { buys, failed }]) => buys === failed && !(await chunks.isContract(address)),
  );
  console.log(Object.keys(onlyFailed).length, 'buyers with failed transactions only');

  const contracts = await filterBy(holders, ([address]) => chunks.isContract(address));
  console.log(Object.keys(contracts).length, 'contract holders');
  console.log('xHDX locked in contracts', formatHdx(sumValues(contracts)));

  const governanceOptions = {
    '🎂': [buyers],
    '🍩': [holders, onlyFailed],
    '🍪': [holders]
  };

  const eligibleAddresses = governanceOptions[governanceResolution]
    .map(Object.keys)
    .flat()
    .filter(address => !excluded.includes(address));
  console.log(eligibleAddresses.length, 'addresses eligible for claim');

  const claims = eligibleAddresses
    .map(address => [
      address,
      {
        gasCostHdx: bn(0),
        gasCost: bn(0),
        txs: [],
        ...(buyers[address] || {}),
        balance: balances[address] || bn(0),
      },
    ])
    .reduce(toMap, {});
  console.log('with', formatHdx(sumValues(claims, c => c.balance)), 'xHDX bought');
  const totalGasCost = sumValues(claims, c => c.gasCost);
  console.log('and', utils.formatEther(totalGasCost), 'ETH gas refunded');
  console.log('as', formatHdx(ethToHdx(totalGasCost)), 'xHDX');

  exportClaims(formatClaims(claims));
}

/**
 * aggregates buy transactions sent to balancer exchanges and pool directly,
 * then augments it with transaction receipts and calculates gas cost in xHDX
 *
 * @returns buy transactions
 */
const fetchBuys = async () => {
  console.log('fetching transactions from balancer exchange 2');
  const transactions2 = await chunks.fetchTransactions(
    new ethers.Contract(CONTRACTS.balancer_proxy_2, require('./abi/balancer-exchange.json')),
  );
  console.log('fetching transactions from balancer exchange 1');
  const transactions1 = await chunks.fetchTransactions(
    new ethers.Contract(CONTRACTS.balancer_proxy_1, require('./abi/balancer-exchange1.json')),
  );
  console.log('fetching transactions from balancer pool');
  const transactionsPool = await chunks.fetchTransactions(
    new ethers.Contract(CONTRACTS.balancer_pool.toLowerCase(), require('./abi/pool.json')),
  );
  const transactions = [...transactions1, ...transactions2, ...transactionsPool];
  console.log('transactions fetched', transactions.length);
  const buyTransactions = transactions.filter(
    ({ args }) => args && args.tokenOut && args.tokenOut.toLowerCase() === xHDX.address.toLowerCase(),
  );
  console.log('total number of buy transactions', buyTransactions.length);
  const withReceipts = await chunks.loadReceipts(buyTransactions);
  console.log('failed buy transactions', withReceipts.filter(({ receipt }) => !receipt.status).length);
  return withReceipts.map(tx => {
    const gasCost = tx.gasPrice.mul(tx.receipt.gasUsed);
    const gasCostHdx = ethToHdx(gasCost);
    return { ...tx, gasCost, gasCostHdx };
  });
};

const formatHdx = hdx => utils.formatUnits(hdx, 12);
const ethHdx = utils.parseEther(String(ethPrice / hdxPrice));
const ethToHdx = eth => eth.mul(ethHdx).div(bn(10).pow(24));
const formatClaims = claims =>
  mapValues(claims, ([address, { balance, gasCostHdx, txs }]) => {
    const claim = balance.add(gasCostHdx);
    return [
      address,
      {
        totalClaim: formatHdx(claim),
        bought: formatHdx(balance),
        gasRefund: formatHdx(gasCostHdx),
        refundedTxs: txs.map(tx => tx.hash),
        totalClaimRaw: claim.toString(),
      },
    ];
  });

generateClaims()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
