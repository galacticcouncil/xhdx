const abi = require("./abi/lbp.json")
const poolabi = require("./abi/pool.json");
const { ethers, provider } = require("hardhat");

const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

async function info(address) {
  const lbp = new ethers.Contract(address, abi, ethers.provider);
  const poolAddress = await lbp.bPool();
  const pool = new ethers.Contract(poolAddress, poolabi, ethers.provider);
  return {
    address,
    gradualUpdate: await lbp.gradualUpdate(),
    poolAddress,
    rights: await lbp.rights(),
    normalizedWeight: ethers.utils.formatEther(await pool.getNormalizedWeight(usdcAddress)),
    denormalizedWeight: ethers.utils.formatEther(await pool.getDenormalizedWeight(usdcAddress)),
    totalDenormalizedWeight: ethers.utils.formatEther(await pool.getTotalDenormalizedWeight())
  }
}

async function main() {
  // console.log(await info('0x91ACcD0BC2aAbAB1d1b297EB64C4774bC4e7bcCE'));
  console.log(await info('0x025aab1e585cc49257a97b065e6d1976ce043ba7'));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
