# Tornado Governance Changes

Governance proposal [repo]().

## Governance Vault Upgrade (GovernanceVaultUpgrade.sol)

`GovernanceVaultUpgrade` is the first major upgrade to tornado governance. This upgrade introduces new logic which is used to communicate with `TornVault` from the governance contract. The motivation behind this upgrade:

- split DAO member locked TORN from vesting locked TORN.
- block Governance from being able to interact with user TORN.

To solve point 1 of the formerly stated problems, and to reduce the logic bloat of the lock and unlock functionalities, we have opted for calculating the amount of user TORN locked in the governance contract. The calculations and explanations may be found [here](https://github.com/h-ivor/tornado-lottery-period/blob/final_with_auction/scripts/balance_estimation.md).

### Additions and changes

| Function/variable signature        | is addition or change? | describe significance                                                                                                                                                                             |
| ---------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_transferTokens(address,uint256)` | change                 | instead of transferring to the governance contract, funds are now transferred to the torn vault with a `transferFrom` call, this has an effect on both the `lock` and `lockWithApproval` function |
| `unlock(uint256)`                  | change                 | unlock now triggers `withdrawTorn(address,uint256)` within the vault which reverts on an unsuccessful transfer (safeTransfer)                                                                     |
| `version`                          | addition               | tells current version of governance contract                                                                                                                                                      |
| `address immutable userVault`      | addition               | address of the deployed vault                                                                                                                                                                     |

### Tornado Vault (TornadoVault.sol)

The compliment to the above upgrade. Stores user TORN, does not keep records of it. Serves exclusively for deposits and withdrawals. Works in effect as personal store of TORN for a user with the balance being user for voting. Locking mechanisms are still in effect.

| Function/variable signature     | describe significance                               |
| ------------------------------- | --------------------------------------------------- |
| `withdrawTorn(address,uint256)` | used for withdrawing TORN balance to users' account |
