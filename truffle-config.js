module.exports = {
  networks: {
    // development: {
    //   // host: '127.0.0.1', // Localhost (default: none)
    //   // port: 8545, // Standard Ethereum port (default: none)
    //   network_id: '*', // Any network (default: none)
    //   accounts: 20,
    // },
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
