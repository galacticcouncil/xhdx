const fetch = require('node-fetch');
const moment = require('moment');
const { web3 } = require("hardhat");

async function timeToBlockEtherscan(time) {
  const timestamp = Number(new Date(time)) / 1000;
  return fetch(`https://api.etherscan.io/api?module=block&action=getblocknobytime&timestamp=${timestamp}&closest=after`).then(r => r.json());
}

async function timeToBlock(time, blockTime = 13.1) {
  const now =  moment().unix();
  console.log(moment(), moment(time))
  const timestamp = moment(time).unix();
  console.log(timestamp);
  const blocks = Math.ceil((timestamp - now) / blockTime);
  const { number } = await web3.eth.getBlock('latest');
  return number + blocks;
}

async function main() {
  console.log('start', await timeToBlock('2021-02-08T16:00:00+00:00'));
  console.log('end', await timeToBlock('2021-02-11T16:00:00+00:00'));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
