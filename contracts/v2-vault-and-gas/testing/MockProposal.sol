// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import "../../v1/Governance.sol";

contract MockProposal {
  address public constant GovernanceAddress = 0x5efda50f22d34F262c29268506C5Fa42cB56A1Ce;

  function executeProposal() external {
    Governance gov = Governance(GovernanceAddress);

    gov.setVotingPeriod(27000);
    require(gov.VOTING_PERIOD() == 27000, "Voting period change failed!");
  }
}
