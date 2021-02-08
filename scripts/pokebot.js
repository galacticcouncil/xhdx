const { ethers } = require("hardhat");
const lAbi = require("./abi/lbp.json")
const moment = require('moment');
const fetch = require('node-fetch');

const SPEED = 'ProposeGasPrice';
// const SPEED = 'SafeGasPrice';
const lbpAddress = '0x6428006d00a224116c3e8a4fca72ac9bb7d42327';

let poking = false;
const gasPriceHistory = [];
let lbp = null;

const updateGasPrice = async () =>
    fetch('https://api.etherscan.io/api?module=gastracker&action=gasoracle')
      .then(res => res.json())
      .then(({ result }) => {
        const gas = result[SPEED];
        if (gas) {
          gasPriceHistory.push({...result, time: new Date()});
          return result;
        }
      });

const currentGasPrice = () => Number(gasPriceHistory[gasPriceHistory.length - 1][SPEED]);
const lastBlock = () => Number(gasPriceHistory[gasPriceHistory.length - 1].LastBlock);

async function poke() {
  const { blockNumber } = (await ethers.provider.getLogs({
    fromBlock: lastBlock() - 800,
    toBlock: 'latest',
    address: lbpAddress,
    topics: ['0xe211b87500000000000000000000000000000000000000000000000000000000']
  })).pop();
  const block = await ethers.provider.getBlock(blockNumber);
  const fromLast = moment.duration(moment().diff(moment.unix(block.timestamp)));
  console.log('current gas price', currentGasPrice());
  console.log('last poke', fromLast.humanize());
  if (moment.duration(40, 'minutes') < fromLast && !poking) {
    poking = true;
    try {
      const gasPrice = currentGasPrice() * 1000000000;
      const tx = await lbp.pokeWeights({ gasPrice });
      console.log('poking', tx.hash);
      const receipt = await tx.wait();
      console.log('poked !');
    } catch (e) {
      console.log('failed', e);
    }
    poking = false;
  }
}

async function main() {
  const [signer] = await ethers.getSigners();
  lbp = new ethers.Contract(lbpAddress, lAbi, signer);
  await updateGasPrice();
  console.log('current block', lastBlock());
  await poke();
  setInterval(updateGasPrice, 30000);
  setInterval(poke, 90000);
}

main()
    .then(() => console.log('ready'))
    .catch(error => {
      console.error(error);
    });
