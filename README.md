# Tornado governance

## Description
This repository holds all the tornado.cash governance upgrades and original governance contracts.

## Documentation
All high-level documentation can be find [here](https://docs.tornado.cash/general/governance).

## Code architecture
Tornado governance infrastructure consists of two types of repository:
1. **Governance repository** (this one) - contains the original governance contracts and parts of proposals that upgrade governance itself via loopback proxy. So here you can compile the actual version of the governance contract.
2. **Proposal repository** - a separate repository for each governance proposal. It contains the full codebase of a proposal.

### Loopback proxy
[Loopback proxy](https://github.com/tornadocash/tornado-governance/blob/master/contracts/v1/LoopbackProxy.sol) is a special type of proxy contract that is used to add the ability to upgrade the proxy itself. This way governance proposals can upgrade governance implementation.

### Proposal creation manual
To create your custom governance proposal you need to:
1. Create a proposal repository:
  - a proposal is executed from the governance contract using delegatecall of __executeProposal()__ method
  - as a proposal is executed using delegatecall, it should not store any storage variables - use constants and immutable variables instead
2. If your proposal is upgrading governance itself, you need to create a pull request to the governance repository. PR should add folder with governance contract upgrade (separate folder in contracts folder - for [example](https://github.com/tornadocash/tornado-governance/pull/6/commits/5f36d5744a9f279a58e9ba1f0e0cd9d493af41c7)).
3. Deploy proposal. The proposal must be smart contracts with verified code.
4. Go to Tornado governance [UI](https://tornadocash.eth.limo/governance) to start the proposal voting process.


## Tests

```bash
git clone https://github.com/tornadocash/tornado-governance.git
yarn
cp .env.example .env # you must enter your details into .env
yarn test
```

## Coverage