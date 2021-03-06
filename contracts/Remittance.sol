pragma solidity ^0.4.8;

import "./Owned.sol";
import "./Data.sol";
import "./Util.sol"; 

contract Remittance is Owned {
    Data.LockBoxes lockBox; 
    Data.LockBoxIndex lockBoxIndex;
    
    mapping (address => uint) private pendingWithdrawals; 

    bool private locked; 
    uint private totalAmountInHolding;
    uint private totalAmountOnDeposit;    
    uint private totalAmountFees; 
    uint public ownerFee = 100000 wei;
    uint public deadline = 6 days;
    uint public deadlineLimit = 2 weeks;
    bool public stopped = false; 
    
    event LogLockBoxCreated(address indexed receiver, uint indexed amount, bytes32 indexed lockBoxKey, bool result);
    event LogFundsUnlocked(address indexed account, uint indexed amount, bool indexed result);
    event LogWithdrawal(address indexed payee, uint indexed amount, bool indexed result);
    event LogDeposit(address indexed account, uint indexed amount);
    
    modifier boxExists(bytes32 _lockBoxKey) 
    {
        if(!Data.boxExists(lockBox, lockBoxIndex, _lockBoxKey)) throw; 
        _;
    }

    modifier authenticate(string _password1, string _password2, bytes32 lockBoxKey)
    {

        if(!Util.authenticate(
            _password1, 
            _password2, 
            lockBox.boxes[lockBoxKey].hash1, 
            lockBox.boxes[lockBoxKey].hash2)) throw;    
             _;                
    }

    modifier onlyBy(address _account)
    {
        if(msg.sender != _account) throw; 
        _;
    }

    modifier onlyAfterDeadline(uint _creationTime)
    {
        if(now < _creationTime + deadline) throw;
        _;
    }

    modifier onlyBeforeDeadline(uint _creationTime)
    {
        if(now > (_creationTime + deadline)) throw;
        _;
    }    

    modifier stopInEmergency 
    { 
        if(stopped) throw;
        _; 
    }

    modifier onlyInEmergency 
    { 
        if(stopped) 
        _; 
    }

    function Remittance() 
    {

    }

    function createLockBox(
        address _receiver,
        bytes32 _password1, 
        bytes32 _password2)   
        stopInEmergency      
        payable
        public 
        returns (bool)
    {
        uint amount = msg.value - ownerFee;         

        if(Data.insert(lockBox, lockBoxIndex, _receiver, msg.sender, amount, _password1, _password2))
        {
            LogLockBoxCreated(_receiver, amount, getKey(_password1, _password2), true);
            totalAmountInHolding += msg.value;
            depositFee(ownerFee);
            return true;
        } 
        else 
        {
            LogLockBoxCreated(_receiver, amount, 0x0, false);
            throw;
        }
    }    
  
    function getLockBox(bytes32 _lockBoxKey) 
        public 
        constant
        returns (address creator, 
                 address receiver,
                 uint amount, 
                 uint creationTime,
                 bool active, 
                 uint index) 
    {
        Data.LockBox memory box; 
        box = lockBox.boxes[_lockBoxKey];
        return (
        box.creator, 
        box.receiver, 
        box.amount, 
        box.creationTime,
        box.active, 
        box.index
        );
    }   

    function getLockBoxCount() 
        public 
        constant 
        returns (uint count)
    {
        return lockBoxIndex.boxIndex.length; 
    }

    function getLockBoxKeyAtIndex(uint index)
        public 
        constant
        returns(bytes32 lockBoxKey)
    {
        return lockBoxIndex.boxIndex[index];
    }


    function unlockFunds(bytes32 _lockBoxKey, address _beneficiary) 
        private
        returns (bool)
    {
        if(!locked)
        {
            locked = true; 
            uint amtToDeposit;

            amtToDeposit = lockBox.boxes[_lockBoxKey].amount; 
            lockBox.boxes[_lockBoxKey].amount = 0; 
            lockBox.boxes[_lockBoxKey].active = false; 
            totalAmountInHolding -= amtToDeposit;
            deposit(_beneficiary, amtToDeposit); 
                     
            locked = false;             
            if(this.balance < totalAmountInHolding) throw;
            LogFundsUnlocked(_beneficiary, amtToDeposit, true);

            return true;
        }
        throw; 
    }

    function claimFunds(string password1, string password2, bytes32 lockBoxKey)      
        onlyBy(lockBox.boxes[lockBoxKey].receiver)
        authenticate(password1, password2, lockBoxKey)     
        boxExists(lockBoxKey)
        onlyBeforeDeadline(lockBox.boxes[lockBoxKey].creationTime)     
        stopInEmergency     
        public
        returns (bool)
    {
        return unlockFunds(lockBoxKey, msg.sender);
    }

    function reclaimFunds(bytes32 lockBoxKey) 
        boxExists(lockBoxKey)
        onlyAfterDeadline(lockBox.boxes[lockBoxKey].creationTime)
        stopInEmergency
        public
        returns (bool)
    {
        return unlockFunds(lockBoxKey, msg.sender);
    }
    
    function getBalance(address account) 
        public 
        constant 
        returns (uint balance)
    {
        return pendingWithdrawals[account];
    }

    function withdraw(uint amount) 
        stopInEmergency
        public 
        returns (bool)
    {
        if(!locked && amount > 0 && pendingWithdrawals[msg.sender] >= amount)
        {
            locked = true; 
            pendingWithdrawals[msg.sender] -= amount;
            totalAmountOnDeposit -= amount; 

            if(!msg.sender.send(amount))
            {
                pendingWithdrawals[msg.sender] += amount;
                totalAmountOnDeposit += amount;                
                locked = false; 
                LogWithdrawal(msg.sender, amount, false);
                return false;
            }
                        
            locked = false; 
            if(this.balance < totalAmountOnDeposit) throw;
            LogWithdrawal(msg.sender, amount, true);

            return true;
        }
        throw;
    }   

    function deposit(address _account, uint _deposit) 
        private
    {
        pendingWithdrawals[_account] += _deposit;
        totalAmountOnDeposit += _deposit;
        LogDeposit(_account, _deposit);
    }

    function depositFee(uint _deposit)
        private
    {
        totalAmountFees += _deposit;
    }

    function withdrawFees() 
        fromOwner
        stopInEmergency
        public
    {
        totalAmountFees = 0;
        if(!owner.send(totalAmountFees)) throw;
    }

    function getCollectedFeeAmount()   
        fromOwner      
        public 
        constant
        returns (uint)
    {        
        return totalAmountFees;
    }

    function setOwnerFee(uint _fee) 
        fromOwner 
        stopInEmergency
        public 
        returns(uint)
    {
        ownerFee = _fee;
        return ownerFee;            
    }       

    function setDeadline(uint _timeInSeconds) 
        fromOwner 
        stopInEmergency
        public 
        returns (bool) 
    {
        if(_timeInSeconds <= deadlineLimit)
        {
            deadline = _timeInSeconds; 
            return true;
        }
        throw;
    }
  
    function toggleContractActive() 
      fromOwner 
      public 
    {
        stopped = !stopped; 
    }

    function recoverBalance() 
        fromOwner
        onlyInEmergency
        public
        returns (bool)
    {
        if(owner.send(this.balance))
        {
            totalAmountFees = 0;                   
            return true;
        }
        throw;            
    }        

    function getKey(bytes32 _hash1, bytes32 _hash2) 
        public 
        constant 
        returns (bytes32)
    {
        return Util.createKey(_hash1, _hash2);
    }

    function killMe() 
        fromOwner
        public
    {
        selfdestruct(owner);      
    }

    function () 
    {
        throw;
    }    
}
