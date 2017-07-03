pragma solidity ^0.4.8;

library Data {
    
  struct LockBox {
    address creator; 
    address receiver;
    uint amount; 
    bytes32 hash1; 
    bytes32 hash2;
    uint creationTime;
    bool active;
    uint index;        
  }        

  struct LockBoxes { 
      mapping(bytes32 => LockBox) boxes; 
  } 
  
  struct LockBoxIndex { 
      bytes32[] boxIndex; 
  }

  function boxExists(LockBoxes storage s1, LockBoxIndex storage s2, bytes32 lockBoxKey)
    public
    constant 
    returns (bool exists)
    {
        if(s2.boxIndex.length == 0) return false; 
        return (s2.boxIndex[s1.boxes[lockBoxKey].index] == lockBoxKey);
    }

  function insert(
      LockBoxes storage s1, 
      LockBoxIndex storage s2,
      address _receiver,
      address _creator,
      uint _amount, 
      bytes32 _password1, 
      bytes32 _password2)
      public
      returns (bool)
  {
      bytes32 lockBoxKey = keccak256(_password1,_password2);
      if (s1.boxes[lockBoxKey].active)
           return false;
      s1.boxes[lockBoxKey] = LockBox({
          creator: _creator, 
          receiver: _receiver,
          amount: _amount, 
          hash1: _password1, 
          hash2: _password2, 
          creationTime: now, 
          active: true, 
          index: s2.boxIndex.push(lockBoxKey) - 1
      });
      return true;
  }  
}