// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

import "../Governance.sol";

contract MockGovernance is Governance {
  uint256 public time = block.timestamp;

  function setTimestamp(uint256 time_) public {
    time = time_;
  }

  function getBlockTimestamp() internal view override returns (uint256) {
    // solium-disable-next-line security/no-block-members
    return time;
  }

  function setTorn(address torna) external {
    torn = TORN(torna);
  }

  function resolve(bytes32 addr) public view override returns (address) {
    return address(uint160(uint256(addr) >> (12 * 8)));
  }
}
