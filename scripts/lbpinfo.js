const abi = require("./abi/lbp.json")
const poolabi = require("./abi/pool.json");
const { ethers } = require("hardhat");

const daiAddress = '0x1528F3FCc26d13F7079325Fb78D9442607781c8C';
const stablecoin = 'DAI';

async function events(contract, topic) {
  let logs = await ethers.provider.getLogs({
    fromBlock: 0,
    toBlock: 'latest',
    address: contract.address,
    topics: [contract.interface.getEventTopic(topic)]
  });
  return logs.map(event => ({ ...event, ...contract.interface.parseLog(event) }))
}

const lAbi = [
  {
    "inputs": [],
    "name": "bPool",
    "outputs": [
      {
        "internalType": "contract IBPool",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

const pAbi = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "caller",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "tokenIn",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "tokenOut",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "tokenAmountIn",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "tokenAmountOut",
        "type": "uint256"
      }
    ],
    "name": "LOG_SWAP",
    "type": "event"
  }

]

async function info(address) {
  const lbp = new ethers.Contract(address, lAbi, ethers.provider);
  const poolAddress = await lbp.bPool();
  const pool = new ethers.Contract(poolAddress, pAbi, ethers.provider);
  lbp.on({topics: ['0xe211b87500000000000000000000000000000000000000000000000000000000'] }, e => {
    console.log('poked!', e)
  });
  pool.on('LOG_SWAP', (id, tokenIn, tokenOut, tokenAmountIn, tokenAmountOut) => {
    const [tokenInSym, tokenOutSym] = [tokenIn, tokenOut]
        .map(token => token.toLowerCase() === daiAddress.toLowerCase() ? 'DAI' : 'xHDX');
    if (tokenIn.toLowerCase() === daiAddress.toLowerCase()) {
      [tokenAmountIn, tokenAmountOut] = [
          ethers.utils.formatUnits(tokenAmountIn),
          ethers.utils.formatUnits(tokenAmountOut, 12)
      ];
    } else {
      [tokenAmountIn, tokenAmountOut] = [
        ethers.utils.formatUnits(tokenAmountOut, 12),
        ethers.utils.formatUnits(tokenAmountIn)
      ];
    }
    const swap = {
      userAddress: { id },
      tokenIn,
      tokenOut,
      tokenInSym,
      tokenOutSym,
      tokenAmountIn,
      tokenAmountOut
    }
    console.log('swap!', swap)
  });
  return {
    address,
    poolAddress,
  }
}

async function main() {
  // console.log(await info('0x91ACcD0BC2aAbAB1d1b297EB64C4774bC4e7bcCE'));
  console.log(await info('0x9907e1519335ae2d3c743350828d234d929a5362'));
}

main()
    .then(() => console.log('done'))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
