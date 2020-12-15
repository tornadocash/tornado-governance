#!/bin/bash
npx truffle-flattener contracts/Governance.sol > flats/Governance_flat.sol
npx truffle-flattener contracts/LoopbackProxy.sol > flats/MyProxy_flat.sol
