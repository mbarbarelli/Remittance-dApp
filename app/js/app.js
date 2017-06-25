require("file-loader?name=../index.html!../index.html"); 
require("file-loader?name=../styles/remittance.css!../styles/remittance.css"); 
require("file-loader?name=../styles/bootstrap-duration-picker.css!../styles/bootstrap-duration-picker.css"); 

var ko = require("knockout"); 
const Web3 = require("web3"); 
const Promise = require("bluebird"); 
const truffleContract = require("truffle-contract"); 
const remittanceJson = require("../../build/contracts/Remittance.json"); 
var remittance_address;

if(typeof web3 !== 'undefined') {
    window.web3 = new Web3(web3.currentProvider);
} else {
    window.web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545")); 
}

require("./utils/utils.js"); 
require("./utils/bootstrap-duration-picker.js")

Promise.promisifyAll(web3.eth, {suffix: "Promise"}); 

const Remittance = truffleContract(remittanceJson);
Remittance.setProvider(web3.currentProvider); 
let rem; 

window.addEventListener('load', () => {
    return Remittance.deployed()
        .then(instance => {
            rem = instance;
            remittance_address = rem.contract.address;
            return web3.eth.getAccountsPromise();
        })
        .then(accounts => {
            if(accounts.length == 0){
                throw new Error("No accounts detected.");
            } else {                
                window.accounts = accounts; 
                window.owner = accounts[0]; 
             
                return Promise.all([
                    getContractBalance(),
                    getActiveState(),
                    getOwnerFee(),
                    getClaimDeadline(),
                    getLockBoxes(), 
                    getAccountData(),
                    getCollectedFeeAmount()
                ])  
                    .then(() => {
                        bindData();                        
                    })                                                  
            }                  
        })
        .catch(e => {
            window.error = e.message;
            console.log(e.message);
        });
});

const getOwnerFee = () => {
    window.ownerFee = 0; 
    return rem.ownerFee()
        .then(fee => {
            window.ownerFee = fee.valueOf();
        })
        .catch(e => {
            console.log(e.message);
        })
}

const getClaimDeadline = () => {
    window.claimDeadline = 0;
    return rem.deadline()
        .then(deadline => {
            window.claimDeadline = deadline.valueOf();
        })
}

const getContractBalance = () => {
    window.contractBalance = 0; 
    return web3.eth.getBalancePromise(remittance_address)
        .then(balance => {
            window.contractBalance = balance;
        })
        .catch(e => {
            console.log(e.message);
        });
}

const getActiveState = () => {
    window.stopped = false; 
    return rem.stopped()
        .then(stopped => {
            window.stopped = stopped;
        })
        .catch(e => {
            console.log(e.message);
        })
}

const getCollectedFeeAmount = () => {
    window.collectedFees = 0; 
    return rem.getCollectedFeeAmount.call( {from: owner })
        .then(fees => {
            window.collectedFees = fees.valueOf();
        })
        .catch(e => {
            console.log(e.message);
        })
}

const getAccountDataByAddress = (address) => {
    var contractBalance, accountBalance; 

    return web3.eth.getBalancePromise(address)
        .then(_accountBalance => {
            accountBalance = _accountBalance;
            return rem.getBalance.call(address)
        })
        .then(_contractBalance => {
            contractBalance = _contractBalance; 
            window.accountData.push({
                address: address, 
                contractBalance: contractBalance.valueOf(), 
                accountBalance: accountBalance.valueOf()
            });
        })
        .catch(e => {
            console.log(e.message);
        })
}

const getAccountData = () => {
    window.accountData = [];
    var promises = [];
    
    $.each(window.accounts, function( i, address ) {
        promises.push(getAccountDataByAddress(address))
    });       
    return Promise.all(promises)
}

const getLockBox = (index) => {
    var beneficiary; 
    return rem.getReceiverAtIndex.call(index)
        .then(receiver => {
            beneficiary = receiver; 
            return rem.getLockBox.call(beneficiary);
        })
        .then(lockBox => {
            window.lockBoxes.push({
                beneficiary: beneficiary, 
                creator: lockBox[0].valueOf(), 
                amount: lockBox[1].valueOf(),
                creationTime: lockBox[2].valueOf(),
                active: lockBox[3].valueOf(), 
                index: lockBox[4].valueOf()
            });
        });
}

const getLockBoxes = () => {   
    var promises = [];
    var lockBoxCount = 0; 
    window.lockBoxes = [];

    return rem.getLockBoxCount.call()
        .then(count => {
            lockBoxCount = count;
            for(var x = 0; x < lockBoxCount; x++) {
                promises.push(getLockBox(x))
            }
            return Promise.all(promises)
        })
        .catch(e => {
            window.error = e.message;
            console.log(e.message);
        });
}

const initDurationPicker = () => {
    $('#deadlineDuration').durationPicker({
      showSeconds: true, 
      onChanged: function (newVal) {        
        $('#duration-label').text(newVal);
      }
    });    
}

const formatBalance = (balance) => {
    return web3.fromWei(balance, "ether").toFixed(10);
}

const bindData = () => {
    function LockBoxData(data){
        this.creator = ko.observable(data.creator); 
        this.beneficiary = ko.observable(data.beneficiary); 
        this.amount = ko.observable(data.amount); 
        this.creationTime = ko.observable(Number(data.creationTime)); 
        this.active = ko.observable(data.active); 
        this.index = ko.observable(data.index); 
    }

    function AccountData(data){
        this.address = ko.observable(data.address);
        this.contractBalance = ko.observable(data.contractBalance);
        this.accountBalance = ko.observable(data.accountBalance);    
        this.accountBalanceETH = ko.computed(() => {
            return web3.fromWei(this.accountBalance(), "ether");
        });
    }

    function ViewModel() {
        var self = this; 
        self.menus = ['Create Lockbox', 'Claim Lockbox', 'Balances'];
        self.accounts = ko.observableArray(window.accounts); 
        self.claimDeadline = ko.observable(Number(window.claimDeadline));
        self.stopped = ko.observable(window.stopped);
        self.chosenMenu = ko.observable('Create Lockbox');
        self.accountData = ko.observableArray([]);
        self.lockBoxData = ko.observableArray([]);           
        self.updatedAccount = ko.observable("");
        self.ownerFee = ko.observable(Number(window.ownerFee));
        self.contractBalance = ko.observable(formatBalance(window.contractBalance));
        self.collectedFees = ko.observable(window.collectedFees);

        // Messages 
        self.settingSuccessMsg = ko.observable("");
        self.errorMsg = ko.observable("");
        self.loadMsg = ko.observable("");

        // lockbox creation input
        self.lockBoxAmount = ko.observable();
        self.lockBoxPassword1 = ko.observable("");
        self.lockBoxPassword2 = ko.observable("");

        self.lockBoxPassHash1 = ko.computed(() => {
            return web3.sha3(self.lockBoxPassword1());
        });

        self.lockBoxPassHash2 = ko.computed(() => {
            return web3.sha3(self.lockBoxPassword2());
        });

        self.lockBoxBeneficiary = ko.observable();
        self.lockBoxSender = ko.observable();

        // current lockbox to claim
        self.currentBeneficiary = ko.observable();
        self.currentAmount = ko.observable();
        self.currentSender = ko.observable();

        self.setCurrentBoxToClaim = (item) => {
            self.clearForm();
            self.currentBeneficiary(item.beneficiary());
            self.currentSender(item.creator());
            self.currentAmount("ETH: " + web3.fromWei(item.amount(), "ether"));
        }        
    
        self.goToMenuItem = (menu) => { 
            self.clearForm();
            self.chosenMenu(menu);
        }

        self.createLockBox = () => {
            self.loadMsg("Creating lockbox...")
            $('#mdlLoading').modal('show');  

            return rem.createLockBox.sendTransaction(self.lockBoxBeneficiary(), self.lockBoxPassHash1(), self.lockBoxPassHash2(), 
                { from: self.lockBoxSender(), value: self.lockBoxAmount(), gas: 300000})
                .then(txHash => {
                    return web3.eth.getTransactionReceiptMined(txHash);
                })
                .then(receipt => {
                    return getLockBoxes();                    
                })
                .then(() => {
                    self.lockBoxData(self.mapLockBoxes(window.lockBoxes.filter((i) => { return i.active == true; })));
                    $('#mdlLoading').modal('hide');
                    self.goToMenuItem('Claim Lockbox');
                    return Promise.all([
                        getContractBalance(),
                        getCollectedFeeAmount()
                    ]);
                })
                .then(() => {
                    self.contractBalance(formatBalance(window.contractBalance));
                    self.collectedFees(window.collectedFees);
                })
                .catch(e => {
                    $('#mdlLoading').modal('hide');
                    console.log(e.message);
                    self.errorMsg(e.message);
                })
        }

        self.claimLockBox = () => {
            $('#mdlClaimLockBox').modal('hide');
            self.loadMsg("Claiming lockbox funds...")
            $('#mdlLoading').modal('show');  

            return rem.claimFunds.sendTransaction(self.lockBoxPassword1().toString(), self.lockBoxPassword2().toString(), 
                { from: self.currentBeneficiary(), gas:300000 })
                .then(txHash => {
                    return web3.eth.getTransactionReceiptMined(txHash);
                })
                .then(receipt => {                    
                    return getLockBoxes();
                })
                .then(() => {
                    self.lockBoxData(self.mapLockBoxes(window.lockBoxes.filter((i) => { return i.active == true; })));    
                    return getAccountData();             
                })
                .then(() => {
                    self.accountData(self.mapAccountData(window.accountData));                    
                    $('#mdlLoading').modal('hide');
                    self.goToMenuItem('Balances');
                    self.updatedAccount(self.currentBeneficiary());
                })
                .catch(e => {
                    $('#mdlLoading').modal('hide');
                    console.log(e.message);
                    self.errorMsg(e.message);
                })
        }
   
        self.reclaimLockBox = (item) => {
            self.loadMsg("Reclaiming lockbox funds...")
            $('#mdlLoading').modal('show');         

            return rem.reclaimFunds.sendTransaction(item.beneficiary(), { from: item.creator(), gas: 300000})    
                .then(txnHash => {
                    return web3.eth.getTransactionReceiptMined(txnHash);
                })
                .then(receipt => {                    
                    return getLockBoxes();
                })
                .then(() => {
                    self.lockBoxData(self.mapLockBoxes(window.lockBoxes.filter((i) => { return i.active == true; })));   
                    return getAccountData(); 
                })
                .then(() => {
                    self.accountData(self.mapAccountData(window.accountData));  
                    $('#mdlLoading').modal('hide');
                    self.goToMenuItem('Balances'); 
                    self.updatedAccount(item.creator());                                       
                })
                .catch(e => {
                    $('#mdlLoading').modal('hide');
                    console.log(e.message);
                    self.errorMsg(e.message);
                });
        }    

        self.recoverContractBalance = () => {
            self.loadMsg("Recovering all contract funds...")
            $('#mdlLoading').modal('show');      

            return rem.recoverBalance.sendTransaction({ from: owner })     
                .then(txnHash => {
                    return web3.eth.getTransactionReceiptMined(txnHash);
                })
                .then(receipt => {                                        
                    return Promise.all([
                        getContractBalance(),
                        getCollectedFeeAmount(),
                        getLockBoxes(), 
                        getAccountData()
                    ]);                    
                })
                .then(() => {
                    $('#mdlLoading').modal('hide'); 
                    self.contractBalance(formatBalance(window.contractBalance));
                    self.collectedFees(window.collectedFees);
                    self.lockBoxData(self.mapLockBoxes(window.lockBoxes.filter((i) => { return i.active == true; }))); 
                    self.accountData(self.mapAccountData(window.accountData));  
                    self.goToMenuItem('Balances');
                    self.updatedAccount(owner);                    
                })
                .catch(e => {
                    $('#mdlLoading').modal('hide'); 
                    console.log(e.message);
                    self.errorMsg(e.message);
                })
        }

        self.withdrawCurrentAccount = (item) => {
            self.loadMsg("Withdrawing funds...")
            $('#mdlLoading').modal('show');    

            return rem.withdraw.sendTransaction(item.contractBalance(), { from: item.address() })      
                .then(txnHash => {
                    return web3.eth.getTransactionReceiptMined(txnHash);
                })   
                .then(receipt => {                          
                    return getAccountData();                 
                })
                .then(() => {
                    $('#mdlLoading').modal('hide');
                    self.accountData(self.mapAccountData(window.accountData)); 
                    self.updatedAccount(item.address());
                    return getContractBalance();
                })
                .then(() => {
                    self.contractBalance(formatBalance(window.contractBalance));
                })
                .catch(e => {
                    $('#mdlLoading').modal('hide');
                    console.log(e.message);
                    self.errorMsg(e.message);                    
                })
        }        

        self.setOwnerFee = () => {
            $('#mdlSettings').modal('hide');
            self.loadMsg("Setting new owner fee...")
            $('#mdlLoading').modal('show');   

            return rem.setOwnerFee.sendTransaction(self.ownerFee(), { from: owner })         
                .then(txnHash => {
                    return web3.eth.getTransactionReceiptMined(txnHash);
                })
                .then(receipt => {
                    return getOwnerFee();
                })
                .then(() => {
                    self.ownerFee(window.ownerFee)
                    setTimeout(() => {
                        $('#mdlLoading').modal('hide');
                    }, 1000);                    
                    setTimeout(() => {
                        $('#mdlSettings').modal('show');
                        self.settingSuccessMsg("Owner fee set to " + self.ownerFee());
                    }, 1700)                    
                })
                .catch(e => {
                    console.log(e.message);
                    self.errorMsg(e.message);
                })
        }

        self.toggleActive = () => {
            self.loadMsg("Stopping contract...")
            $('#mdlLoading').modal('show');  

            return rem.toggleContractActive.sendTransaction({ from: owner })
                .then(txnHash => {
                    return web3.eth.getTransactionReceiptMined(txnHash);
                })
                .then(receipt => {
                    return getActiveState();
                })
                .then(() => {
                    $('#mdlLoading').modal('hide');
                    self.stopped(window.stopped);
                })
                .catch(e => {
                    console.log(e.message);
                    self.errorMsg(e.message);
                })
        }

        self.setDurationDeadline = () => {
            $('#mdlSettings').modal('hide');
            self.loadMsg("Setting new deadline...")
            $('#mdlLoading').modal('show');        

            return rem.setDeadline.sendTransaction(Number(self.claimDeadline()), { from: owner })     
                .then(txnHash => {
                    return web3.eth.getTransactionReceiptMined(txnHash);
                })
                .then(receipt => {
                    return getClaimDeadline();
                })
                .then(() => {
                    self.claimDeadline(window.claimDeadline);
                    setTimeout(() => {
                        $('#mdlLoading').modal('hide');
                    }, 1000);                    
                    setTimeout(() => {
                        $('#mdlSettings').modal('show');
                        self.settingSuccessMsg("New deadline set.");
                    }, 1700)                       
                })
                .catch(e =>{
                    $('#mdlLoading').modal('hide');
                    console.log(e.message);
                    self.errorMsg(e.message);
                });
        }

        self.mapAccountData = (data) => {
            return $.map(data, function(item){ return new AccountData(item)});
        }

        self.mapLockBoxes = (data) => {
            return $.map(data, function(item){ return new LockBoxData(item)});
        }

        self.clearForm = () => {
            self.errorMsg("");
            self.loadMsg("");
            self.settingSuccessMsg("");
            self.updatedAccount("");
            self.lockBoxPassword1("");
            self.lockBoxPassword2("");
        }
        
        self.accountData(self.mapAccountData(window.accountData));
        self.lockBoxData(self.mapLockBoxes(window.lockBoxes.filter((i) => { return i.active == true; })));   

        $('#mdlSettings').on('show.bs.modal', (e) => {
            self.errorMsg("");
            self.settingSuccessMsg("");
        });              

    }
    ko.applyBindings(new ViewModel());
    initDurationPicker(); 
}

