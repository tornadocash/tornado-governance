// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12 || ^0.8.7;

/// @notice very short library which implements a method to transfer ether via <address>.call
library EtherSend {
  /**
   * @notice function to transfer ether via filling the value field of a call
   * @dev DICLAIMER: you must handle the possibility of reentrancy when using this function!!!
   * @param to address to be transferred to
   * @param amount amount to be transferred
   * @return success true if transfer successful
   * */
  function sendEther(address to, uint256 amount) internal returns (bool success) {
    (success, ) = payable(to).call{ value: amount }("");
  }
}
