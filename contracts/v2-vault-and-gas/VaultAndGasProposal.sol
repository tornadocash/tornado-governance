// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { LoopbackProxy } from "tornado-governance/contracts/LoopbackProxy.sol";

import { TornadoVault } from "./vault/TornadoVault.sol";
import { TornadoAuctionHandler } from "./auction/TornadoAuctionHandler.sol";
import { GovernanceGasUpgrade } from "./gas/GovernanceGasUpgrade.sol";

import { IGovernanceVesting } from "./interfaces/IGovernanceVesting.sol";
import { ImmutableGovernanceInformation } from "./ImmutableGovernanceInformation.sol";

/**
 * @notice This proposal should upgrade governance to the vault and gas version without breaking any logic.
 * */
contract VaultAndGasProposal is ImmutableGovernanceInformation {
  using SafeMath for uint256;

  IGovernanceVesting public constant GovernanceVesting = IGovernanceVesting(0x179f48C78f57A3A78f0608cC9197B8972921d1D2);
  address public immutable gasCompLogic;
  /// @notice the new voting period we would like to include
  uint256 public immutable votingPeriod;

  event TornadoAuctionHandlerCreated(address indexed handler);

  constructor(address _gasCompLogic, uint256 _votingPeriod) public {
    gasCompLogic = _gasCompLogic;
    votingPeriod = _votingPeriod;
  }

  /// @notice the entry point for the governance upgrade logic execution
  /// @dev this function bundles all of the initialization logic for all of the contracts of the project
  function executeProposal() external {
    address vault = address(new TornadoVault());

    LoopbackProxy(returnPayableGovernance()).upgradeTo(address(new GovernanceGasUpgrade(gasCompLogic, vault)));

    GovernanceGasUpgrade newGovernance = GovernanceGasUpgrade(returnPayableGovernance());
    IERC20 tornToken = IERC20(TornTokenAddress);

    newGovernance.setVotingPeriod(votingPeriod);

    /**
    The below variable holds the total amount of TORN outflows from all of the proposal executions,
    which will be used to calculate the proper amount of TORN for transfer to Governance.
    For an explanation as to how this variable has been calculated with these fix values, please look at:
    https://github.com/h-ivor/tornado-lottery-period/blob/production/scripts/balance_estimation.md
    */
    uint256 totalOutflowsOfProposalExecutions = 120000000000000000000000 +
      22916666666666666666666 +
      54999999999999969408000 -
      27e18;

    require(
      tornToken.transfer(
        address(newGovernance.userVault()),
        (tornToken.balanceOf(address(this))).sub(GovernanceVesting.released().sub(totalOutflowsOfProposalExecutions))
      ),
      "TORN: transfer failed"
    );

    uint96 amountOfTornToAuctionOff = 787 ether;
    uint96 minBuyAmount = 11 ether;
    uint256 minBidInTorn = 10 ether;
    uint256 fundingThreshold = 9 ether;

    TornadoAuctionHandler auctionHandler = new TornadoAuctionHandler();

    emit TornadoAuctionHandlerCreated(address(auctionHandler));

    tornToken.transfer(address(auctionHandler), amountOfTornToAuctionOff);

    /**
    As with above, please see:
    https://github.com/h-ivor/tornado-lottery-period/blob/production/contracts/auction/TornadoAuctionHandler.sol
    */
    auctionHandler.initializeAuction(
      block.timestamp + 5 days,
      amountOfTornToAuctionOff,
      minBuyAmount,
      minBidInTorn,
      fundingThreshold
    );
  }
}
