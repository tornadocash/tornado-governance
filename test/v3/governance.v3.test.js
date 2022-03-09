const { ethers } = require('hardhat')
const { expect } = require('chai')

const config = require('../../config')
const { getSignerFromAddress, takeSnapshot, revertSnapshot } = require('../utils')

describe('V3 governance tests', () => {
  let snapshotId

  //// CONTRACTS
  let torn = config.TORN
  let gov

  //// IMPERSONATED ACCOUNTS
  let tornWhale

  //// HELPER FN
  let getToken = async (tokenAddress) => {
    return await ethers.getContractAt('@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20', tokenAddress)
  }

  before(async function () {
    tornWhale = await getSignerFromAddress(config.tornWhale)

    gov = (await ethers.getContractAt('GovernanceStakingUpgrade', config.governance)).connect(tornWhale)

    snapshotId = await takeSnapshot()
  })

  describe('#lock functionality', () => {
    it('should be able to lock/unlock torn in governance', async () => {
      const [sender] = await ethers.getSigners()
      const value = ethers.utils.parseEther('1000')

      const tornToken = await (await getToken(torn)).connect(tornWhale)
      await tornToken.transfer(sender.address, value)
      await tornToken.connect(sender).approve(gov.address, value)

      const ethBalanceBeforeLock = await ethers.provider.getBalance(sender.address)
      const tokenBalanceBeforeLock = await tornToken.balanceOf(sender.address)
      let tx = await gov.connect(sender).lockWithApproval(value)

      let receipt = await tx.wait()
      let txFee = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)
      const ethBalanceAfterLock = await ethers.provider.getBalance(sender.address)
      const tokenBalanceAfterLock = await tornToken.balanceOf(sender.address)
      expect(ethBalanceAfterLock).to.be.equal(ethBalanceBeforeLock.sub(txFee))
      expect(tokenBalanceAfterLock).to.be.equal(tokenBalanceBeforeLock.sub(value))

      const lockedBalanceAfterLock = await gov.lockedBalance(sender.address)
      expect(lockedBalanceAfterLock).to.be.equal(value)

      tx = await gov.connect(sender).unlock(value)

      receipt = await tx.wait()
      txFee = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)
      const ethBalanceAfterUnlock = await ethers.provider.getBalance(sender.address)
      const tokenBalanceAfterUnlock = await tornToken.balanceOf(sender.address)
      expect(ethBalanceAfterUnlock).to.be.equal(ethBalanceAfterLock.sub(txFee))
      expect(tokenBalanceAfterUnlock).to.be.equal(tokenBalanceBeforeLock)

      const lockedBalanceAfterUnlock = await gov.lockedBalance(sender.address)
      expect(lockedBalanceAfterUnlock).to.be.equal(0)
    })
  })

  afterEach(async () => {
    await revertSnapshot(snapshotId)
    snapshotId = await takeSnapshot()
  })
})
