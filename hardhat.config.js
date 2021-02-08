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

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: "0.5.17",
  networks: {
    hardhat: {
      forking: {
        url: process.env.ETHEREUM,
        blockNumber: 11641253
      }
    },
    kovan: {
      url: process.env.KOVAN,
      accounts: [process.env.KOVAN_ACCOUNT]
    },
    mainnet: {
      url: process.env.ETHEREUM,
      accounts: [process.env.BOT_KEY]
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  }
};

