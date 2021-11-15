// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;

import "./Dummy.sol";

contract Proposal {
  // bytes32 public constant WEIRD = keccak256("Hey Proposal");
  // uint256 public someValue = 111;
  // Dummy public dummyInstance;
  event Debug(address output);

  function executeProposal() public {
    // someValue = 321;
    Dummy dummyInstance = new Dummy();
    dummyInstance.initialize();
    emit Debug(address(dummyInstance));
  }
}
