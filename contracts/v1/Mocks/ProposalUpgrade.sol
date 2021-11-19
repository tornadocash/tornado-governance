// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

import "./MockGovernance.sol";

interface IProxy {
  function upgradeTo(address newImplementation) external;
}

contract NewImplementation is MockGovernance {
  uint256 public newVariable;
  event Overriden(uint256 x);

  function execute(uint256 proposalId) public payable override {
    newVariable = 999;
    emit Overriden(proposalId);
  }
}

contract ProposalUpgrade {
  address public immutable newLogic;

  constructor(address _newLogic) public {
    newLogic = _newLogic;
  }

  function executeProposal() public {
    IProxy(address(this)).upgradeTo(newLogic);
  }
}
