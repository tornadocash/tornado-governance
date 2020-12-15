/* global artifacts, web3, contract */
require('chai').use(require('bn-chai')(web3.utils.BN)).use(require('chai-as-promised')).should()
const util = require('ethereumjs-util')

const Governance = artifacts.require('./MockGovernance.sol')
const Dummy = artifacts.require('./Dummy.sol')
const Proposal = artifacts.require('./Proposal.sol')
const Torn = artifacts.require('./TORNMock.sol')
const TransparentUpgradeableProxy = artifacts.require('./MockProxy.sol')
const ProposalStateChangeGovernance = artifacts.require('./ProposalStateChangeGovernance.sol')
const NewImplementation = artifacts.require('./NewImplementation.sol')
const ProposalUpgrade = artifacts.require('./ProposalUpgrade.sol')

const { PermitSigner } = require('../lib/Permit')

const { toBN, toChecksumAddress } = require('web3-utils')
const { takeSnapshot, revertSnapshot } = require('../scripts/ganacheHelper')
const BN = require('bn.js')
const tornConfig = require('torn-token')
const RLP = require('rlp')

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

async function getNextAddr(sender, offset = 0) {
  const nonce = await web3.eth.getTransactionCount(sender)
  return (
    '0x' +
    web3.utils
      .sha3(RLP.encode([sender, Number(nonce) + Number(offset)]))
      .slice(12)
      .substring(14)
  )
}

contract('Governance', (accounts) => {
  let governance, dummy
  let proposer = accounts[3]
  let secondProposer = accounts[8]
  let snapshotId
  let timestamp = 1577836800 // 01/01/2020 00:00
  let torn
  let chainId
  let domain
  let votingDelay
  let votingPeriod
  let executionExpiration
  let executionDelay
  let extendTime
  let proposalStartTime
  let proposalEndTime
  let lockingPeriod
  let balanceProposer
  const cap = toBN(tornConfig.torn.cap)
  const tenThousandTorn = toBN(10).pow(toBN(18)).mul(toBN(10000))
  const miningPrivateKey = '0xc87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3'
  const miningPublicKey = toChecksumAddress(
    '0x' + util.privateToAddress(Buffer.from(miningPrivateKey.slice(2), 'hex')).toString('hex'),
  )

  before(async () => {
    chainId = await web3.eth.net.getId()
    const governanceExpectedAddr = await getNextAddr(accounts[0], 2)
    torn = await Torn.new(governanceExpectedAddr, duration.days(30), [
      { to: miningPublicKey, amount: cap.toString() },
    ])
    const governanceImplementation = await Governance.new()
    const calldata = governanceImplementation.contract.methods.initialize(torn.address).encodeABI()
    const proxy = await TransparentUpgradeableProxy.new(governanceImplementation.address, calldata)
    governance = await Governance.at(proxy.address)
    dummy = await Dummy.new()
    balanceProposer = cap.div(toBN(4))
    await torn.transfer(secondProposer, balanceProposer.div(toBN(2)), { from: miningPublicKey })
    await torn.transfer(proposer, balanceProposer, { from: miningPublicKey })
    await torn.setChainId(chainId)
    await governance.setTimestamp(timestamp)
    votingDelay = await governance.VOTING_DELAY()
    votingPeriod = await governance.VOTING_PERIOD()
    executionExpiration = await governance.EXECUTION_EXPIRATION()
    executionDelay = await governance.EXECUTION_DELAY()
    extendTime = await governance.VOTE_EXTEND_TIME()
    proposalStartTime = new BN(timestamp).add(votingDelay)
    proposalEndTime = votingPeriod.add(toBN(proposalStartTime))
    lockingPeriod = Number(extendTime) + Number(executionExpiration) + Number(executionDelay)
    domain = {
      name: await torn.name(),
      version: '1',
      chainId,
      verifyingContract: torn.address,
    }
    snapshotId = await takeSnapshot()
  })
  beforeEach(async () => {
    await torn.approve(governance.address, cap.div(toBN(4)), { from: proposer })
    await governance.lockWithApproval(cap.div(toBN(4)), { from: proposer })
    const balance = await governance.lockedBalance(proposer)
    balance.should.be.eq.BN(cap.div(toBN(4)))
  })
  describe('#constructor', () => {
    it('should work', async () => {
      const proposalCount = await governance.proposalCount()
      proposalCount.should.be.eq.BN(0)

      const p = await governance.proposals(0)
      p.proposer.should.be.equal(governance.address)
      p.target.should.be.equal('0x000000000000000000000000000000000000dEaD')
      p.endTime.should.be.eq.BN(toBN(0))
      p.forVotes.should.be.eq.BN(toBN(0))
      p.againstVotes.should.be.eq.BN(toBN(0))
      p.executed.should.be.equal(true)
      p.extended.should.be.equal(false)
    })
  })
  describe('#propose', () => {
    it('should work', async () => {
      const { logs } = await governance.propose(dummy.address, 'dummy', { from: proposer })

      const id = await governance.latestProposalIds(proposer)
      const proposalCount = await governance.proposalCount()
      proposalCount.should.be.eq.BN(1)

      const proposal = await governance.proposals(id)
      proposal.proposer.should.be.equal(proposer)
      proposal.startTime.should.be.eq.BN(proposalStartTime)
      proposal.endTime.should.be.eq.BN(proposalEndTime)
      proposal.forVotes.should.be.eq.BN(0)
      proposal.againstVotes.should.be.eq.BN(0)
      proposal.executed.should.be.equal(false)

      // emit ProposalCreated(newProposal.id, msg.sender, target, startBlock, endBlock, description);
      logs[0].event.should.be.equal('ProposalCreated')
      logs[0].args.id.should.be.eq.BN(id)
      logs[0].args.proposer.should.be.eq.BN(proposer)
      logs[0].args.target.should.be.eq.BN(dummy.address)
      logs[0].args.description.should.be.eq.BN('dummy')
      logs[0].args.startTime.should.be.eq.BN(proposalStartTime)
      logs[0].args.endTime.should.be.eq.BN(votingPeriod.add(toBN(proposalStartTime)))

      let state = await governance.state(id)
      state.should.be.eq.BN(ProposalState.Pending)
      await governance.setTimestamp(proposalEndTime)
      state = await governance.state(id)
      state.should.be.eq.BN(ProposalState.Active)

      const accountLock = await governance.canWithdrawAfter(proposer)
      accountLock.should.be.eq.BN(proposalEndTime.add(toBN(lockingPeriod)))
    })
    it('fails if target is not a contract', async () => {
      await governance
        .propose(accounts[9], 'dummy', { from: proposer })
        .should.be.rejectedWith('not a contract')
    })
    it('fails if proposer has already pending proposal', async () => {
      await governance.propose(dummy.address, 'dummy', { from: proposer })
      await governance
        .propose(dummy.address, 'dummy', { from: proposer })
        .should.be.rejectedWith(
          'Governance::propose: one live proposal per proposer, found an already active proposal',
        )
      await governance.setTimestamp(proposalEndTime)
      await governance
        .propose(dummy.address, 'dummy', { from: proposer })
        .should.be.rejectedWith(
          'Governance::propose: one live proposal per proposer, found an already active proposal',
        )
    })
    it('fails if proposer does not have voting power', async () => {
      const voterBob = accounts[5]
      const tenThousandTorn = toBN(10).pow(toBN(18)).mul(toBN(999))
      await torn.transfer(voterBob, tenThousandTorn, { from: miningPublicKey })

      await torn.approve(governance.address, tenThousandTorn, { from: voterBob })

      await governance.lockWithApproval(tenThousandTorn, { from: voterBob })
      await governance
        .propose(dummy.address, 'dummy', { from: voterBob })
        .should.be.rejectedWith('Governance::propose: proposer votes below proposal threshold.')
    })
  })
  describe('#castVote', () => {
    it('should work if support is true', async () => {
      await governance.propose(dummy.address, 'dummy', { from: proposer })
      const votesCount = balanceProposer
      const id = await governance.latestProposalIds(proposer)
      await governance.setTimestamp(proposalEndTime)

      const state = await governance.state(id)
      state.should.be.eq.BN(ProposalState.Active)
      const { logs } = await governance.castVote(id, true, { from: proposer })
      logs[0].event.should.be.equal('Voted')
      logs[0].args.voter.should.be.equal(proposer)
      logs[0].args.proposalId.should.be.eq.BN(id)
      logs[0].args.support.should.be.equal(true)
      logs[0].args.votes.should.be.eq.BN(votesCount)
      await governance.getReceipt(id, proposer)

      const proposal = await governance.proposals(id)
      proposal.forVotes.should.be.eq.BN(votesCount)
      proposal.againstVotes.should.be.eq.BN(0)
    })
    it('should work if support is false', async () => {
      await governance.propose(dummy.address, 'dummy', { from: proposer })
      const votesCount = balanceProposer
      const id = await governance.latestProposalIds(proposer)
      await governance.setTimestamp(proposalEndTime)
      const state = await governance.state(id)
      state.should.be.eq.BN(ProposalState.Active)
      const { logs } = await governance.castVote(id, false, { from: proposer })
      logs[0].event.should.be.equal('Voted')
      logs[0].args.voter.should.be.equal(proposer)
      logs[0].args.proposalId.should.be.eq.BN(id)
      logs[0].args.support.should.be.equal(false)
      logs[0].args.votes.should.be.eq.BN(votesCount)

      const proposal = await governance.proposals(id)
      proposal.forVotes.should.be.eq.BN(0)
      proposal.againstVotes.should.be.eq.BN(votesCount)
    })
    it('should be able to change the choice later if already voted before', async () => {
      await governance.propose(dummy.address, 'dummy', { from: proposer })
      const votesCount = balanceProposer
      const id = await governance.latestProposalIds(proposer)
      await governance.setTimestamp(proposalEndTime)
      const state = await governance.state(id)
      state.should.be.eq.BN(ProposalState.Active)
      await governance.castVote(id, false, { from: proposer })
      await governance.castVote(id, true, { from: proposer })
      const { logs } = await governance.castVote(id, false, { from: proposer })
      logs[0].event.should.be.equal('Voted')
      logs[0].args.voter.should.be.equal(proposer)
      logs[0].args.proposalId.should.be.eq.BN(id)
      logs[0].args.support.should.be.equal(false)
      logs[0].args.votes.should.be.eq.BN(votesCount)

      const proposal = await governance.proposals(id)
      proposal.forVotes.should.be.eq.BN(0)
      proposal.againstVotes.should.be.eq.BN(votesCount)
    })
    it('should work if there are multiple voters', async () => {
      const voterBob = accounts[5]
      const voterAlice = accounts[7]
      const tenThousandTorn = toBN(10).pow(toBN(18)).mul(toBN(10000)) // todo
      await torn.transfer(voterBob, tenThousandTorn, { from: miningPublicKey })
      await torn.transfer(voterAlice, tenThousandTorn.mul(toBN(2)), { from: miningPublicKey })

      await torn.approve(governance.address, tenThousandTorn, { from: voterBob })
      await torn.approve(governance.address, tenThousandTorn.mul(toBN(2)), { from: voterAlice })

      await governance.lockWithApproval(tenThousandTorn, { from: voterBob })
      await governance.lockWithApproval(tenThousandTorn.mul(toBN(2)), { from: voterAlice })

      await governance.propose(dummy.address, 'dummy', { from: proposer })
      const votesCount = balanceProposer
      const id = await governance.latestProposalIds(proposer)
      await governance.setTimestamp(proposalEndTime)
      const state = await governance.state(id)
      state.should.be.eq.BN(ProposalState.Active)
      await governance.castVote(id, false, { from: proposer })
      await governance.castVote(id, false, { from: voterBob })
      await governance.castVote(id, true, { from: voterAlice })

      const proposal = await governance.proposals(id)
      proposal.forVotes.should.be.eq.BN(tenThousandTorn.mul(toBN(2)))
      proposal.againstVotes.should.be.eq.BN(votesCount.add(tenThousandTorn))
    })
    it('fails if voter does not have voting power', async () => {
      const voterBob = accounts[5]

      await governance.propose(dummy.address, 'dummy', { from: proposer })
      const id = await governance.latestProposalIds(proposer)
      await governance.setTimestamp(proposalEndTime)
      const state = await governance.state(id)
      state.should.be.eq.BN(ProposalState.Active)
      await governance
        .castVote(id, false, { from: voterBob })
        .should.be.rejectedWith('Governance: balance is 0')
    })
    it('should be able to update number of votes count if the same decision is chosen after more tokens are locked', async () => {
      const voterBob = accounts[5]
      const tenThousandTorn = toBN(10).pow(toBN(18)).mul(toBN(10000)) // todo
      const fiveThousandTorn = tenThousandTorn.div(toBN(2))
      await torn.transfer(voterBob, tenThousandTorn, { from: miningPublicKey })

      await torn.approve(governance.address, tenThousandTorn, { from: voterBob })

      await governance.lockWithApproval(fiveThousandTorn, { from: voterBob })

      await governance.propose(dummy.address, 'dummy', { from: proposer })
      const votesCount = balanceProposer
      const id = await governance.latestProposalIds(proposer)
      await governance.setTimestamp(proposalEndTime)
      const state = await governance.state(id)
      state.should.be.eq.BN(ProposalState.Active)
      await governance.castVote(id, false, { from: proposer })
      await governance.castVote(id, false, { from: voterBob })

      let proposal = await governance.proposals(id)
      proposal.forVotes.should.be.eq.BN(toBN(0))
      proposal.againstVotes.should.be.eq.BN(votesCount.add(fiveThousandTorn))

      await governance.lockWithApproval(fiveThousandTorn, { from: voterBob })
      await governance.castVote(id, false, { from: voterBob })

      proposal = await governance.proposals(id)
      proposal.forVotes.should.be.eq.BN(toBN(0))
      proposal.againstVotes.should.be.eq.BN(votesCount.add(tenThousandTorn))
    })
    it('extends time if the vote changes the outcome during the CLOSING_PERIOD', async () => {
      const voterBob = accounts[5]
      const voterAlice = accounts[7]
      await torn.transfer(voterBob, tenThousandTorn, { from: miningPublicKey })
      await torn.transfer(voterAlice, tenThousandTorn.mul(toBN(2)), { from: miningPublicKey })

      await torn.approve(governance.address, tenThousandTorn, { from: voterBob })
      await torn.approve(governance.address, tenThousandTorn.mul(toBN(2)), { from: voterAlice })

      await governance.lockWithApproval(tenThousandTorn, { from: voterBob })
      await governance.lockWithApproval(tenThousandTorn.mul(toBN(2)), { from: voterAlice })

      await governance.propose(dummy.address, 'dummy', { from: proposer })
      const id = await governance.latestProposalIds(proposer)
      await governance.setTimestamp(proposalStartTime.add(toBN(1)))
      const state = await governance.state(id)
      state.should.be.eq.BN(ProposalState.Active)
      await governance.castVote(id, false, { from: voterBob })
      await governance.castVote(id, true, { from: voterAlice })

      let MAX_EXTENDED_TIME = await governance.VOTE_EXTEND_TIME()
      let proposal = await governance.proposals(id)
      proposal.endTime.should.be.eq.BN(proposalEndTime)
      await governance.setTimestamp(proposalEndTime)
      await governance.castVote(id, false, { from: proposer })
      proposal = await governance.proposals(id)
      proposal.endTime.should.be.eq.BN(proposalEndTime.add(MAX_EXTENDED_TIME))
      await governance.setTimestamp(proposalEndTime.add(toBN(duration.hours(5))))

      const stateAfter = await governance.state(id)
      stateAfter.should.be.eq.BN(ProposalState.Active)
    })
    it('locks tokens after vote', async () => {
      const voterAlice = accounts[7]
      await torn.transfer(voterAlice, tenThousandTorn, { from: miningPublicKey })
      await torn.approve(governance.address, tenThousandTorn, { from: voterAlice })
      await governance.lockWithApproval(tenThousandTorn, { from: voterAlice })

      await governance.propose(dummy.address, 'dummy', { from: proposer })
      const id = await governance.latestProposalIds(proposer)
      await governance.setTimestamp(proposalStartTime.add(toBN(1)))

      const state = await governance.state(id)
      state.should.be.eq.BN(ProposalState.Active)

      const lockBefore = await governance.canWithdrawAfter(voterAlice)
      lockBefore.should.be.eq.BN(toBN(0))

      await governance.castVote(id, true, { from: voterAlice })

      const lockAfter = await governance.canWithdrawAfter(voterAlice)
      lockAfter.should.be.eq.BN(proposalEndTime.add(toBN(lockingPeriod)))
    })
    it('does not reduce lock time', async () => {
      const voterAlice = accounts[7]
      await torn.transfer(voterAlice, tenThousandTorn, { from: miningPublicKey })
      await torn.approve(governance.address, tenThousandTorn, { from: voterAlice })
      await governance.lockWithApproval(tenThousandTorn, { from: voterAlice })
      await torn.approve(governance.address, balanceProposer.div(toBN(2)), { from: secondProposer })
      await governance.lockWithApproval(balanceProposer.div(toBN(2)), { from: secondProposer })

      await governance.propose(dummy.address, 'dummy', { from: proposer })
      const id1 = await governance.latestProposalIds(proposer)

      await governance.setTimestamp(proposalEndTime.sub(votingDelay).sub(toBN(1)))

      await governance.propose(dummy.address, 'dummy2', { from: secondProposer })
      const id2 = await governance.latestProposalIds(secondProposer)
      await governance.setTimestamp(proposalEndTime)

      const state1 = await governance.state(id1)
      state1.should.be.eq.BN(ProposalState.Active)
      const state2 = await governance.state(id2)
      state2.should.be.eq.BN(ProposalState.Active)

      const lockBefore = await governance.canWithdrawAfter(voterAlice)
      lockBefore.should.be.eq.BN(toBN(0))

      await governance.castVote(id2, true, { from: voterAlice })

      const lockAfter1 = await governance.canWithdrawAfter(voterAlice)

      await governance.castVote(id1, true, { from: voterAlice })
      const lockAfter2 = await governance.canWithdrawAfter(voterAlice)
      lockAfter1.should.be.eq.BN(lockAfter2)
    })
  })

  describe('#execute', () => {
    let proposal
    before(async () => {
      proposal = await Proposal.new()
    })
    it('should work', async () => {
      await governance.propose(proposal.address, 'proposal', { from: proposer })
      const id = await governance.latestProposalIds(proposer)
      await governance.setTimestamp(proposalStartTime.add(toBN(1)))
      let state = await governance.state(id)
      state.should.be.eq.BN(ProposalState.Active)
      await governance.castVote(id, true, { from: proposer })

      await governance.setTimestamp(proposalEndTime.add(toBN(executionDelay).add(toBN(duration.days(1)))))

      const receipt = await governance.execute(id)
      const debugLog = receipt.receipt.rawLogs[0]
      const decodedLog = web3.eth.abi.decodeLog(
        [
          {
            type: 'address',
            name: 'output',
          },
        ],
        debugLog.data,
        debugLog.topics[0],
      )
      const newDummy = await Dummy.at(decodedLog.output)
      const dummyText = await newDummy.text()
      dummyText.should.be.equal('dummy')
      receipt.logs[0].event.should.be.equal('ProposalExecuted')
    })
  })

  describe('#lock', () => {
    let owner = miningPublicKey
    let tokensAmount = toBN(10).pow(toBN(21)).mul(toBN(1337))
    it('permitClass works', async () => {
      const args = {
        owner,
        spender: governance.address,
        value: tokensAmount,
        nonce: '0x00',
        deadline: new BN('123123123123123'),
      }

      const permitSigner = new PermitSigner(domain, args)
      permitSigner.getPayload()

      // Generate the signature in place
      const privateKey = '0x6370fd033278c143179d81c5526140625662b8daa446c22ee2d73db3707e620c'
      const address = '0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b'
      const signature = await permitSigner.getSignature(privateKey)
      const signer = await permitSigner.getSignerAddress(args, signature.hex)
      address.should.be.equal(signer)
    })

    it('calls approve if signature is valid', async () => {
      const chainIdFromContract = await torn.chainId()
      chainIdFromContract.should.be.eq.BN(new BN(domain.chainId))
      const args = {
        owner,
        spender: governance.address,
        value: tokensAmount,
        nonce: 0,
        deadline: new BN('1609459200'), // 01/01/2021 @ 12:00am (UTC)
      }
      const permitSigner = new PermitSigner(domain, args)
      const signature = await permitSigner.getSignature(miningPrivateKey)
      const signer = await permitSigner.getSignerAddress(args, signature.hex)
      signer.should.be.equal(miningPublicKey)

      const balanceBefore = await torn.balanceOf(governance.address)
      const lockedBalanceBefore = await governance.lockedBalance(owner)
      await governance.lock(
        args.owner,
        // args.spender,
        args.value.toString(),
        args.deadline.toString(),
        signature.v,
        signature.r,
        signature.s,
        { from: owner },
      )
      const balanceAfter = await torn.balanceOf(governance.address)
      const lockedBalanceAfter = await governance.lockedBalance(owner)

      balanceAfter.should.be.eq.BN(balanceBefore.add(args.value))
      lockedBalanceAfter.should.be.eq.BN(lockedBalanceBefore.add(args.value))
    })
    it('adds up tokens if already existing', async () => {
      const voterBob = accounts[5]
      const tenThousandTorn = toBN(10).pow(toBN(18)).mul(toBN(10000)) // todo
      await torn.transfer(voterBob, tenThousandTorn, { from: miningPublicKey })

      await torn.approve(governance.address, tenThousandTorn, { from: voterBob })

      await governance.lockWithApproval(tenThousandTorn.div(toBN(2)), { from: voterBob })
      await governance.lockWithApproval(tenThousandTorn.div(toBN(2)), { from: voterBob })

      const balanceAfter = await torn.balanceOf(voterBob)
      const lockedBalanceAfter = await governance.lockedBalance(voterBob)
      balanceAfter.should.be.eq.BN(toBN(0))
      lockedBalanceAfter.should.be.eq.BN(tenThousandTorn)
    })
  })

  describe('#unlock', () => {
    it('should work if there is no activity made', async () => {
      const balanceBeforeTorn = await torn.balanceOf(proposer)
      const balanceBefore = await governance.lockedBalance(proposer)

      await governance.unlock(balanceProposer, { from: proposer })
      const balanceAfterTorn = await torn.balanceOf(proposer)
      const balanceAfter = await governance.lockedBalance(proposer)
      balanceBefore.should.be.eq.BN(balanceAfter.add(balanceProposer))
      balanceAfterTorn.should.be.eq.BN(balanceBeforeTorn.add(balanceProposer))
    })
    it('fails if asking more than balance', async () => {
      await governance
        .unlock(balanceProposer + 1, { from: proposer })
        .should.be.rejectedWith('Governance: insufficient balance')
      //todo check lockedBalance
    })
    it('fail if there is active proposal', async () => {
      await governance.propose(dummy.address, 'dummy', { from: proposer })
      await governance
        .unlock(balanceProposer, { from: proposer })
        .should.be.rejectedWith('Governance: tokens are locked')
    })
    it('unlock if there proposals expired', async () => {
      await governance.propose(dummy.address, 'dummy', { from: proposer })
      await governance.setTimestamp(proposalEndTime.add(toBN(lockingPeriod + duration.minutes(1))))
      await governance.unlock(balanceProposer, { from: proposer })
    })
  })

  describe('#undelegate', () => {
    it('should work', async () => {
      let delegatee = accounts[5]
      await governance.delegate(delegatee, { from: proposer })
      const { logs } = await governance.undelegate({ from: proposer })
      logs[0].args.account.should.be.equal(proposer)
      logs[0].args.from.should.be.equal(delegatee)
    })
  })

  describe('#delegate', () => {
    it('should work', async () => {
      let delegatee = accounts[5]
      let vp = await governance.delegatedTo(proposer)
      vp.should.be.equal('0x0000000000000000000000000000000000000000')
      await governance.delegate(delegatee, { from: proposer })
      vp = await governance.delegatedTo(proposer)
      vp.should.be.equal(delegatee)
    })
    it('emits undelegate event if delegate called with non empty delegateTo', async () => {
      let delegatee = accounts[5]
      let delegateeSecond = accounts[6]
      const receipt = await governance.delegate(delegatee, { from: proposer })
      receipt.logs.length.should.be.equal(1)
      await governance
        .delegate(delegatee, { from: proposer })
        .should.be.rejectedWith('Governance: invalid delegatee')
      const receiptTwo = await governance.delegate(delegateeSecond, { from: proposer })
      receiptTwo.logs.length.should.be.equal(2)
      receiptTwo.logs[0].event.should.be.equal('Undelegated')
      receiptTwo.logs[0].args.account.should.be.equal(proposer)
      receiptTwo.logs[0].args.from.should.be.equal(delegatee)

      receiptTwo.logs[1].event.should.be.equal('Delegated')
      receiptTwo.logs[1].args.account.should.be.equal(proposer)
      receiptTwo.logs[1].args.to.should.be.equal(delegateeSecond)
      const vp = await governance.delegatedTo(proposer)
      vp.should.be.equal(delegateeSecond)
    })
    it('can propose with delegated votes', async () => {
      let delegatee = accounts[5]
      await governance.delegate(delegatee, { from: proposer })

      await governance.proposeByDelegate(proposer, dummy.address, 'dummy', { from: delegatee })
      const proposalCount = await governance.proposalCount()
      proposalCount.should.be.eq.BN(1)
      const latestProposalId = await governance.latestProposalIds(proposer)
      latestProposalId.should.be.eq.BN(1)
      const proposal = await governance.proposals(1)
      proposal.proposer.should.be.equal(proposer)
    })
    it('can vote with delegated votes', async () => {
      let delegatee = accounts[5]
      await governance.delegate(delegatee, { from: proposer })

      await governance.propose(dummy.address, 'dummy', { from: proposer })
      const votesCount = balanceProposer
      const id = await governance.latestProposalIds(proposer)
      await governance.setTimestamp(proposalEndTime)

      await governance.castDelegatedVote([proposer], id, true, { from: delegatee })

      await governance.getReceipt(id, proposer)
      let proposal = await governance.proposals(id)
      proposal.forVotes.should.be.eq.BN(votesCount)
      proposal.againstVotes.should.be.eq.BN(0)

      await governance.castVote(id, false, { from: proposer })
      await governance.getReceipt(id, proposer)
      proposal = await governance.proposals(id)
      proposal.forVotes.should.be.eq.BN(0)
      proposal.againstVotes.should.be.eq.BN(votesCount)
    })
  })

  describe.skip('#getAllProposals', () => {
    it('fetches proposals', async () => {
      await governance.propose(dummy.address, 'dummy', { from: proposer })
      await governance.setTimestamp(proposalEndTime)
      const proposals = await governance.getAllProposals(0, 0)
      const proposal = proposals[0]
      proposal.id.should.be.eq.BN(1)
      proposal.proposer.should.be.equal(proposer)
      proposal.startTime.should.be.eq.BN(proposalStartTime)
      proposal.endTime.should.be.eq.BN(proposalEndTime)
      proposal.forVotes.should.be.eq.BN(0)
      proposal.againstVotes.should.be.eq.BN(0)
      proposal.executed.should.be.equal(false)
      proposal.state.should.be.eq.BN(ProposalState.Active)
    })
  })

  describe.skip('#getBalances', () => {
    it('fetches lockedBalance', async () => {
      const lockedBalanceOne = await governance.getBalances([proposer, secondProposer])
      lockedBalanceOne.should.be.eq.BN([balanceProposer, toBN('0')])
      await torn.approve(governance.address, balanceProposer.div(toBN(2)), { from: secondProposer })
      await governance.lockWithApproval(balanceProposer.div(toBN(2)), { from: secondProposer })

      const lockedBalance = await governance.getBalances([proposer, secondProposer])
      lockedBalance.should.be.eq.BN([balanceProposer, balanceProposer.div(toBN(2))])
    })
  })

  describe('#upgrades', () => {
    it('allows to change variable state', async () => {
      const proposal = await ProposalStateChangeGovernance.new()
      await governance.propose(proposal.address, 'proposal', { from: proposer })
      const id = await governance.latestProposalIds(proposer)
      await governance.setTimestamp(proposalStartTime.add(toBN(1)))
      let state = await governance.state(id)
      state.should.be.eq.BN(ProposalState.Active)
      await governance.castVote(id, true, { from: proposer })

      await governance.setTimestamp(proposalEndTime.add(toBN(executionDelay).add(toBN(duration.days(1)))))

      const EXECUTION_DELAY_BEFORE = await governance.EXECUTION_DELAY()
      EXECUTION_DELAY_BEFORE.should.be.eq.BN(duration.days(2))
      const receipt = await governance.execute(id)
      const EXECUTION_DELAY_AFTER = await governance.EXECUTION_DELAY()
      EXECUTION_DELAY_AFTER.should.be.eq.BN(duration.days(3))
      receipt.logs[0].event.should.be.equal('ProposalExecuted')
    })
    it('upgrades implementation with variables change', async () => {
      await NewImplementation.new({ from: accounts[9] })
      const proposal = await ProposalUpgrade.new()
      // console.log(newImpl.address) // 0xF7E3e47e06F1bDDecb1b2F3a7F60b6b25fd2e233

      await governance.propose(proposal.address, 'proposal', { from: proposer })
      const id = await governance.latestProposalIds(proposer)
      await governance.setTimestamp(proposalStartTime.add(toBN(1)))
      let state = await governance.state(id)
      state.should.be.eq.BN(ProposalState.Active)
      await governance.castVote(id, true, { from: proposer })

      await governance.setTimestamp(proposalEndTime.add(toBN(executionDelay).add(toBN(duration.days(1)))))

      const newGovernance = await NewImplementation.at(governance.address)
      const receipt = await governance.execute(id)
      let newVariable = await newGovernance.newVariable()
      newVariable.should.be.eq.BN(0)
      const receiptExecute = await newGovernance.execute(123)
      newVariable = await newGovernance.newVariable()
      newVariable.should.be.eq.BN(999)
      receipt.logs[0].event.should.be.equal('ProposalExecuted')
      receiptExecute.logs[0].event.should.be.equal('Overriden')
    })
    it('cannot initialize implementation contract', async () => {
      const impl = await NewImplementation.new({ from: accounts[9] })
      await impl
        .initialize(accounts[9])
        .should.be.rejectedWith('Contract instance has already been initialized')
    })
    it('cannot destroy implementation contract')
  })

  afterEach(async () => {
    await revertSnapshot(snapshotId.result)
    // eslint-disable-next-line require-atomic-updates
    snapshotId = await takeSnapshot()
  })
})
