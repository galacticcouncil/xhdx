# xHDX Tokens

Smart contracts and supporting scripts for HydraDX ERC20 token used in LBP.

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

This script is used for getting balances and refunded gas fees from Ethereum network
to be imported to HydraDX.

The [environment variables](.env.example) `ETHEREUM` and `ETHERSCAN_API_KEY` have to be set.

```
npm run claims
```

Claimable balance will be exported into `json`, `csv` and `rs` files.
