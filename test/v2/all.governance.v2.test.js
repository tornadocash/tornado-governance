const { expect } = require('chai')
const { ethers } = require('hardhat')
const { BigNumber } = require('@ethersproject/bignumber')
const { propose } = require('../../scripts/helper/propose_proposal.js')
const testcases = require('@ethersproject/testcases')
const seedbase = require('../../resources/hdnode.json')
const accountList = require('../../resources/accounts.json')
const EasyAuctionJson = require('@gnosis.pm/ido-contracts/build/artifacts/contracts/EasyAuction.sol/EasyAuction.json')

describe('Start of tests', () => {
  ///// ON-CHAIN CONSTANTS
  let proxy_address = '0x5efda50f22d34F262c29268506C5Fa42cB56A1Ce'
  let quorumVotes

  ///////////////////////////// CONTRACTS
  let GovernanceContract
  let TornToken
  let WETH
  let TornadoAuctionHandler
  let GnosisEasyAuction

  let ProposalFactory
  let ProposalContract

  let GasCompensationFactory
  let GasCompensationContract

  let OrderHelperFactory
  let OrderHelper

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

  let timestamp = async () => {
    return (await ethers.provider.getBlock('latest')).timestamp
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

    GasCompensationFactory = await ethers.getContractFactory(
      'contracts/v2-vault-and-gas/testing/GasCompensationVault.sol:GasCompensationVault',
    )
    GasCompensationContract = await GasCompensationFactory.deploy()

    MockProposalFactory = await ethers.getContractFactory('MockProposal1')

    ProposalFactory = await ethers.getContractFactory('VaultAndGasProposal')

    ProposalContract = await ProposalFactory.deploy(GasCompensationContract.address, 260000)

    OrderHelperFactory = await ethers.getContractFactory('OrderEncoderHelper')
    OrderHelper = await OrderHelperFactory.deploy()

    GovernanceContract = await ethers.getContractAt('contracts/v1/Governance.sol:Governance', proxy_address)
    GnosisEasyAuction = await ethers.getContractAt(
      EasyAuctionJson.abi,
      '0x0b7fFc1f4AD541A4Ed16b40D8c37f0929158D101',
    )

    TornToken = await ethers.getContractAt(
      '@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20',
      '0x77777FeDdddFfC19Ff86DB637967013e6C6A116C',
    )
    WETH = await ethers.getContractAt('IWETH', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2')

    quorumVotes = await GovernanceContract.QUORUM_VOTES()
  })

  describe('Test complete functionality', () => {
    describe('Imitation block', () => {
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

        expect((await GovernanceContract.lockedBalance(whale.address)).toString()).to.equal(
          balance.toString(),
        )
        snapshotIdArray[0] = await sendr('evm_snapshot', [])
      })
    })

    describe('Proposal passing block', () => {
      it('Should successfully pass the proposal', async function () {
        let response, id, state
        ;[response, id, state] = await propose([whale, ProposalContract, 'Gas Upgrade'])

        const { events } = await response.wait()
        const args = events.find(({ event }) => event == 'ProposalCreated').args
        expect(args.id).to.be.equal(id)
        expect(args.proposer).to.be.equal(whale.address)
        expect(args.target).to.be.equal(ProposalContract.address)
        expect(args.description).to.be.equal('Gas Upgrade')
        expect(state).to.be.equal(ProposalState.Pending)

        await minewait((await GovernanceContract.VOTING_DELAY()).add(1).toNumber())
        await expect(GovernanceContract.castVote(id, true)).to.not.be.reverted
        state = await GovernanceContract.state(id)
        expect(state).to.be.equal(ProposalState.Active)
        await minewait(
          (
            await GovernanceContract.VOTING_PERIOD()
          )
            .add(await GovernanceContract.EXECUTION_DELAY())
            .add(86400)
            .toNumber(),
        )

        await dore.sendTransaction({ to: whale.address, value: pE(10) })
        const executeResponse = await GovernanceContract.execute(id)
        const executeReceipt = await executeResponse.wait()

        console.log(
          '______________________\n',
          'Gas used for execution: ',
          executeReceipt.cumulativeGasUsed.toString(),
          '\n-------------------------\n',
        )
        const topic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
        let handlerAddress

        for (let i = 0; i < executeReceipt.logs.length; i++) {
          if (executeReceipt.logs[i].topics[0] == topic) {
            handlerAddress = executeReceipt.logs[i].topics[1]
          }
        }

        TornadoAuctionHandler = await ethers.getContractAt(
          'TornadoAuctionHandler',
          '0x' + handlerAddress.slice(26),
        )
        GovernanceContract = await ethers.getContractAt('GovernanceGasUpgrade', GovernanceContract.address)

        clog(await GovernanceContract.version())
        const auctionCounter = 38
        const auctionData = await GnosisEasyAuction.auctionData(auctionCounter)
        expect(auctionData.auctioningToken).to.equal(TornToken.address)

        console.log(
          '////////////////AUCTION/////////////////\n',
          'Started at: ',
          await timestamp(),
          ', Will end at: ',
          auctionData.auctionEndDate.toString(),
          '\n////////////////////////////////',
        )

        snapshotIdArray[1] = await sendr('evm_snapshot', [])
      })
    })

    describe('Mock rewards + proposal distribution with multiple accounts', () => {
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

        snapshotIdArray[2] = await sendr('evm_snapshot', [])
      })

      it('Should test if auction handler can convert ETH to gov', async function () {
        WETH = await WETH.connect(signerArray[4])
        await WETH.deposit({ value: pE(100) })
        await WETH.transfer(TornadoAuctionHandler.address, pE(100))
        await expect(() => TornadoAuctionHandler.convertAndTransferToGovernance()).to.changeEtherBalance(
          GovernanceContract,
          pE(100),
        )
      })

      it('Should test if auction will behave properly', async function () {
        snapshotIdArray[2] = await sendr('evm_snapshot', [])

        let orderArray = []
        const initialHandlerBalance = await WETH.balanceOf(TornadoAuctionHandler.address)

        /**
         * 100 TORN in to total
         * Price as of time of writing 1 ETH == 51.66 TORN
         * First test is an overbought auction, 20 buyers compete for 40 TORN
         */
        for (let i = 0; i < signerArray.length; i++) {
          const bidder = signerArray[i]

          WETH = await WETH.connect(bidder)
          await expect(() => WETH.deposit({ value: pE(100) })).to.changeEtherBalance(
            bidder,
            BigNumber.from(0).sub(pE(100)),
          )

          const buyAmount = pE(40)
          const sellAmount = pE(3.73 + i / 100)

          await WETH.approve(GnosisEasyAuction.address, sellAmount)

          GnosisEasyAuction = await GnosisEasyAuction.connect(bidder)

          await GnosisEasyAuction.placeSellOrders(
            38,
            [buyAmount],
            [sellAmount],
            ['0x0000000000000000000000000000000000000000000000000000000000000001'],
            '0x',
          )

          orderArray[i] = await OrderHelper.encodeOrder(
            await GnosisEasyAuction.numUsers(),
            buyAmount,
            sellAmount,
          )
        }

        let auctionEndDt = (await GnosisEasyAuction.auctionData(38))[3].sub(BigNumber.from(await timestamp()))

        await minewait(auctionEndDt.toNumber())

        await GnosisEasyAuction.settleAuction(38)

        expect(await WETH.balanceOf(TornadoAuctionHandler.address)).to.be.gt(initialHandlerBalance)

        for (let i = 0; i < signerArray.length; i++) {
          await GnosisEasyAuction.claimFromParticipantOrder(38, [orderArray[i]])
          const balance = await TornToken.balanceOf(signerArray[i].address)
          if (balance.toString() != '0') console.log(`Signer ${i} claimed:`, balance.toString(), ' torn')
        }
        console.log('All other signers got nothing!')

        let claimedSum = BigNumber.from(0)

        for (let i = 0; i < signerArray.length; i++) {
          const claimed = await TornToken.balanceOf(signerArray[i].address)
          claimedSum = claimedSum.add(claimed)
        }

        expect(claimedSum).to.closeTo(ethers.utils.parseEther('100'), ethers.utils.parseUnits('1', 'szabo'))

        /// Now revert and test with lower
        await sendr('evm_revert', [snapshotIdArray[2]])
        snapshotIdArray[2] = await sendr('evm_snapshot', [])

        for (let i = 0; i < signerArray.length; i++) {
          const bidder = signerArray[i]

          WETH = await WETH.connect(bidder)
          await expect(() => WETH.deposit({ value: pE(100) })).to.changeEtherBalance(
            bidder,
            BigNumber.from(0).sub(pE(100)),
          )

          const buyAmount = pE(0.5)
          const sellAmount = pE(0.53 + i / 100)

          await WETH.approve(GnosisEasyAuction.address, sellAmount)

          GnosisEasyAuction = await GnosisEasyAuction.connect(bidder)

          await GnosisEasyAuction.placeSellOrders(
            38,
            [buyAmount],
            [sellAmount],
            ['0x0000000000000000000000000000000000000000000000000000000000000001'],
            '0x',
          )

          orderArray[i] = await OrderHelper.encodeOrder(
            await GnosisEasyAuction.numUsers(),
            buyAmount,
            sellAmount,
          )
        }

        auctionEndDt = (await GnosisEasyAuction.auctionData(38))[3].sub(BigNumber.from(await timestamp()))

        await minewait(auctionEndDt.toNumber())

        await GnosisEasyAuction.settleAuction(38)

        expect(await WETH.balanceOf(TornadoAuctionHandler.address)).to.be.gt(initialHandlerBalance)

        for (let i = 0; i < signerArray.length; i++) {
          await GnosisEasyAuction.claimFromParticipantOrder(38, [orderArray[i]])
          console.log(
            `Signer ${i} claimed: `,
            (await TornToken.balanceOf(signerArray[i].address)).toString(),
            ' torn',
          )
        }

        claimedSum = BigNumber.from(0)

        for (let i = 0; i < signerArray.length; i++) {
          const claimed = await TornToken.balanceOf(signerArray[i].address)
          claimedSum = claimedSum.add(claimed)
        }

        expect(claimedSum).to.be.closeTo(
          ethers.utils.parseEther('100'),
          ethers.utils.parseUnits('1', 'szabo'),
        )

        /// Now revert and test with below funding
        await sendr('evm_revert', [snapshotIdArray[2]])
        snapshotIdArray[2] = await sendr('evm_snapshot', [])

        for (let i = 0; i < signerArray.length; i++) {
          const bidder = signerArray[i]

          WETH = await WETH.connect(bidder)
          await expect(() => WETH.deposit({ value: pE(100) })).to.changeEtherBalance(
            bidder,
            BigNumber.from(0).sub(pE(100)),
          )

          const buyAmount = pE(0.5)
          const sellAmount = pE(0.03 + i / 100)

          await WETH.approve(GnosisEasyAuction.address, sellAmount)

          GnosisEasyAuction = await GnosisEasyAuction.connect(bidder)

          await GnosisEasyAuction.placeSellOrders(
            38,
            [buyAmount],
            [sellAmount],
            ['0x0000000000000000000000000000000000000000000000000000000000000001'],
            '0x',
          )

          orderArray[i] = await OrderHelper.encodeOrder(
            await GnosisEasyAuction.numUsers(),
            buyAmount,
            sellAmount,
          )
        }

        auctionEndDt = (await GnosisEasyAuction.auctionData(38))[3].sub(BigNumber.from(await timestamp()))

        await minewait(auctionEndDt.toNumber())

        await GnosisEasyAuction.settleAuction(38)

        for (let i = 0; i < signerArray.length; i++) {
          await GnosisEasyAuction.claimFromParticipantOrder(38, [orderArray[i]])
          console.log(
            `Signer ${i} claimed: `,
            (await TornToken.balanceOf(signerArray[i].address)).toString(),
            ' torn',
          )
        }

        expect(await TornToken.balanceOf(TornadoAuctionHandler.address)).to.equal(
          ethers.utils.parseEther('100'),
        )
      })

      it('Test multiple accounts proposal', async function () {
        let checkIfQuorumFulfilled = async function (proposalId) {
          const proposalData = await GovernanceContract.proposals(proposalId)
          const allVotes = proposalData[4].add(proposalData[5])
          return allVotes.gte(quorumVotes)
        }

        ProposalContract = await MockProposalFactory.deploy()

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

        snapshotIdArray[3] = await sendr('evm_snapshot', [])

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

        await sendr('evm_revert', [snapshotIdArray[3]])

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
  })

  after(async function () {
    await ethers.provider.send('hardhat_reset', [
      {
        forking: {
          jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_KEY_MAINNET}`,
          blockNumber: process.env.use_latest_block == 'true' ? undefined : 13211966,
        },
      },
    ])
  })
})
