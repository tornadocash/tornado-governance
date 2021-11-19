// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

interface IGovernanceMultisigAddress {
  function returnMultisigAddress() external pure returns (address);
}

/**
 * @notice Contract which hold governance information. Useful for avoiding code duplication.
 * */
contract ImmutableGovernanceInformation {
  address internal constant GovernanceAddress = 0x5efda50f22d34F262c29268506C5Fa42cB56A1Ce;
  address internal constant TornTokenAddress = 0x77777FeDdddFfC19Ff86DB637967013e6C6A116C;

  modifier onlyGovernance() {
    require(msg.sender == GovernanceAddress, "only governance");
    _;
  }

  /**
   * @dev this modifier calls the pure governance returnMultisigAddress() function,
   *      if governance version is not -> vault-and-gas upgrade <= version
   *      then this will not work!
   */
  modifier onlyMultisig() {
    require(msg.sender == IGovernanceMultisigAddress(GovernanceAddress).returnMultisigAddress(), "only multisig");
    _;
  }

  /**
   * @notice Function to return a payable version of the governance address.
   * @return payable version of the address
   * */
  function returnPayableGovernance() internal pure returns (address payable) {
    return payable(GovernanceAddress);
  }
}
