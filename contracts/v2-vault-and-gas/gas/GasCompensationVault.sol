// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import { EtherSend } from "../libraries/EtherSend.sol";

interface IPayableGovernance {
  function receiveEther() external payable returns (bool);
}

/**
 * @notice this contract should store ether for gas compensations and also retrieve the basefee
 * */
contract GasCompensationVault {
  using EtherSend for address;

  address private constant GovernanceAddress = 0x5efda50f22d34F262c29268506C5Fa42cB56A1Ce;

  modifier onlyGovernance() {
    require(msg.sender == GovernanceAddress, "only gov");
    _;
  }

  /**
   * @notice function to compensate gas by sending amount eth to a recipient
   * @param recipient address to receive amount eth
   * @param gasAmount the amount of gas to be compensated
   * */
  function compensateGas(address recipient, uint256 gasAmount) external onlyGovernance {
    uint256 vaultBalance = address(this).balance;
    uint256 toCompensate = gasAmount * block.basefee;
    if (vaultBalance == 0) return;
    payable(recipient).send((toCompensate > vaultBalance) ? vaultBalance : toCompensate);
  }

  /**
   * @notice function to withdraw compensate eth back to governance
   * @param amount the amount of eth to withdraw back to governance
   * */
  function withdrawToGovernance(uint256 amount) external onlyGovernance {
    uint256 vaultBalance = address(this).balance;
    require(GovernanceAddress.sendEther((amount > vaultBalance) ? vaultBalance : amount), "pay fail");
  }

  /**
   * @notice receive ether function, does nothing but receive ether
   * */
  receive() external payable {}
}
