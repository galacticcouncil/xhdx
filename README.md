# xHDX Tokens

Smart contracts and supporting scripts for HydraDX ERC20 token used in LBP

## Setup

Install node.js dependencies:

```
npm install
```

### Configuration

Most scripts require some [environment variables](.env.example) set. Primarily 
access to the Ethereum RPC node is required.

## Tests

Run token unit tests locally:

```
npm test
```

## Generate claims data

This script will fetch balances and refunded gas fees from Ethereum network and exports them for HydraDX claims process.

The [environment variables](.env.example) `ETHEREUM` and `ETHERSCAN_API_KEY` have to be set.

```
npm run claims
```

The claimable balances will be exported into `json`, `csv` and `rs` files.
