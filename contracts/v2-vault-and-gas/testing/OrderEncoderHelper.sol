// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import { IterableOrderedOrderSet } from "@gnosis.pm/ido-contracts/contracts/libraries/IterableOrderedOrderSet.sol";

contract OrderEncoderHelper {
  function encodeOrder(
    uint64 userId,
    uint96 buyAmount,
    uint96 sellAmount
  ) external pure returns (bytes32) {
    return IterableOrderedOrderSet.encodeOrder(userId, buyAmount, sellAmount);
  }
}
