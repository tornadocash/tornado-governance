# Tornado Relayer Registry

Governance proposal [repo](https://github.com/Rezan-vm/tornado-relayer-registry).

Governance upgrade which includes a registry for relayer registration and staking mechanisms for the TORN token.

## Overview

1. Anyone can become a relayer by staking TORN into Registry contract.
2. Minimum stake is governed by the Governance.
3. Each Pool has its own fee % which is also set by the Governance.
4. On every withdrawal via relayer, the relayer has to pay the Tornado Pool fee in TORN. The fee is deducted from his staked balance.
5. All collected fees are stored into StakingReward contract.
6. Any TORN holder can stake their TORN into Governance contract like they were before, but earning fees proportionately to their stake.
