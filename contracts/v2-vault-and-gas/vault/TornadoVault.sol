// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

/// @title Vault which holds user funds
contract TornadoVault {
  using SafeERC20 for IERC20;

  address internal constant TornTokenAddress = 0x77777FeDdddFfC19Ff86DB637967013e6C6A116C;
  address internal constant GovernanceAddress = 0x5efda50f22d34F262c29268506C5Fa42cB56A1Ce;

  /// @notice withdraws TORN from the contract
  /// @param amount amount to withdraw
  function withdrawTorn(address recipient, uint256 amount) external {
    require(msg.sender == GovernanceAddress, "only gov");
    IERC20(TornTokenAddress).safeTransfer(recipient, amount);
  }
}
