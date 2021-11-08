// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

interface IPayableGovernance {
  function receiveEther() external payable returns (bool);
}
