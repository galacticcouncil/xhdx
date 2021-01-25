const hre = require("hardhat");

async function main() {
  const Token = await hre.ethers.getContractFactory("XHDX");
  const token = await Token.deploy();

  await token.deployed();

  console.log("Greeter deployed to:", greeter.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
