require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-web3");
require('dotenv').config();

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

const infuraKey = process.env.INFURA_KEY || '84842078b09946638c03157f83405213';

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: "0.5.17",
  networks: {
    hardhat: {
    },
    kovan: {
      url: process.env.KOVAN || `https://kovan.infura.io/v3/${infuraKey}`,
      accounts: process.env.KOVAN_ACCOUNT ? [process.env.KOVAN_ACCOUNT] : []
    },
    mainnet: {
      url: process.env.ETHEREUM || `https://mainnet.infura.io/v3/${infuraKey}`,
      accounts: process.env.BOT_KEY ? [process.env.BOT_KEY] : []
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  }
};

