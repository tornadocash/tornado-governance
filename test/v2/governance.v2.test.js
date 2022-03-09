const { expect } = require('chai')
const { ethers } = require('hardhat')
const { BigNumber } = require('@ethersproject/bignumber')
const { propose } = require('../../scripts/helper/propose_proposal.js')
const testcases = require('@ethersproject/testcases')
const seedbase = require('../../resources/hdnode.json')
const accountList = require('../../resources/accounts.json')
const config = require('../../config')

describe('V2 governance tests', () => {
  ///// ON-CHAIN CONSTANTS
  let proxy_address = '0x5efda50f22d34F262c29268506C5Fa42cB56A1Ce'
  let quorumVotes

  ///////////////////////////// CONTRACTS
  let GovernanceContract
  let TornToken

  //////////////////// IMPERSONATED
  let tornadoMultisig

  //////////////////////////////// MOCK
  let MockProposalFactory

  /////// GOV PARAMS
  const ProposalState = {
    Pending: 0,
    Active: 1,
    Defeated: 2,
    Timelocked: 3,
    AwaitingExecution: 4,
    Executed: 5,
    Expired: 6,
  }

  ///// ACCOUNTS
  let dore
  let whale
  let signerArray = []
  let whales = []

  //////////////////////////////////// TESTING & UTILITY
  let randN = Math.floor(Math.random() * 1023)
  let testseed = seedbase[randN].seed

  let minewait = async (time) => {
    await ethers.provider.send('evm_increaseTime', [time])
    await ethers.provider.send('evm_mine', [])
  }

  let sendr = async (method, params) => {
    return await ethers.provider.send(method, params)
  }

  let clog = (...x) => {
    console.log(x)
  }

  let pE = (x) => {
    return ethers.utils.parseEther(`${x}`)
  }

  let rand = (l, u) => {
    return testcases.randomNumber(testseed, l, u)
  }

  let snapshotIdArray = []

  ///////////////////////////////////////////////////////////////////////////7
  before(async function () {
    signerArray = await ethers.getSigners()
    dore = signerArray[0]

    MockProposalFactory = await ethers.getContractFactory('MockProposal')

    GovernanceContract = await ethers.getContractAt('GovernanceGasUpgrade', proxy_address)

    TornToken = await ethers.getContractAt(
      '@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20',
      '0x77777FeDdddFfC19Ff86DB637967013e6C6A116C',
    )

    quorumVotes = await GovernanceContract.QUORUM_VOTES()
  })

  describe('#imitation block', () => {
    it('Should successfully imitate tornado multisig', async function () {
      await sendr('hardhat_impersonateAccount', ['0xb04E030140b30C27bcdfaafFFA98C57d80eDa7B4'])
      tornadoMultisig = await ethers.getSigner('0xb04E030140b30C27bcdfaafFFA98C57d80eDa7B4')
    })

    it('Should successfully imitate whale', async function () {
      await sendr('hardhat_impersonateAccount', ['0xA2b2fBCaC668d86265C45f62dA80aAf3Fd1dEde3'])
      whale = await ethers.getSigner('0xA2b2fBCaC668d86265C45f62dA80aAf3Fd1dEde3')
      GovernanceContract = await GovernanceContract.connect(whale)

      let balance = await TornToken.balanceOf(whale.address)
      TornToken = await TornToken.connect(whale)

      await TornToken.approve(GovernanceContract.address, ethers.utils.parseEther('8000000000'))
      await expect(GovernanceContract.lockWithApproval(balance)).to.not.be.reverted

      expect((await GovernanceContract.lockedBalance(whale.address)).toString()).to.equal(balance.toString())
      snapshotIdArray[0] = await sendr('evm_snapshot', [])
    })
  })

  describe('#mock rewards + proposal distribution with multiple accounts', () => {
    let addrArray = []
    let signerArmy = []
    let delegatedSignerArmy = []
    let votingAddressArray = []
    const numberOfVoters = 80
    const numberOfDelegators = 30

    it('Should create empty address array', () => {
      for (let i = 0; i < 10; i++) {
        votingAddressArray[i] = new Array(numberOfDelegators / 10 + 1)
      }
    })

    it('Should impersonate and fund 80 accounts', async function () {
      ////////// WRITE WHALE ADDRESSES AND PREPARE FOR TRANSFERS
      addrArray = [
        '0x6cC5F688a315f3dC28A7781717a9A798a59fDA7b',
        '0xF977814e90dA44bFA03b6295A0616a897441aceC',
        '0xA2b2fBCaC668d86265C45f62dA80aAf3Fd1dEde3',
        '0x055AD5E56c11c0eF55818155c69ed9BA2f4b3e90',
      ]

      for (let i = 0; i < 4; i++) {
        await sendr('hardhat_impersonateAccount', [addrArray[i]])
        whales[i] = await ethers.getSigner(addrArray[i])
      }

      for (let i = 1; i < 4; i++) {
        //last test really unnecessary
        const torn = await TornToken.connect(whales[i])
        const whaleBalance = await torn.balanceOf(whales[i].address)
        await torn.approve(addrArray[0], whaleBalance)
        await expect(() => torn.transfer(addrArray[0], whaleBalance)).to.changeTokenBalance(
          torn,
          whales[0],
          whaleBalance,
        )
      }

      const whale0Balance = await TornToken.balanceOf(whales[0].address)
      const toTransfer = whale0Balance.sub(pE(10000)).div(numberOfVoters * 3)
      let torn0 = await TornToken.connect(whales[0])
      const oldBalance = await TornToken.balanceOf(await GovernanceContract.userVault())
      let lockedSum = BigNumber.from(0)

      ////////// TRANSFER TO 50 ACCOUNTS + DELEGATION TO 10

      for (let i = 0; i < numberOfVoters; i++) {
        /// PREPARE ACCOUNTS
        const accAddress = accountList[i + 7].checksumAddress
        await sendr('hardhat_impersonateAccount', [accAddress])

        signerArmy[i] = await ethers.getSigner(accAddress)
        const tx = { to: signerArmy[i].address, value: pE(1) }

        await signerArray[0].sendTransaction(tx)

        /// FILL WITH GAS FOR LATER
        await expect(() => torn0.transfer(signerArmy[i].address, toTransfer)).to.changeTokenBalance(
          torn0,
          signerArmy[i],
          toTransfer,
        )
        let torn = await torn0.connect(signerArmy[i])

        /// APPROVE TO GOVERNANCE FOR LOCK
        await expect(torn.approve(GovernanceContract.address, toTransfer)).to.not.be.reverted
        const gov = await GovernanceContract.connect(signerArmy[i])

        ///// LOCK
        if (i > numberOfVoters / 2) {
          await expect(() => gov.lockWithApproval(toTransfer.div(i))).to.changeTokenBalance(
            torn,
            signerArmy[i],
            BigNumber.from(0).sub(toTransfer.div(i)),
          )
          lockedSum = lockedSum.add(toTransfer.div(i))
        } else {
          await expect(() => gov.lockWithApproval(toTransfer)).to.changeTokenBalance(
            torn,
            signerArmy[i],
            BigNumber.from(0).sub(toTransfer),
          )
          lockedSum = lockedSum.add(toTransfer)
        }

        if (i > numberOfVoters - numberOfDelegators - 1) {
          delegatedSignerArmy[i - (numberOfVoters - numberOfDelegators)] = signerArmy[i]
        }

        if (i < 10) {
          votingAddressArray[i][0] = signerArmy[i].address
        }

        const restBalance = await torn.balanceOf(signerArmy[i].address)
        await torn.transfer(whale.address, restBalance)
      }

      for (let i = 0; i < numberOfDelegators; i++) {
        const gov = await GovernanceContract.connect(delegatedSignerArmy[i])
        /// DELEGATE TO 10 FIRST SIGNERS
        await expect(gov.delegate(signerArmy[i % 10].address)).to.emit(gov, 'Delegated')
        votingAddressArray[i % 10][Math.floor(i / 10) + 1] = delegatedSignerArmy[i].address
      }

      const TornVault = await GovernanceContract.userVault()
      expect(await TornToken.balanceOf(TornVault)).to.equal(lockedSum.add(oldBalance))

      const gov = await GovernanceContract.connect(whales[0])
      await expect(torn0.approve(GovernanceContract.address, pE(10000))).to.not.be.reverted
      await expect(() => gov.lockWithApproval(toTransfer)).to.changeTokenBalance(
        torn0,
        whales[0],
        BigNumber.from(0).sub(toTransfer),
      )

      snapshotIdArray[1] = await sendr('evm_snapshot', [])
    })

    it('Test multiple accounts proposal', async function () {
      let checkIfQuorumFulfilled = async function (proposalId) {
        const proposalData = await GovernanceContract.proposals(proposalId)
        const allVotes = proposalData[4].add(proposalData[5])
        return allVotes.gte(quorumVotes)
      }

      const ProposalContract = await MockProposalFactory.deploy()

      clog(
        'Torn balance of governance contract: ',
        (await TornToken.balanceOf(GovernanceContract.address)).toString(),
      )

      ////////////// STANDARD PROPOSAL ARGS TEST //////////////////////
      let response, id, state
      ;[response, id, state] = await propose([whales[0], ProposalContract, 'LotteryUpgrade'])
      const { events } = await response.wait()
      const args = events.find(({ event }) => event == 'ProposalCreated').args
      expect(args.id).to.be.equal(id)
      expect(args.target).to.be.equal(ProposalContract.address)
      expect(args.description).to.be.equal('LotteryUpgrade')
      expect(state).to.be.equal(ProposalState.Pending)

      ////////////////////////INCREMENT TO VOTING TIME////////////////////////
      await minewait((await GovernanceContract.VOTING_DELAY()).add(1).toNumber())

      /////////////////// PREPARE MULTISIG AND COMPENSATIONS
      let multiGov = await GovernanceContract.connect(tornadoMultisig)

      await dore.sendTransaction({ to: tornadoMultisig.address, value: pE(1) })
      await expect(multiGov.setGasCompensations(pE(500))).to.not.be.reverted
      ///////////////////////////// VOTE ////////////////////////////
      const overrides = {
        gasPrice: BigNumber.from(5),
      }

      let signerArmyBalanceInitial = []
      let signerArmyBalanceDiff = []
      let gasUsedArray = []

      snapshotIdArray[2] = await sendr('evm_snapshot', [])

      for (let i = 0; i < 10; i++) {
        let gov = await GovernanceContract.connect(signerArmy[i])
        let randN = rand(i * 5, i * 6)
        randN = randN % 2
        let response

        signerArmyBalanceInitial[i] = await signerArmy[i].getBalance()

        if (randN > 0) {
          response = await gov.castDelegatedVote(votingAddressArray[i], id, true, overrides)
        } else {
          response = await gov.castDelegatedVote(votingAddressArray[i], id, false, overrides)
        }

        signerArmyBalanceDiff[i] = !(await checkIfQuorumFulfilled(id))
          ? signerArmyBalanceInitial[i].sub(await signerArmy[i].getBalance())
          : signerArmyBalanceDiff[i - 1]

        const receipt = await response.wait()
        gasUsedArray[i] = receipt.cumulativeGasUsed
      }

      for (let i = 10; i < numberOfVoters - numberOfDelegators; i++) {
        let gov = await GovernanceContract.connect(signerArmy[i])
        let randN = rand(i * 5, i * 6)
        randN = randN % 2
        let response

        signerArmyBalanceInitial[i] = await signerArmy[i].getBalance()

        if (randN > 0) {
          response = await gov.castVote(id, true, overrides)
        } else {
          response = await gov.castVote(id, false, overrides)
        }

        signerArmyBalanceDiff[i] = !(await checkIfQuorumFulfilled(id))
          ? signerArmyBalanceInitial[i].sub(await signerArmy[i].getBalance())
          : signerArmyBalanceDiff[i - 1]

        const receipt = await response.wait()
        gasUsedArray[i] = receipt.cumulativeGasUsed
      }

      //////////////////////////////// GET STATE ///////////////////////////////
      state = await GovernanceContract.state(id)
      expect(state).to.be.equal(ProposalState.Active)

      ///////////////////////////// VOTER INFO ///////////////////////////////////
      // (uncomment for more data)
      /*
      for (i = 0; i < numberOfVoters; i+=5) {
        const j = BigNumber.from(i);
        console.log(
          `Voter ${i} sqrt: `,
          ((await GovernanceLottery.lotteryUserData(id,j))[0]).toString(),
          `Voter ${i+1} sqrt: `,
          ((await GovernanceLottery.lotteryUserData(id,j.add(1)))[0]).toString(),
          `Voter ${i+2} sqrt: `,
          ((await GovernanceLottery.lotteryUserData(id,j.add(2)))[0]).toString(),
          `Voter ${i+3} sqrt: `,
          ((await GovernanceLottery.lotteryUserData(id,j.add(3)))[0]).toString(),
          `Voter ${i+4} sqrt: `,
          ((await GovernanceLottery.lotteryUserData(id,j.add(4)))[0]).toString(),
          "\n",
        )
      }

      for (i = 0; i < numberOfVoters; i+=5) {
        console.log(
          `Voter ${i} ether used: `,
          gasUsedArray[i],
          `Voter ${i+1} ether used: `,
          gasUsedArray[i+1],
          `Voter ${i+2} ether used: `,
          gasUsedArray[i+2],
          `Voter ${i+3} ether used: `,
          gasUsedArray[i+3],
          `Voter ${i+4} ether used: `,
          gasUsedArray[i+4],
          "\n",
        )
        }
      */

      await sendr('evm_revert', [snapshotIdArray[2]])

      ///////////////////////////////// VOTE WITHOUT COMPENSATION //////////////////////////////////////
      let gasUsedWithoutCompensation = []
      await multiGov.setGasCompensations(pE(100000))

      for (let i = 0; i < 10; i++) {
        let gov = await GovernanceContract.connect(signerArmy[i])
        let randN = rand(i * 5, i * 6)
        randN = randN % 2
        let response

        if (randN > 0) {
          response = await gov.castDelegatedVote(votingAddressArray[i], id, true, overrides)
        } else {
          response = await gov.castDelegatedVote(votingAddressArray[i], id, false, overrides)
        }

        const receipt = await response.wait()
        gasUsedWithoutCompensation[i] = receipt.cumulativeGasUsed
      }

      for (let i = 10; i < numberOfVoters - numberOfDelegators; i++) {
        let gov = await GovernanceContract.connect(signerArmy[i])
        let randN = rand(i * 5, i * 6)
        randN = randN % 2
        let response

        if (randN > 0) {
          response = await gov.castVote(id, true, overrides)
        } else {
          response = await gov.castVote(id, false, overrides)
        }

        const receipt = await response.wait()

        gasUsedWithoutCompensation[i] = receipt.cumulativeGasUsed
      }

      await multiGov.setGasCompensations(pE(100))
      //////////////////////////////// GET STATE ///////////////////////////////
      state = await GovernanceContract.state(id)
      expect(state).to.be.equal(ProposalState.Active)

      ///////////////////////////// VOTING GAS INFO ///////////////////////////////////
      let gasUsedSumNoComp = BigNumber.from(0)
      let gasUsedSum = BigNumber.from(0)
      let gasSumDiff = BigNumber.from(0)
      let gasUsedSumNoCompDel = BigNumber.from(0)
      let gasUsedSumDel = BigNumber.from(0)
      let gasSumDiffDel = BigNumber.from(0)

      for (let i = 0; i < 10; i++) {
        gasUsedSumDel = gasUsedSumDel.add(gasUsedArray[i])
        gasUsedSumNoCompDel = gasUsedSumNoCompDel.add(gasUsedWithoutCompensation[i])
        gasSumDiffDel = gasSumDiffDel.add(signerArmyBalanceDiff[i])
      }

      for (let i = 10; i < numberOfVoters - numberOfDelegators; i++) {
        gasUsedSum = gasUsedSum.add(gasUsedArray[i])
        gasUsedSumNoComp = gasUsedSumNoComp.add(gasUsedWithoutCompensation[i])
        gasSumDiff = gasSumDiff.add(signerArmyBalanceDiff[i])
      }

      const gasUsedAverageNoCompDel = gasUsedSumNoCompDel.div(10)
      const gasUsedAverageDel = gasUsedSumDel.div(10)
      const gasSumAverageDiffDel = gasSumDiffDel.div(10)

      const gasUsedAverageNoComp = gasUsedSumNoComp.div(numberOfVoters - 10)
      const gasUsedAverage = gasUsedSum.div(numberOfVoters - 10)
      const gasSumAverageDiff = gasSumDiff.div(numberOfVoters - 10)

      console.log(
        '\n',
        '----------------------------CAST VOTE INFO------------------------',
        '\n',
        'Gas use average: ',
        gasUsedAverage.toString(),
        '\n',
        'Gas use without compensation average: ',
        gasUsedAverageNoComp.toString(),
        '\n',
        'Gas diff average: ',
        gasSumAverageDiff.toString(),
        '\n',
        'Gas compensated in average: ',
        gasUsedAverage.sub(gasSumAverageDiff).toString(),
        '\n',
        '--------------------------------------------------------------------',
        '\n',
      )

      console.log(
        '\n',
        '----------------------------CAST DELEGATED VOTE INFO------------------------',
        '\n',
        'Gas use average: ',
        gasUsedAverageDel.toString(),
        '\n',
        'Gas use without compensation average: ',
        gasUsedAverageNoCompDel.toString(),
        '\n',
        'Gas diff average: ',
        gasSumAverageDiffDel.toString(),
        '\n',
        'Gas compensated in average: ',
        gasUsedAverageDel.sub(gasSumAverageDiffDel).toString(),
        '\n',
        '--------------------------------------------------------------------',
        '\n',
      )
      /////////////////////////////// INCREMENT AGAIN //////////////////////////////////
      await minewait(
        (
          await GovernanceContract.VOTING_PERIOD()
        )
          .add(await GovernanceContract.EXECUTION_DELAY())
          .add(10000)
          .toNumber(),
      )

      ////////////// EXECUTE
      if (BigNumber.from(await GovernanceContract.state(id)).eq(ProposalState.Defeated)) {
        await expect(GovernanceContract.execute(id)).to.be.reverted
      } else {
        await expect(GovernanceContract.execute(id)).to.not.be.reverted
      }
    })
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
