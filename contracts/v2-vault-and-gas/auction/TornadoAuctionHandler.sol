// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { IWETH } from "./interfaces/IWETH.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { EtherSend } from "../libraries/EtherSend.sol";
import { IEasyAuction } from "./interfaces/IEasyAuction.sol";
import { ImmutableGovernanceInformation } from "../ImmutableGovernanceInformation.sol";

/// @notice Handler which should help governance start an auction and transfer results of an auction to governance.
/// @dev The reasoning behind this contract is to not bloat governance with unnecessary logic.
contract TornadoAuctionHandler is ImmutableGovernanceInformation {
  using EtherSend for address;

  address public constant EasyAuctionAddress = 0x0b7fFc1f4AD541A4Ed16b40D8c37f0929158D101;
  address public constant WETHAddress = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  /// @notice main auction initialization function, please see: https://github.com/h-ivor/tornado-lottery-period/blob/only-vault-and-gas/contracts/auction/Auction.md
  /// @dev calls easy auction deployed on eth mainnet
  function initializeAuction(
    uint256 _auctionEndDate,
    uint96 _auctionedSellAmount,
    uint96 _minBuyAmount,
    uint256 _minBidPerOrder,
    uint256 _minFundingThreshold
  ) external onlyGovernance {
    require(IERC20(TornTokenAddress).balanceOf(address(this)) >= _auctionedSellAmount, "torn balance not enough");
    IERC20(TornTokenAddress).approve(EasyAuctionAddress, _auctionedSellAmount);

    IEasyAuction(EasyAuctionAddress).initiateAuction(
      IERC20(TornTokenAddress),
      IERC20(WETHAddress),
      0,
      _auctionEndDate,
      _auctionedSellAmount,
      _minBuyAmount,
      _minBidPerOrder,
      _minFundingThreshold,
      false,
      address(0x0000000000000000000000000000000000000000),
      new bytes(0)
    );
  }

  /// @notice function to transfer all eth and TORN dust to governance
  function convertAndTransferToGovernance() external {
    IWETH(WETHAddress).withdraw(IWETH(WETHAddress).balanceOf(address(this)));
    if (address(this).balance > 0) require(GovernanceAddress.sendEther(address(this).balance), "pay fail");
    if (IERC20(TornTokenAddress).balanceOf(address(this)) > 0)
      IERC20(TornTokenAddress).transfer(GovernanceAddress, IERC20(TornTokenAddress).balanceOf(address(this)));
  }

  /// @notice receive eth that should only allow mainnet WETH to send eth
  receive() external payable {
    require(msg.sender == WETHAddress, "only weth");
  }
}
