// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;

import "../LoopbackProxy.sol";

contract MockProxy is LoopbackProxy {
  constructor(address _logic, bytes memory _data) public payable LoopbackProxy(_logic, _data) {}

  function resolve(bytes32 addr) public view override returns (address) {
    return address(uint160(uint256(addr) >> (12 * 8)));
  }
}
