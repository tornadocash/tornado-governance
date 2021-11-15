// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;

contract Dummy {
  uint256 public value;
  string public text;

  function initialize() public {
    value = 1;
    text = "dummy";
  }

  // function update(address _impl) public {
  //     MyProxy(address(uint160(address(this)))).upgradeTo(_impl);
  //     // MyProxy(address(this)).upgradeTo(_impl);
  // }
}

contract DummySecond {
  uint256 public value;
  string public text;

  function initialize() public {
    value = 2;
    text = "dummy2";
  }

  // function update(address _impl) public {
  //     MyProxy(address(uint160(address(this)))).upgradeTo(_impl);
  // }
}
