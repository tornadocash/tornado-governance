// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

import "torn-token/contracts/mocks/TORNMock.sol";

struct Recipient2 {
  address to;
  uint256 amount;
}

contract TORNMock2 is TORNMock {
  constructor(
    address _governance,
    uint256 _pausePeriod,
    Recipient2[] memory vesting
  ) public TORNMock(solve(_governance), _pausePeriod, solve2(vesting)) {}

  function solve(address x) private returns (bytes32) {
    return bytes32(uint256(x) << 96);
  }

  function solve2(Recipient2[] memory vesting) private returns (Recipient[] memory) {
    Recipient[] memory realVesting = new Recipient[](vesting.length);
    for (uint256 i = 0; i < vesting.length; i++) {
      realVesting[i].to = solve(vesting[i].to);
      realVesting[i].amount = vesting[i].amount;
    }
    return realVesting;
  }
}
