/* global ethers, network */

async function setTime(timestamp) {
  await ethers.provider.send('evm_setNextBlockTimestamp', [timestamp])
}

async function takeSnapshot() {
  return await ethers.provider.send('evm_snapshot', [])
}

async function revertSnapshot(id) {
  await ethers.provider.send('evm_revert', [id])
}

async function advanceTime(sec) {
  const now = (await ethers.provider.getBlock('latest')).timestamp
  await setTime(now + sec)
}

async function getSignerFromAddress(address) {
  await network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [address],
  })

  let signer = await ethers.provider.getSigner(address)
  signer.address = signer._address
  return signer
}

module.exports = {
  setTime,
  advanceTime,
  takeSnapshot,
  revertSnapshot,
  getSignerFromAddress,
}
