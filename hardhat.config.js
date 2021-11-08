require('dotenv').config()
require('@nomiclabs/hardhat-ethers')
require('@nomiclabs/hardhat-etherscan')
require('@nomiclabs/hardhat-waffle')
require('hardhat-spdx-license-identifier')
require('hardhat-storage-layout')
require('hardhat-log-remover')
require('hardhat-contract-sizer')

require('./tasks/deploy_proposal.js')
/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    compilers: [
      {
        version: '0.6.12',
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000,
          },
        },
      },
      {
        version: '0.8.7',
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000,
          },
        },
      },
      {
        version: '0.7.6',
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      forking: {
        url: `https://mainnet.infura.io/v3/${process.env.mainnet_rpc_key}`,
        blockNumber: 13042331,
      },
      initialBaseFeePerGas: 5,
    },
    localhost: {
      url: 'http://localhost:8545',
      timeout: 120000,
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.mainnet_rpc_key}`,
      accounts: ['900e9f0e8ce24c022026649c48a059fb6ffa0a2523811d797b47d789bf106def'], // random pk off keys.lol
      timeout: 2147483647,
    },
  },
  mocha: { timeout: 9999999999 },
  spdxLicenseIdentifier: {
    overwrite: true,
    runOnCompile: true,
  },
  etherscan: {
    apiKey: `${process.env.etherscan_api_key}`,
  },
}
