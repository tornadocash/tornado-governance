require('dotenv').config()
const HDWalletProvider = require('truffle-hdwallet-provider')
const utils = require('web3-utils')
const { PRIVATE_KEY, INFURA_TOKEN } = process.env

module.exports = {
  networks: {
    // development: {
    //   // host: '127.0.0.1', // Localhost (default: none)
    //   // port: 8545, // Standard Ethereum port (default: none)
    //   network_id: '*', // Any network (default: none)
    //   accounts: 20,
    // },
    mainnet: {
      provider: () => new HDWalletProvider(PRIVATE_KEY, `https://mainnet.infura.io/v3/${INFURA_TOKEN}`),
      network_id: 1,
      gas: 6000000,
      gasPrice: utils.toWei('100', 'gwei'),
      // confirmations: 0,
      // timeoutBlocks: 200,
      skipDryRun: true,
    },
    kovan: {
      provider: () => new HDWalletProvider(PRIVATE_KEY, `https://kovan.infura.io/v3/${INFURA_TOKEN}`),
      network_id: 42,
      gas: 6000000,
      gasPrice: utils.toWei('1', 'gwei'),
      // confirmations: 0,
      // timeoutBlocks: 200,
      skipDryRun: true,
    },
    coverage: {
      host: 'localhost',
      network_id: '*',
      port: 8554, // <-- If you change this, also set the port option in .solcover.js.
      gas: 0xfffffffffff, // <-- Use this high gas value
      gasPrice: 0x01, // <-- Use this low gas price
    },
  },

  mocha: {
    // timeout: 100000
  },

  compilers: {
    solc: {
      version: '0.6.12',
      docker: false,
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
        // evmVersion: "byzantium"
      },
    },
  },
}
