// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;

interface IGovernance {
  function setExecutionDelay(uint256 delay) external;
}

contract ProposalStateChangeGovernance {
  function executeProposal() public {
    IGovernance(address(this)).setExecutionDelay(3 days);
  }
}
