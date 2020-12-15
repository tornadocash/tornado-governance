//SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

import "./MockGovernance.sol";

interface IProxy {
  function upgradeTo(address newImplementation) external;
}

contract NewImplementation is MockGovernance {
  uint256 public newVariable;
  event Overriden(uint256 x);

  function execute(uint256 proposalId) public override payable {
    newVariable = 999;
    emit Overriden(proposalId);
  }
}

contract ProposalUpgrade {
  function executeProposal() public {
    IProxy(address(this)).upgradeTo(0xF7E3e47e06F1bDDecb1b2F3a7F60b6b25fd2e233);
  }
}
