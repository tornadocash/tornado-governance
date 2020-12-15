# Tornado.Cash Governance [![Build Status](https://github.com/tornadocash/tornado-governance/workflows/build/badge.svg)](https://github.com/tornadocash/tornado-governance/actions) [![npm](https://img.shields.io/npm/v/tornado-governance)](https://www.npmjs.com/package/tornado-governance)

Usage:

```
yarn
cp .env.example .env
yarn test
```

## How to upgrade implementation

1. Make sure once you deploy new Governance implementation, call `initialize` methods right after it.
