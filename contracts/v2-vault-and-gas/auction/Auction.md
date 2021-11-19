# Auctioning some Tornado for compensations ETH

To boost voting activity, one of our ideas is to compensate gas used for voting on proposals.
Both for the castVote and castDelegatedVote functionality.

To make this as smooth as possible, we will compensate users directly in **ETH** (non-wrapped) for voting.
The priority fee is not compensated for, as to make exploiting the compensations unnecessary and unprofitable.

In order to receive ETH, TORN will be auctioned off by the governance contract with the help of a auction helper
(see contracts/auction/TornadoAuctionHandler.sol).

This contract has two functionalities:

- Initiate an auction.

- Convert all WETH it holds into ETH and send to Governance (callable by anyone).

This way, Governance does not need to handle WETH swap logic (would require extra logic) and ETH will be directly sent to the governance contract.

The initializeAuction function takes a couple of parameters:

```
function initializeAuction(
    uint256 _auctionEndDate,
    uint96 _auctionedSellAmount,
    uint96 _minBuyAmount,
    uint256 _minBidPerOrder,
    uint256 _minFundingThreshold
  ) external onlyGovernance {
```

- \_auctionEndDate -> the auction end date expressed in UNIX format.
- \_auctionedSellAmount -> the amount of TORN to be sold in the auction.
- \_minBuyAmount -> this variable helps to define the minimum price via the following formula: \_auctionedSellAmount/\_minBuyAmount, in other words the minimum amount of TORN per ETH.
- \_minBidPerOrder -> minimum buy amount per a single order (of tokens being auctioned), is also used to prevent users from buying too low amounts and hurting themselves.
- \_minFundingThreshold -> minimum amount of buy tokens (ETH) for the ENTIRE auction. If this is not reached, the auction reverts and all tokens are sent back to their original owners.

This function does not take all the parameters for initializing the auction, the entire function may be seen below, some were left out of convenience:

```
IEasyAuction(EasyAuctionAddress).initiateAuction(
      IERC20(TornTokenAddress),
      IERC20(WETHAddress),
      0, // orderCancellationEndDate
      _auctionEndDate,
      _auctionedSellAmount,
      _minBuyAmount,
      _minBidPerOrder,
      _minFundingThreshold,
      true, // isAtomicClosureAllowed
      address(0x0000000000000000000000000000000000000000), // access
      new bytes(0) // access
    );
```

- Addresses of the tokens being bought/sold (ETH/TORN).
- orderCancellationEndDate -> date until order can be cancelled. For us, this is 0, meaning orders can't be cancelled once set.
- isAtomicClosureAllowed -> when auction end date is reached, a participant may set a last order in exchange for closing the auction, meaning it incentivizes the user to end the auction (gas payments, time saving) by giving him a risk-free action at the end. For us, false, due to tests showing that dust collection might not work if this is used.
- Last two fields are for access management, we have no whitelist for the auction, thus redundant and set to 0 for us.
