const { ethers } = require('hardhat')
const { expect } = require('chai')
const { BigNumber } = require('@ethersproject/bignumber')
const { PermitSigner } = require('../../scripts/v1/Permit.js')
const tornConfig = require('torn-token')
const config = require('../../config')

const ProposalState = {
  Pending: 0,
  Active: 1,
  Defeated: 2,
  Timelocked: 3,
  AwaitingExecution: 4,
  Executed: 5,
  Expired: 6,
}

const duration = {
  seconds: function (val) {
    return val
  },
  minutes: function (val) {
    return val * this.seconds(60)
  },
  hours: function (val) {
    return val * this.minutes(60)
  },
  days: function (val) {
    return val * this.hours(24)
  },
  weeks: function (val) {
    return val * this.days(7)
  },
  years: function (val) {
    return val * this.days(365)
  },
}

describe('V1 governance tests', () => {
  /// NETWORK && DOMAIN
  let chainId
  let domain

  //// SIGNERS
  let signerArray
  let proposer // = accounts[3] #TODO: set this
  let secondProposer // = accounts[8] #TODO: set this
  let proxy

  /// CONTRACTS
  let governance, dummy
  let snapshotId
  let timestamp = 1577836800 // 01/01/2020 00:00
  let torn

  /// GOVERNANCE VARS
  let votingDelay
  let votingPeriod
  let executionExpiration
  let executionDelay
  let extendTime
  let proposalStartTime
  let proposalEndTime
  let lockingPeriod

  /// ON-CHAIN
  let balanceProposer
  const cap = BigNumber.from(tornConfig.torn.cap)
  const tenThousandTorn = BigNumber.from(10).pow(BigNumber.from(18)).mul(BigNumber.from(10000))
  const miningPrivateKey = '0xc87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3'
  let miningPublicKey = '0x' + ethers.utils.computeAddress(Buffer.from(miningPrivateKey.slice(2), 'hex'))

  before(async function () {
    signerArray = await ethers.getSigners()
    proposer = signerArray[3]
    secondProposer = signerArray[8]

    chainId = (await signerArray[0].provider.getNetwork()).chainId

    governance = await ethers.getContractFactory('MockGovernance')
    governance = await governance.deploy()

    torn = await ethers.getContractFactory('TORNMock2')

    miningPublicKey = miningPublicKey.slice(2)

    proxy = await ethers.getContractFactory('MockProxy')

    proxy = await proxy.deploy(governance.address, [])

    governance = await ethers.getContractAt('MockGovernance', proxy.address)

    torn = await torn.deploy(proxy.address, duration.days(30), [
      { to: miningPublicKey, amount: cap.toString() },
    ])

    await governance.initialize(torn.address + '000000000000000000000000')

    expect(await governance.torn()).to.equal(torn.address)

    dummy = await ethers.getContractFactory('Dummy')
    dummy = await dummy.deploy()

    balanceProposer = cap.div(BigNumber.from(4))

    await ethers.provider.send('hardhat_impersonateAccount', [miningPublicKey])
    miningPublicKey = await ethers.getSigner(miningPublicKey)

    await signerArray[0].sendTransaction({ value: ethers.utils.parseEther('3'), to: miningPublicKey.address })

    torn = await torn.connect(miningPublicKey)

    await torn.transfer(secondProposer.address, balanceProposer.div(BigNumber.from(2)))

    await torn.transfer(proposer.address, balanceProposer)

    await torn.setChainId(chainId)
    await governance.setTimestamp(timestamp)

    votingDelay = await governance.VOTING_DELAY()
    votingPeriod = await governance.VOTING_PERIOD()
    executionExpiration = await governance.EXECUTION_EXPIRATION()
    executionDelay = await governance.EXECUTION_DELAY()
    extendTime = await governance.VOTE_EXTEND_TIME()

    proposalStartTime = BigNumber.from(timestamp).add(votingDelay)
    proposalEndTime = votingPeriod.add(BigNumber.from(proposalStartTime))

    lockingPeriod = Number(extendTime) + Number(executionExpiration) + Number(executionDelay)

    domain = {
      name: await torn.name(),
      version: '1',
      chainId,
      verifyingContract: torn.address,
    }

    snapshotId = await ethers.provider.send('evm_snapshot', [])
  })

  beforeEach(async function () {
    torn = await torn.connect(proposer)
    await torn.approve(governance.address, balanceProposer)

    governance = await governance.connect(proposer)
    await governance.lockWithApproval(balanceProposer)

    const balance = await governance.lockedBalance(proposer.address)
    expect(balance).to.equal(balanceProposer)
  })

  describe('#contructor', () => {
    it('should work', async () => {
      const proposalCount = await governance.proposalCount()
      expect(proposalCount).to.equal(BigNumber.from(0))

      const p = await governance.proposals(0)

      expect(p.proposer).to.equal(governance.address)
      expect(p.target).to.equal('0x000000000000000000000000000000000000dEaD')
      expect(p.endTime).to.equal(BigNumber.from(0))
      expect(p.forVotes).to.equal(BigNumber.from(0))
      expect(p.againstVotes).to.equal(BigNumber.from(0))
      expect(p.executed).to.equal(true)
      expect(p.extended).to.equal(false)
    })
  })

  describe('#propose', () => {
    it('should work', async () => {
      const response = await governance.propose(dummy.address, 'dummy')
      const receipt = await response.wait()
      const logs = receipt.events

      const id = await governance.latestProposalIds(proposer.address)
      const proposalCount = await governance.proposalCount()

      expect(proposalCount).to.equal(1)

      const proposal = await governance.proposals(id)

      expect(proposal.proposer).to.equal(proposer.address)
      expect(proposal.startTime).to.equal(proposalStartTime)
      expect(proposal.endTime).to.equal(proposalEndTime)
      expect(proposal.forVotes).to.equal(0)
      expect(proposal.againstVotes).to.equal(0)
      expect(proposal.executed).to.equal(false)

      // emit ProposalCreated(newProposal.id, msg.sender, target, startBlock, endBlock, description);
      expect(logs[0].event).to.equal('ProposalCreated')
      expect(logs[0].args.id).to.equal(id)
      expect(logs[0].args.proposer).to.equal(proposer.address)
      expect(logs[0].args.target).to.equal(dummy.address)
      expect(logs[0].args.description).to.equal('dummy')
      expect(logs[0].args.startTime).to.equal(proposalStartTime)
      expect(logs[0].args.endTime).to.equal(votingPeriod.add(BigNumber.from(proposalStartTime)))

      let state = await governance.state(id)
      expect(state).to.equal(ProposalState.Pending)
      await governance.setTimestamp(proposalEndTime)
      state = await governance.state(id)
      expect(state).to.equal(ProposalState.Active)

      const accountLock = await governance.canWithdrawAfter(proposer.address)

      expect(accountLock).to.equal(proposalEndTime.add(BigNumber.from(lockingPeriod)))
    })
    it('fails if target is not a contract', async () => {
      governance = await governance.connect(proposer)
      await expect(governance.propose(signerArray[9].address, 'dummy')).to.be.revertedWith('not a contract')
    })
    it('fails if proposer has already pending proposal', async () => {
      await governance.propose(dummy.address, 'dummy')
      await expect(governance.propose(dummy.address, 'dummy')).to.be.revertedWith(
        'Governance::propose: one live proposal per proposer, found an already active proposal',
      )
      await governance.setTimestamp(proposalEndTime)
      await expect(governance.propose(dummy.address, 'dummy')).to.be.revertedWith(
        'Governance::propose: one live proposal per proposer, found an already active proposal',
      )
    })
    it('fails if proposer does not have voting power', async function () {
      const voterBob = signerArray[5]
      const oneThousandTorn = ethers.utils.parseEther('1000')

      torn = await torn.connect(miningPublicKey)

      await torn.transfer(voterBob.address, oneThousandTorn)

      torn = await torn.connect(voterBob)

      await torn.approve(governance.address, oneThousandTorn)

      expect(await governance.torn()).to.equal(torn.address)

      governance = await governance.connect(voterBob)

      await governance.lockWithApproval(oneThousandTorn.sub(1))

      await expect(governance.propose(dummy.address, 'dummy')).to.be.revertedWith(
        'Governance::propose: proposer votes below proposal threshold',
      )
    })
  })

  describe('#castVote', () => {
    it('should work if support is true', async () => {
      await governance.propose(dummy.address, 'dummy')
      const votesCount = balanceProposer
      const id = await governance.latestProposalIds(proposer.address)
      await governance.setTimestamp(proposalEndTime)

      const state = await governance.state(id)
      expect(state).to.equal(ProposalState.Active)
      const response = await governance.castVote(id, true)
      const receipt = await response.wait()
      const logs = await receipt.events

      expect(logs[0].event).to.equal('Voted')
      expect(logs[0].args.voter).to.equal(proposer.address)
      expect(logs[0].args.proposalId).to.equal(id)
      expect(logs[0].args.support).to.equal(true)
      expect(logs[0].args.votes).to.equal(votesCount)

      await governance.getReceipt(id, proposer.address)

      const proposal = await governance.proposals(id)
      expect(proposal.forVotes).to.equal(votesCount)
      expect(proposal.againstVotes).to.equal(0)
    })
    it('should work if support is false', async () => {
      await governance.propose(dummy.address, 'dummy')

      const votesCount = balanceProposer
      const id = await governance.latestProposalIds(proposer.address)

      await governance.setTimestamp(proposalEndTime)

      const state = await governance.state(id)

      expect(state).to.equal(ProposalState.Active)

      const response = await governance.castVote(id, false)
      const receipt = await response.wait()
      const logs = await receipt.events

      expect(logs[0].event).to.equal('Voted')
      expect(logs[0].args.voter).to.equal(proposer.address)
      expect(logs[0].args.proposalId).to.equal(id)
      expect(logs[0].args.support).to.equal(false)
      expect(logs[0].args.votes).to.equal(votesCount)

      const proposal = await governance.proposals(id)

      expect(proposal.forVotes).to.equal(0)
      expect(proposal.againstVotes).to.equal(votesCount)
    })

    it('should be able to change the choice later if already voted before', async () => {
      await governance.propose(dummy.address, 'dummy')

      const votesCount = balanceProposer
      const id = await governance.latestProposalIds(proposer.address)

      await governance.setTimestamp(proposalEndTime)
      const state = await governance.state(id)

      expect(state).to.equal(ProposalState.Active)

      await governance.castVote(id, false)
      await governance.castVote(id, true)

      const response = await governance.castVote(id, false)
      const receipt = await response.wait()
      const logs = await receipt.events

      expect(logs[0].event).to.equal('Voted')
      expect(logs[0].args.voter).to.equal(proposer.address)
      expect(logs[0].args.proposalId).to.equal(id)
      expect(logs[0].args.support).to.equal(false)
      expect(logs[0].args.votes).to.equal(votesCount)

      const proposal = await governance.proposals(id)

      expect(proposal.forVotes).to.equal(0)
      expect(proposal.againstVotes).to.equal(votesCount)
    })

    it('should work if there are multiple voters', async () => {
      const voterBob = signerArray[5]
      const voterAlice = signerArray[7]
      const tenThousandTorn = ethers.utils.parseEther('10000')

      torn = await torn.connect(miningPublicKey)

      await torn.transfer(voterBob.address, tenThousandTorn)

      await torn.transfer(voterAlice.address, tenThousandTorn.mul(BigNumber.from(2)))

      torn = await torn.connect(voterBob)

      await torn.approve(governance.address, tenThousandTorn)

      torn = await torn.connect(voterAlice)

      await torn.approve(governance.address, tenThousandTorn.mul(BigNumber.from(2)))

      governance = await governance.connect(voterBob)
      await governance.lockWithApproval(tenThousandTorn)

      governance = await governance.connect(voterAlice)
      await governance.lockWithApproval(tenThousandTorn.mul(BigNumber.from(2)))

      governance = await governance.connect(proposer)
      await expect(governance.propose(dummy.address, 'dummy')).to.not.be.reverted

      const votesCount = balanceProposer
      const id = await governance.latestProposalIds(proposer.address)

      await governance.setTimestamp(proposalEndTime)

      const state = await governance.state(id)

      expect(state).to.equal(ProposalState.Active)

      await governance.castVote(id, false)

      governance = await governance.connect(voterBob)
      await governance.castVote(id, false)

      governance = await governance.connect(voterAlice)
      await governance.castVote(id, true)

      const proposal = await governance.proposals(id)
      expect(proposal.forVotes).to.equal(tenThousandTorn.mul(BigNumber.from(2)))
      expect(proposal.againstVotes).to.equal(votesCount.add(tenThousandTorn))
    })

    it('fails if voter does not have voting power', async () => {
      const voterBob = signerArray[5]

      governance = await governance.connect(proposer)
      await governance.propose(dummy.address, 'dummy')

      const id = await governance.latestProposalIds(proposer.address)
      await governance.setTimestamp(proposalEndTime)

      const state = await governance.state(id)
      expect(state).to.equal(ProposalState.Active)

      governance = await governance.connect(voterBob)

      await expect(governance.castVote(id, false)).to.be.revertedWith('Governance: balance is 0')
    })

    it('should be able to update number of votes count if the same decision is chosen after more tokens are locked', async () => {
      const voterBob = signerArray[5]

      const tenThousandTorn = ethers.utils.parseEther('10000')
      const fiveThousandTorn = tenThousandTorn.div(BigNumber.from(2))

      torn = await torn.connect(miningPublicKey)
      await torn.transfer(voterBob.address, tenThousandTorn)

      torn = await torn.connect(voterBob)
      await torn.approve(governance.address, tenThousandTorn)

      governance = await governance.connect(voterBob)
      await governance.lockWithApproval(fiveThousandTorn)

      governance = await governance.connect(proposer)
      await governance.propose(dummy.address, 'dummy')

      const votesCount = balanceProposer
      const id = await governance.latestProposalIds(proposer.address)

      await governance.setTimestamp(proposalEndTime)
      const state = await governance.state(id)

      expect(state).to.equal(ProposalState.Active)
      governance = await governance.connect(proposer)
      await governance.castVote(id, false)

      governance = await governance.connect(voterBob)
      await governance.castVote(id, false)

      let proposal = await governance.proposals(id)

      expect(proposal.forVotes).to.equal(BigNumber.from(0))
      expect(proposal.againstVotes).to.equal(votesCount.add(fiveThousandTorn))

      await governance.lockWithApproval(fiveThousandTorn)
      await governance.castVote(id, false)

      proposal = await governance.proposals(id)

      expect(proposal.forVotes).to.equal(BigNumber.from(0))
      expect(proposal.againstVotes).to.equal(votesCount.add(tenThousandTorn))
    })

    it('extends time if the vote changes the outcome during the CLOSING_PERIOD', async () => {
      const voterBob = signerArray[5]
      const voterAlice = signerArray[7]

      torn = await torn.connect(miningPublicKey)

      await torn.transfer(voterBob.address, tenThousandTorn)

      await torn.transfer(voterAlice.address, tenThousandTorn.mul(BigNumber.from(2)))

      torn = await torn.connect(voterBob)
      await torn.approve(governance.address, tenThousandTorn)

      torn = await torn.connect(voterAlice)
      await torn.approve(governance.address, tenThousandTorn.mul(BigNumber.from(2)))

      governance = await governance.connect(voterBob)
      await governance.lockWithApproval(tenThousandTorn)

      governance = await governance.connect(voterAlice)
      await governance.lockWithApproval(tenThousandTorn.mul(BigNumber.from(2)))

      governance = await governance.connect(proposer)
      await governance.propose(dummy.address, 'dummy')

      const id = await governance.latestProposalIds(proposer.address)

      await governance.setTimestamp(proposalStartTime.add(BigNumber.from(1)))

      const state = await governance.state(id)
      expect(state).to.equal(ProposalState.Active)

      governance = await governance.connect(voterBob)
      await governance.castVote(id, false)

      governance = await governance.connect(voterAlice)
      await governance.castVote(id, true)

      let MAX_EXTENDED_TIME = await governance.VOTE_EXTEND_TIME()
      let proposal = await governance.proposals(id)
      expect(proposal.endTime).to.equal(proposalEndTime)
      await governance.setTimestamp(proposalEndTime)

      governance = await governance.connect(proposer)
      await governance.castVote(id, false)

      proposal = await governance.proposals(id)

      expect(proposal.endTime).to.equal(proposalEndTime.add(MAX_EXTENDED_TIME))

      await governance.setTimestamp(proposalEndTime.add(BigNumber.from(duration.hours(5))))

      const stateAfter = await governance.state(id)

      expect(stateAfter).to.equal(ProposalState.Active)
    })

    it('locks tokens after vote', async () => {
      const voterAlice = signerArray[7]

      torn = await torn.connect(miningPublicKey)
      await torn.transfer(voterAlice.address, tenThousandTorn)

      torn = await torn.connect(voterAlice)
      await torn.approve(governance.address, tenThousandTorn)

      governance = await governance.connect(voterAlice)
      await governance.lockWithApproval(tenThousandTorn)

      governance = await governance.connect(proposer)
      await governance.propose(dummy.address, 'dummy')

      const id = await governance.latestProposalIds(proposer.address)
      await governance.setTimestamp(proposalStartTime.add(BigNumber.from(1)))

      const state = await governance.state(id)
      expect(state).to.equal(ProposalState.Active)

      const lockBefore = await governance.canWithdrawAfter(voterAlice.address)
      expect(lockBefore).to.equal(BigNumber.from(0))

      governance = await governance.connect(voterAlice)
      await governance.castVote(id, true)

      const lockAfter = await governance.canWithdrawAfter(voterAlice.address)
      expect(lockAfter).to.equal(proposalEndTime.add(BigNumber.from(lockingPeriod)))
    })

    it('does not reduce lock time', async () => {
      const voterAlice = signerArray[7]

      torn = await torn.connect(miningPublicKey)
      await torn.transfer(voterAlice.address, tenThousandTorn)

      torn = await torn.connect(voterAlice)
      await torn.approve(governance.address, tenThousandTorn)

      governance = await governance.connect(voterAlice)
      await governance.lockWithApproval(tenThousandTorn)

      torn = await torn.connect(secondProposer)
      await torn.approve(governance.address, balanceProposer.div(BigNumber.from(2)))

      governance = await governance.connect(secondProposer)
      await governance.lockWithApproval(balanceProposer.div(BigNumber.from(2)))

      governance = await governance.connect(proposer)
      await governance.propose(dummy.address, 'dummy')

      const id1 = await governance.latestProposalIds(proposer.address)

      await governance.setTimestamp(proposalEndTime.sub(votingDelay).sub(BigNumber.from(1)))

      governance = await governance.connect(secondProposer)
      await governance.propose(dummy.address, 'dummy2')
      const id2 = await governance.latestProposalIds(secondProposer.address)
      await governance.setTimestamp(proposalEndTime)

      const state1 = await governance.state(id1)
      expect(state1).to.equal(ProposalState.Active)

      const state2 = await governance.state(id2)
      expect(state2).to.equal(ProposalState.Active)

      const lockBefore = await governance.canWithdrawAfter(voterAlice.address)
      expect(lockBefore).to.equal(BigNumber.from(0))

      governance = await governance.connect(voterAlice)
      await governance.castVote(id2, true)

      const lockAfter1 = await governance.canWithdrawAfter(voterAlice.address)

      await governance.castVote(id1, true)
      const lockAfter2 = await governance.canWithdrawAfter(voterAlice.address)

      expect(lockAfter1).to.equal(lockAfter2)
    })
  })

  describe('#lock', () => {
    let owner = miningPublicKey
    let tokensAmount = BigNumber.from(10).pow(BigNumber.from(21)).mul(BigNumber.from(1337))

    it('permitClass works', async () => {
      owner = owner.slice(2)
      owner = await ethers.getSigner(owner)

      const args = {
        owner,
        spender: governance.address,
        value: tokensAmount,
        nonce: '0x00',
        deadline: BigNumber.from('123123123123123'),
      }

      const permitSigner = new PermitSigner(domain, args)

      permitSigner.getPayload()

      // Generate the signature in place
      const privateKey = '0x6370fd033278c143179d81c5526140625662b8daa446c22ee2d73db3707e620c'

      const address = '0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b'

      const signature = await permitSigner.getSignature(privateKey)

      const signer = await permitSigner.getSignerAddress(args, signature.hex)

      expect(address).to.equal(signer)
    })

    it('calls approve if signature is valid', async () => {
      const chainIdFromContract = await torn.chainId()
      expect(chainIdFromContract).to.equal(new BigNumber.from(domain.chainId))
      const args = {
        owner,
        spender: governance.address,
        value: tokensAmount,
        nonce: 0,
        deadline: BigNumber.from('5609459200'),
      }

      const permitSigner = new PermitSigner(domain, args)
      const signature = await permitSigner.getSignature(miningPrivateKey)
      const signer = await permitSigner.getSignerAddress(args, signature.hex)

      expect(signer).to.equal(miningPublicKey.address)

      const balanceBefore = await torn.balanceOf(governance.address)

      const lockedBalanceBefore = await governance.lockedBalance(owner.address)

      governance = await governance.connect(owner)

      await governance.lock(
        args.owner,
        // args.spender,
        args.value.toString(),
        args.deadline.toString(),
        signature.v,
        signature.r,
        signature.s,
      )

      const balanceAfter = await torn.balanceOf(governance.address)
      const lockedBalanceAfter = await governance.lockedBalance(owner.address)

      expect(balanceAfter).to.equal(balanceBefore.add(args.value))
      expect(lockedBalanceAfter).to.equal(lockedBalanceBefore.add(args.value))
    })

    it('adds up tokens if already existing', async () => {
      const voterBob = signerArray[5]
      const tenThousandTorn = ethers.utils.parseEther('10000')

      torn = await torn.connect(miningPublicKey)
      await torn.transfer(voterBob.address, tenThousandTorn)

      torn = await torn.connect(voterBob)
      await torn.approve(governance.address, tenThousandTorn)

      governance = await governance.connect(voterBob)

      await governance.lockWithApproval(tenThousandTorn.div(BigNumber.from(2)))
      await governance.lockWithApproval(tenThousandTorn.div(BigNumber.from(2)))

      const balanceAfter = await torn.balanceOf(voterBob.address)
      const lockedBalanceAfter = await governance.lockedBalance(voterBob.address)

      expect(balanceAfter).to.equal(BigNumber.from(0))
      expect(lockedBalanceAfter).to.equal(tenThousandTorn)
    })
  })

  describe('#unlock', () => {
    it('should work if there is no activity made', async () => {
      const balanceBeforeTorn = await torn.balanceOf(proposer.address)
      const balanceBefore = await governance.lockedBalance(proposer.address)

      governance = await governance.connect(proposer)
      await governance.unlock(balanceProposer)

      const balanceAfterTorn = await torn.balanceOf(proposer.address)
      const balanceAfter = await governance.lockedBalance(proposer.address)

      expect(balanceBefore).to.equal(balanceAfter.add(balanceProposer))
      expect(balanceAfterTorn).to.equal(balanceBeforeTorn.add(balanceProposer))
    })
    it('fails if asking more than balance', async () => {
      governance = await governance.connect(proposer)
      await expect(governance.unlock(balanceProposer + 1)).to.be.revertedWith(
        'Governance: insufficient balance',
      )
    })
    it('fail if there is active proposal', async () => {
      await governance.propose(dummy.address, 'dummy')
      await expect(governance.unlock(balanceProposer)).to.be.revertedWith('Governance: tokens are locked')
    })
    it('unlock if there proposals expired', async () => {
      await governance.propose(dummy.address, 'dummy')
      await governance.setTimestamp(proposalEndTime.add(BigNumber.from(lockingPeriod + duration.minutes(1))))
      await governance.unlock(balanceProposer)
    })
  })

  describe('#undelegate', () => {
    it('should work', async () => {
      let delegatee = signerArray[5]
      await governance.delegate(delegatee.address)
      const response = await governance.undelegate()
      const receipt = await response.wait()
      const logs = receipt.events
      expect(logs[0].args.account).to.equal(proposer.address)
      expect(logs[0].args[1]).to.equal(delegatee.address)
    })
  })

  describe('#delegate', () => {
    it('should work', async () => {
      let delegatee = signerArray[5]

      let vp = await governance.delegatedTo(proposer.address)
      expect(String(vp)).to.equal('0x0000000000000000000000000000000000000000')

      await governance.delegate(delegatee.address)
      vp = await governance.delegatedTo(proposer.address)
      expect(String(vp)).to.equal(delegatee.address)
    })

    it('emits undelegate event if delegate called with non empty delegateTo', async () => {
      let delegatee = signerArray[5]
      let delegateeSecond = signerArray[6]

      const response = await governance.delegate(delegatee.address)
      const receipt = await response.wait()

      expect(receipt.logs.length).to.equal(1)

      await expect(governance.delegate(delegatee.address)).to.be.revertedWith('Governance: invalid delegatee')

      const responseTwo = await governance.delegate(delegateeSecond.address)
      let receiptTwo = await responseTwo.wait()
      receiptTwo.logs = receiptTwo.events

      expect(receiptTwo.logs.length).to.equal(2)
      expect(receiptTwo.logs[0].event).to.equal('Undelegated')
      expect(receiptTwo.logs[0].args.account).to.equal(proposer.address)
      expect(receiptTwo.logs[0].args.from).to.equal(delegatee.address)

      expect(receiptTwo.logs[1].event).to.equal('Delegated')
      expect(receiptTwo.logs[1].args.account).to.equal(proposer.address)
      expect(receiptTwo.logs[1].args[1]).to.equal(delegateeSecond.address)

      const vp = await governance.delegatedTo(proposer.address)

      expect(vp).to.equal(delegateeSecond.address)
    })
    it('can propose with delegated votes', async () => {
      let delegatee = signerArray[5]
      await governance.delegate(delegatee.address)

      governance = await governance.connect(delegatee)
      await governance.proposeByDelegate(proposer.address, dummy.address, 'dummy')

      const proposalCount = await governance.proposalCount()
      expect(proposalCount).to.equal(1)

      const latestProposalId = await governance.latestProposalIds(proposer.address)
      expect(latestProposalId).to.equal(1)

      const proposal = await governance.proposals(1)
      expect(proposal.proposer).to.equal(proposer.address)
    })

    it('can vote with delegated votes', async () => {
      let delegatee = signerArray[5]

      governance = await governance.connect(proposer)
      await governance.delegate(delegatee.address)

      await governance.propose(dummy.address, 'dummy')

      const votesCount = balanceProposer

      const id = await governance.latestProposalIds(proposer.address)

      await governance.setTimestamp(proposalEndTime)

      governance = await governance.connect(delegatee)
      await governance.castDelegatedVote([proposer.address], id, true)

      await governance.getReceipt(id, proposer.address)

      let proposal = await governance.proposals(id)

      expect(proposal.forVotes).to.equal(votesCount)
      expect(proposal.againstVotes).to.equal(0)

      governance = await governance.connect(proposer)
      await governance.castVote(id, false)
      await governance.getReceipt(id, proposer.address)

      proposal = await governance.proposals(id)

      expect(proposal.forVotes).to.equal(0)
      expect(proposal.againstVotes).to.equal(votesCount)
    })
  })

  describe.skip('#getAllProposals', () => {
    it('fetches proposals', async () => {
      await governance.propose(dummy.address, 'dummy')
      await governance.setTimestamp(proposalEndTime)

      const proposals = await governance.getAllProposals(0, 0)
      const proposal = proposals[0]

      expect(proposal.id).to.equal(1)
      expect(proposal.proposer).to.equal(proposer.address)
      expect(proposal.startTime).to.equal(proposalStartTime)
      expect(proposal.endTime).to.equal(proposalEndTime)
      expect(proposal.forVotes).to.equal(0)
      expect(proposal.againstVotes).to.equal(0)
      expect(proposal.executed).to.equal(false)
      expect(proposal.state).to.equal(ProposalState.Active)
    })
  })

  describe.skip('#getBalances', () => {
    it('fetches lockedBalance', async () => {
      const lockedBalanceOne = await governance.getBalances([proposer.address, secondProposer.address])

      lockedBalanceOne.to.equal([balanceProposer, BigNumber.from('0')])

      torn = await torn.connect(secondProposer)
      await torn.approve(governance.address, balanceProposer.div(BigNumber.from(2)))

      governance = await governance.connect(secondProposer)
      await governance.lockWithApproval(balanceProposer.div(BigNumber.from(2)))

      const lockedBalance = await governance.getBalances([proposer.address, secondProposer.address])

      expect(lockedBalance).to.equal([balanceProposer, balanceProposer.div(BigNumber.from(2))])
    })
  })

  describe('#upgrades', () => {
    it('allows to change variable state', async () => {
      let proposal = await ethers.getContractFactory('ProposalStateChangeGovernance')
      proposal = await proposal.deploy()

      governance = await governance.connect(proposer)
      await governance.propose(proposal.address, 'proposal')

      const id = await governance.latestProposalIds(proposer.address)
      await governance.setTimestamp(proposalStartTime.add(BigNumber.from(1)))

      let state = await governance.state(id)
      expect(state).to.equal(ProposalState.Active)

      await governance.castVote(id, true)

      await governance.setTimestamp(
        proposalEndTime.add(BigNumber.from(executionDelay).add(BigNumber.from(duration.days(1)))),
      )

      const EXECUTION_DELAY_BEFORE = await governance.EXECUTION_DELAY()
      expect(EXECUTION_DELAY_BEFORE).to.equal(duration.days(2))

      const response = await governance.execute(id)
      let receipt = await response.wait()
      receipt.logs = receipt.events

      const EXECUTION_DELAY_AFTER = await governance.EXECUTION_DELAY()

      expect(EXECUTION_DELAY_AFTER).to.equal(duration.days(3))
      expect(receipt.logs[0].event).to.equal('ProposalExecuted')
    })
    it('upgrades implementation with variables change', async () => {
      let NewImplementation = await ethers.getContractFactory('NewImplementation')
      NewImplementation = await NewImplementation.deploy()

      let proposal = await ethers.getContractFactory('ProposalUpgrade')
      proposal = await proposal.deploy(NewImplementation.address)

      governance = await governance.connect(proposer)
      await governance.propose(proposal.address, 'proposal')

      const id = await governance.latestProposalIds(proposer.address)
      await governance.setTimestamp(proposalStartTime.add(BigNumber.from(1)))

      let state = await governance.state(id)
      expect(state).to.equal(ProposalState.Active)

      governance = await governance.connect(proposer)
      await governance.castVote(id, true)

      await governance.setTimestamp(
        proposalEndTime.add(BigNumber.from(executionDelay).add(BigNumber.from(duration.days(1)))),
      )

      const newGovernance = await ethers.getContractAt('NewImplementation', governance.address)
      const response = await governance.execute(id)
      let receipt = await response.wait()
      receipt.logs = receipt.events

      let newVariable = await newGovernance.newVariable()
      expect(newVariable).to.equal(0)

      const responseExecute = await newGovernance.execute(123)
      let receiptExecute = await responseExecute.wait()
      receiptExecute.logs = receiptExecute.events

      newVariable = await newGovernance.newVariable()
      expect(newVariable).to.equal(999)

      expect(receipt.logs[1].event).to.equal('ProposalExecuted')
      expect(receiptExecute.logs[0].event).to.equal('Overriden')
    })
    it('cannot initialize implementation contract', async () => {
      const impl = await (await ethers.getContractFactory('NewImplementation')).deploy()
      await expect(impl.initialize(signerArray[0].address + '000000000000000000000000')).to.be.revertedWith(
        'Contract instance has already been initialized',
      )
    })
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshotId])
    snapshotId = await ethers.provider.send('evm_snapshot', [])
  })

  after(async function () {
    await ethers.provider.send('hardhat_reset', [
      {
        forking: {
          jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_KEY}`,
          blockNumber: process.env.use_latest_block == 'true' ? undefined : config.forkBlockNumber,
        },
      },
    ])
  })
})
