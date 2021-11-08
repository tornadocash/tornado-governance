require('dotenv').config()
const { ethers } = require('hardhat')

async function propose(proposalArgs) {
  const proposer = proposalArgs[0]
  const ProposalContract = proposalArgs[1]

  let GovernanceContract = await ethers.getContractAt(
    'contracts/v1/Governance.sol:Governance',
    '0x5efda50f22d34F262c29268506C5Fa42cB56A1Ce',
  )
  GovernanceContract = await GovernanceContract.connect(proposer)

  const response = await GovernanceContract.propose(ProposalContract.address, proposalArgs[2])

  const id = await GovernanceContract.latestProposalIds(proposer.address)
  const state = await GovernanceContract.state(id)

  return [response, id, state]
}
module.exports.propose = propose
