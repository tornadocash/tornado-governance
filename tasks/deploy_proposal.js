require('dotenv').config()
const { task } = require('hardhat/config')
const { BigNumber } = require('@ethersproject/bignumber')

task('deploy_proposal', 'deploy the lottery/vault upgrade proposal')
  .addParam('votingPeriod', 'the desired new voting period')
  .setAction(async (taskArgs, hre) => {
    const GasVaultFactory = await hre.ethers.getContractFactory(
      'contracts/basefee/GasCompensationVault.sol:GasCompensationVault',
    )
    const GasVaultContract = await GasVaultFactory.deploy()

    await GasVaultContract.deployTransaction.wait(5)

    await hre.run('verify:verify', {
      address: GasVaultContract.address,
    })

    const ProposalFactory = await hre.ethers.getContractFactory('VaultAndGasProposal')
    const ProposalContract = await ProposalFactory.deploy(
      GasVaultContract.address,
      BigNumber.from(taskArgs.votingPeriod),
    )

    await ProposalContract.deployTransaction.wait(5)

    await hre.run('verify:verify', {
      address: ProposalContract.address,
      constructorArguments: [GasVaultContract.address, BigNumber.from(taskArgs.votingPeriod)],
    })

    console.log('Successfully deployed proposal contract at: ', ProposalContract.address)
  })
