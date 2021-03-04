require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-etherscan');
require('@nomiclabs/hardhat-web3');
require('dotenv').config();

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task('accounts', 'Prints the list of accounts', async () => {
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
const networks = (() => {
  const config = {};
  if (process.env.KOVAN) {
    config.kovan = {
      url: process.env.KOVAN,
      accounts: [],
    };
    if (process.env.KOVAN_ACCOUNT) {
      config.accounts = [process.env.KOVAN_ACCOUNT];
    }
  }

  if (process.env.ETHEREUM) {
    config.mainnet = {
      url: process.env.ETHEREUM,
      accounts: [],
    };
    if (process.env.BOT_KEY) {
      config.accounts = [process.env.BOT_KEY];
    }
  }

  return config;
})();

module.exports = {
  solidity: '0.5.17',
  networks,
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};
