require('dotenv').config()
const { task } = require('hardhat/config')

task('propose_proposal', 'propose proposal that uses factory')
  .addParam('proposalAddress', 'address of proposal')
  .setAction(async (taskArgs, hre) => {
    const proposalName = 'lottery-and-vault-proposal'
    const signerArray = hre.ethers.getSigners()

    const GovernanceContract = await hre.ethers.getContractAt(
      'Governance',
      '0x5efda50f22d34F262c29268506C5Fa42cB56A1Ce',
    )
    await GovernanceContract.propose(taskArgs.proposalAddress, proposalName)

    const id = await GovernanceContract.latestProposalIds(signerArray[0].address)
    const state = await GovernanceContract.state(id)

    console.log('Proposal with name: ', proposalName, ' proposed with id: ', id, ', has state: ', state)
  })
