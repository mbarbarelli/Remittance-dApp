var Remittance = artifacts.require("./Remittance.sol"); 
require("./utils/utils.js"); 
const Promise = require("bluebird"); 
Promise.promisifyAll(web3.eth, {suffix: "Promise"}); 

contract("Remittance contract", (accounts) => {
    var owner = accounts[0];
    var remittance_address;
    let remittance; 
    var password1 = "password1";
    var password2 = "password2";
    var p1_hash = web3.sha3(password1);
    var p2_hash = web3.sha3(password2);     

    before("Remittance contract must be deployed", () => {
        return Remittance.new({from: owner })
            .then(instance => {
                remittance = instance; 
                remittance_address = remittance.contract.address;
                console.log("Remittance contract deployed at: " + remittance_address);
            })
            .catch(console.error);
    });

    it("tests keccak256", () => {
        console.log(p1_hash);
        console.log(p2_hash); 

        return remittance.getKey.call(p1_hash, p2_hash)
            .then(result =>  {
                console.log("getKey " + result);
            });
    });

    it("End to end test: Lockbox creation, funds claimed and withdrawn", () => {   
        var creator = accounts[1]; 
        var beneficiary = accounts[2]; 

        var amount = web3.toWei(2, "ether"); 
        var timeLockBoxCreationTxSent;
        var startBalance, events, ownerFee;
        var lockBoxKey;
                                     
         // Retreive starting balance                            
         return web3.eth.getBalancePromise(beneficiary)
            .then(balance => {
                startBalance = balance;                 
                console.log("balance before funds claimed: " + startBalance);
                timeLockBoxCreationTxSent = Date.now();
                // Retreive transaction fee for owner.
                return remittance.ownerFee()
            })
            .then(fee => {
                ownerFee = fee; 
                // Get the expected unique ID for the lockbox "lockBoxKey"
                return remittance.getKey.call(p1_hash, p2_hash)                                  
            })
            .then(key => {
                lockBoxKey = key; 
                // Create lockbox and send funds to it. 
                return remittance.createLockBox.sendTransaction(beneficiary, p1_hash, p2_hash, 
                    { from: creator, value: amount })                  
            })
            .then(txHash => {
                return web3.eth.getTransactionReceiptMined(txHash);
            })
            .then(receipt => {
                events = remittance.LogLockBoxCreated().formatter(receipt.logs[0]).args; 
                assert.equal(events.receiver, beneficiary, "Log of lockbox beneficiary should be " + beneficiary);
                assert.equal(events.lockBoxKey, lockBoxKey, "Unexpected unique ID for lockBoxKey.");
                assert.equal(events.amount.add(ownerFee), amount, "Log of lockbox amount should be " + amount);
                assert.isTrue(events.result, "Log of lockbox result should be true.");
                
                // Retreive lockbox just created.
                return remittance.getLockBox.call(lockBoxKey);
            })
            .then(lockbox => {
                var lbCreator = lockbox[0]; 
                var lbReceiver = lockbox[1];
                var amountHeld = lockbox[2];
                var creationTime = lockbox[3]; 
                var active = lockbox[4]; 
                var index = lockbox[5];                   
                var avgBlockTimeMs = 17000;
                var timeLockBoxCreated = new Date(creationTime.valueOf() * 1000);
                var timeDiff = Math.abs(timeLockBoxCreated - timeLockBoxCreationTxSent);

                assert.equal(lbCreator, creator, "Actual lockbox sender should be " + creator);
                assert.equal(amountHeld.add(ownerFee), amount, "Actual lockbox amount is " + amountHeld + " but should be " + amount);
                assert.isTrue(active, "Actual lockbox active state should be true.");
                assert.isBelow(timeDiff, avgBlockTimeMs, "There should not be a wide discrepancy between time tx sent and on chain creation time.");
                // Check owner balance.  Did the owner receive the transaction fee? 
                return remittance.getCollectedFeeAmount.call({ from: owner })
            })
            .then(fees => {
                assert.equal(fees.valueOf(), ownerFee, "Owner should have received transaction fee.");
                // The lockbox fund beneficiary now attempts to claim funds from the lockbox. 
                return remittance.claimFunds.sendTransaction(password1, password2, lockBoxKey, { from: beneficiary });
            })
            .then(txHash => {
                return web3.eth.getTransactionReceiptMined(txHash);                
            })                    
            .then(receipt => {
                events = remittance.LogDeposit().formatter(receipt.logs[0]).args;
                assert.equal(events.account, beneficiary, "Account for beneficiary deposit should be " + beneficiary + " is " + events.account); 
                assert.equal(events.amount.add(ownerFee), amount, "Amount deposited should be amount sent to lockbox, minus owner fee.");

                events = remittance.LogFundsUnlocked().formatter(receipt.logs[1]).args;
                assert.isTrue(events.result, "Log of lockbox claimed result should be true.");
                assert.equal(events.account, beneficiary, "Log of lockbox beneficiary should be " + beneficiary);
                assert.equal(events.amount.add(ownerFee), amount, "Log of lockbox claimed amount should be " + amount);
                // Now that the funds have been claimed, check the beneficiary's balance
                return remittance.getBalance.call(beneficiary)
            })
            .then(balance => {
                assert.equal(balance, amount - ownerFee, "Amount withdrawn should be the amount placed in lockbox minus owner fee.");
                // Beneficiary now attempts to withdraw funds.   
                return remittance.withdraw.sendTransaction(amount - ownerFee, { from: beneficiary });
            })
            .then(txnHash => {
                return web3.eth.getTransactionReceiptMined(txnHash);
            })
            .then(receipt => {
                events = remittance.LogWithdrawal().formatter(receipt.logs[0]).args; 
                assert.equal(events.payee, beneficiary, "Log of Payee should be " + beneficiary);
                assert.equal(events.amount.add(ownerFee), amount, "Log of amount withdrawn should be " + amount + " is " + events.amount);
                assert.isTrue(events.result, "Log of withdraw result should be true.");     
   
                return web3.eth.getBalancePromise(beneficiary);                         
            })
            .then(endBalance => {                
                console.log("balance after funds unlocked and claimed: " + endBalance);
                // Contortions to account for gas consumed by beneficiary...
                var adjustedAmt = amount - ownerFee; 
                var paymentDiff = adjustedAmt - (endBalance - startBalance);
                var diffPercent = ((paymentDiff / adjustedAmt) * 100).toFixed(2);

                assert.isAtMost(diffPercent, 0.55, "End balance does not indicate that amount was withdrawn.");
            });
    });

    // TO-DO: Refactor unit tests and emergency stop tests to account for new unique identifier scheme.

    // describe("Miscellaneous unit tests", () => {
    //     var ownerFee;
    //     var creator = accounts[1]; 
    //     var beneficiary = accounts[2]; 
    //     var password1 = "password1";
    //     var password2 = "password2";
    //     var p1_hash = web3.sha3(password1); 
    //     var p2_hash = web3.sha3(password2); 
    //     var amount = web3.toWei(2, "ether");  
    //     var timeLockBoxCreationTxSent;   
    //     var avgBlockTimeMs = 17000;    
    //     var gasPrice;

    //     beforeEach("Deploy and prepare", () => {
    //         return Remittance.new({ from: owner })
    //             .then(instance => {
    //                 remittance = instance; 
    //                 remittance_address = remittance.contract.address;
    //                 console.log("Remittance contract deployed at: " + remittance_address);
    //                 return remittance.ownerFee();
    //             })
    //             .then(fee => {
    //                 ownerFee = fee;
    //                 timeLockBoxCreationTxSent = Date.now();
    //                 return remittance.createLockBox.sendTransaction(beneficiary, p1_hash, p2_hash, 
    //                     { from: creator, value: amount });
    //             })
    //             .then((txnHash => {
    //                 return web3.eth.getGasPricePromise();
    //             }))
    //             .then(price => {
    //                 gasPrice = price;
    //             })
    //             .catch(console.error);            
    //     });

    //     it("Should not be possible to claim funds with an invalid password.", () => {
    //         var badpass1 = "invalid1";
    //         var badpass2 = "invalid2";

    //         return web3.eth.expectedExceptionPromise(() => {
    //                 return remittance.claimFunds.sendTransaction(password1, password2, { from: beneficiary })
    //             }, 3000000);              
    //     });

    //     it("Should be possible to withdraw owner transaction fees.", () => {
    //         var ownerFee; 
            
    //         return remittance.ownerFee()                     
    //             .then(fee => {
    //                 ownerFee = fee; 
    //                 return web3.eth.getBalancePromise(owner);
    //             })
    //             .then(balance => {
    //                 ownerStartBalance = balance; 
    //                 return remittance.getCollectedFeeAmount.call({ from: owner });
    //             })
    //             .then(fees => {
    //                 assert.equal(fees.valueOf(), ownerFee, "Fees collected should equal ownerFee");
    //                 return remittance.withdrawFees.sendTransaction({ from: owner })
    //             })
    //             .then(txHash => {
    //                 return web3.eth.getTransactionReceiptMined(txHash);
    //             })
    //             .then(receipt => {
    //                 return remittance.getCollectedFeeAmount.call({ from: owner });
    //             })
    //             .then(fees => {
    //                 console.log("fees " + fees);
    //                 assert.equal(fees, 0, "fees should be zero.");
    //             })
    //     });

    //     it("Should not be possible for anyone but owner to withdraw fees", () => {
    //         return web3.eth.expectedExceptionPromise(() => {
    //                 return remittance.withdrawFees.sendTransaction({ from: creator })
    //             }, 3000000);  
    //     });

    //     it("Should not be possible to overwrite previously created lockbox", () => {            
    //         return web3.eth.expectedExceptionPromise(() => {
    //                 return remittance.createLockBox(beneficiary, p1_hash, p2_hash, { from: creator, value: amount });
    //             }, 3000000);             
    //     })

    //     it("Should retreive created lockbox", () => {
    //         return remittance.getLockBox.call(beneficiary)
    //             .then(lockbox => {
    //                 var lbCreator = lockbox[0]; 
    //                 var amountHeld = lockbox[1];
    //                 var creationTime = lockbox[2]; 
    //                 var active = lockbox[3]; 
    //                 var index = lockbox[4];    
    //                 var timeLockBoxCreated = new Date(creationTime.valueOf() * 1000);
    //                 var timeDiff = Math.abs(timeLockBoxCreated - timeLockBoxCreationTxSent);

    //                 assert.equal(creator, lbCreator, "Unexpected lockbox creator.");
    //                 assert.equal((amount - ownerFee), amountHeld, "Amount placed in lockbox not equal to amount retreived.");
    //                 assert.isTrue(active, "Lockbox should be active."); 
    //                 assert.isTrue(index.valueOf() == 0, "Index " + index.valueOf() + " is not as expected.")
    //                 assert.isBelow(timeDiff, avgBlockTimeMs, "There should not be a wide discrepancy between time tx sent and on chain creation time.");
    //             });   
    //     });

    //     it("Should change retreival deadline by owner", () => {
    //         var newDeadline_seconds = 60;
    //         return remittance.setDeadline.sendTransaction(newDeadline_seconds, { from: owner })
    //             .then(txHash => {
    //                 return web3.eth.getTransactionReceiptMined(txHash);
    //             })
    //             .then(receipt => {
    //                 return remittance.deadline();
    //             })
    //             .then(deadline => {
    //                 assert.equal(newDeadline_seconds, deadline.valueOf(), "Newly set deadline unexpected value.");
    //             })
    //     });

    //     it("Should not be possible to change retreival deadline by beneficiary", () => {
    //         var newDeadline_seconds = 60;
    //         return web3.eth.expectedExceptionPromise(() => {
    //                 return remittance.setDeadline.sendTransaction(newDeadline_seconds, { from: beneficiary });
    //             }, 3000000); 
    //     });        

    //     it("Should be possible for lockbox creator to reclaim funds after deadline.", () => {
    //         var newDeadline_seconds = 5; 
    //         var startingBalance, endingBalance; 

    //         return remittance.getBalance.call(creator)
    //             .then(balance => {
    //                 startingBalance = balance; 
    //                 return remittance.setDeadline.sendTransaction(newDeadline_seconds, { from: owner })
    //             })
    //             .then(txHash => {
    //                 return web3.eth.getTransactionReceiptMined(txHash);
    //             })
    //             .then(receipt => {
    //                 return Promise.delay((newDeadline_seconds + 1) * 1000).then(() => {
    //                         return remittance.reclaimFunds.sendTransaction(beneficiary, { from: creator });
    //                     }                    
    //                 )                    
    //             })
    //             .then(txnHash => {
    //                 return web3.eth.getTransactionReceiptMined(txnHash)
    //             })
    //             .then(receipt => {
    //                 return remittance.getBalance.call(creator);
    //             })
    //             .then(balance => {
    //                 endingBalance = balance; 
    //                 var diff = endingBalance - startingBalance;
    //                 assert.equal(diff, (amount - ownerFee), "Balance does not indicate that lockbox creator has reclaimed funds.");
    //             })          
    //     });

    //     it("Should not be possible for lockbox creator to reclaim funds before deadline.", () => {
    //         return web3.eth.expectedExceptionPromise(() => {
    //                 return remittance.reclaimFunds.sendTransaction(beneficiary, { from: creator });
    //             }, 3000000);                                  
    //     });    

    //     it("Should be possible for lockbox beneficiary to reclaim funds before deadline.", () => {
    //         var startingBalance, endingBalance; 

    //         return remittance.getBalance.call(beneficiary)
    //             .then(balance => {
    //                 startingBalance = balance; 
    //                 return remittance.claimFunds.sendTransaction(password1, password2, { from: beneficiary });
    //             })
    //             .then(txHash => {
    //                 return web3.eth.getTransactionReceiptMined(txHash);
    //             })
    //             .then(receipt => {                 
    //                 return remittance.getBalance.call(beneficiary);                                      
    //             })
    //             .then(balance => {
    //                 endingBalance = balance; 
    //                 var diff = endingBalance - startingBalance;
    //                 assert.equal(diff, (amount - ownerFee), "Balance does not indicate that lockbox beneficiary has reclaimed funds.");
    //             })          
    //     });

    //     it("Should not be possible for lockbox beneficiary to claim funds after deadline.", () => {   
    //         var newDeadline_seconds = 3;                  
    //         return remittance.setDeadline.sendTransaction(newDeadline_seconds, { from: owner })
    //             .then(txHash => {
    //                 return web3.eth.getTransactionReceiptMined(txHash);
    //             })
    //             .then(receipt => {                                        
    //                 return Promise.delay((newDeadline_seconds + 1) * 1000).then(() => {
    //                         return web3.eth.expectedExceptionPromise(() => {
    //                             return remittance.claimFunds.sendTransaction(password1, password2, { from: beneficiary });
    //                         }, 3000000); 
    //                     }                    
    //                 )                                                          
    //             });
    //     });

    //     it("Should create several lockboxes and then return the correct count.", () => {
    //         var creator2 = accounts[3]; 
    //         var beneficiary2 = accounts[4]; 
    //         var creator3 = accounts[5]; 
    //         var beneficiary3 = accounts[6]; 
    //         var creator4 = accounts[7]; 
    //         var beneficiary4 = accounts[8]; 
    //         var expectedLockBoxCount = 4; 

    //         return Promise.all([
    //             remittance.createLockBox.sendTransaction(beneficiary2, p1_hash, p2_hash, { from: creator2, value: amount }),
    //             remittance.createLockBox.sendTransaction(beneficiary3, p1_hash, p2_hash, { from: creator3, value: amount }),
    //             remittance.createLockBox.sendTransaction(beneficiary4, p1_hash, p2_hash, { from: creator4, value: amount })             
    //         ])
    //             .then(txnHashes => {
    //                 return web3.eth.getTransactionReceiptMined(txnHashes);
    //             })
    //             .then(receipts => {
    //                 return remittance.getLockBoxCount.call();
    //             })
    //             .then(count => {
    //                 assert.equal(count, expectedLockBoxCount, "The number of lockboxes created should be " + expectedLockBoxCount);
    //             })
    //     });

    //     it("Should be possible to change owner fee", () => {
    //         var newOwnerFee = 2000000;
    //         return remittance.setOwnerFee.sendTransaction(newOwnerFee, { from: owner})
    //             .then(txnHash => {
    //                 return web3.eth.getTransactionReceiptMined(txnHash);
    //             })
    //             .then(receipt => {
    //                 return remittance.ownerFee()
    //             })
    //             .then(fee => {
    //                 assert.equal(fee.valueOf(), newOwnerFee, "New fee not successfully set.");
    //             });
    //     });
    // });

    // describe("Emergency stop tests", () => {
    //     var remittance_address;
    //     var ownerFee;
    //     var creator = accounts[1]; 
    //     var beneficiary = accounts[2]; 
    //     var password1 = "password1";
    //     var password2 = "password2";
    //     var p1_hash = web3.sha3(password1); 
    //     var p2_hash = web3.sha3(password2); 
    //     var amount = web3.toWei(2, "ether");  
    //     var timeLockBoxCreationTxSent;   
    //     var avgBlockTimeMs = 17000;    
    //     var isStopped; 
  
    //     beforeEach("Deploy and prepare", () => {       
    //         return Remittance.new({ from: owner })
    //             .then(instance => {
    //                 remittance = instance; 
    //                 remittance_address = remittance.contract.address;
    //                 return remittance.createLockBox.sendTransaction(beneficiary, p1_hash, p2_hash, { from: creator, value: amount });
    //             })
    //             .then(txnHash => {
    //                 return web3.eth.getTransactionReceiptMined(txnHash);
    //             })
    //             .then(receipt => {
    //                 return remittance.toggleContractActive.sendTransaction({ from: owner });
    //             })
    //             .then(txnHash => {
    //                 return web3.eth.getTransactionReceiptMined(txnHash);
    //             })
    //             .then(receipt => {
    //                 return remittance.stopped();
    //             })
    //             .then(stopped => {
    //                 isStopped = stopped;
    //             })
    //             .catch(console.error);                                       
    //     });
        
    //     it("Contract should be stopped", () => {
    //         console.log("is Stopped: " + isStopped);
    //         assert.isTrue(isStopped, "Contract should not be in emergency stop mode.");
    //     });        

    //     it("Contract should not be stopped", () => {
    //         return remittance.toggleContractActive.sendTransaction({ from: owner })
    //             .then(txnHash => {
    //                 return web3.eth.getTransactionReceiptMined(txnHash)
    //             })
    //             .then(receipt => {
    //                 return remittance.stopped()
    //             })
    //             .then(stopped => {
    //                 isStopped = stopped;
    //                 assert.isFalse(isStopped, "Contract should not be in emergency stop mode.");
    //             })
    //     }); 

    //     it("Should not be possible for non-owner to put contract on stop.", () => {
    //         return web3.eth.expectedExceptionPromise(() => {
    //                 return remittance.toggleContractActive.sendTransaction({ from: beneficiary });
    //             }, 3000000);             
    //     });

    //     it("Should not be possible to create a lockbox when stopped.", () => {
    //         var lbCreator; 
    //         var amountHeld;
    //         var creationTime; 
    //         var active;
    //         var newBeneficiary = accounts[4]; 
    //         var index;        

    //         return web3.eth.expectedExceptionPromise(() => {
    //                  return remittance.createLockBox.sendTransaction(newBeneficiary, p1_hash, p2_hash, { from: creator, value: amount })
    //             }, 3000000)
    //             .then(() => {
    //                 return remittance.getLockBox.call(newBeneficiary);
    //             })
    //             .then(lockbox => {
    //                 lbCreator = lockbox[0]; 
    //                 amountHeld = lockbox[1];
    //                 creationTime = lockbox[2]; 
    //                 active = lockbox[3]; 
    //                 index = lockbox[4];        
                    
    //                 assert.equal(lbCreator, "0x0000000000000000000000000000000000000000", "Lockbox should be empty and not have a creator."); 
    //                 assert.equal(amountHeld.valueOf(), 0, "Lockbox should be empty and not contain funds.");
    //                 assert.equal(creationTime.valueOf(), 0, "Lockbox should be empty not have a creation time.");
    //                 assert.isFalse(active,"Lockbox should be empty and inactive.");                    
    //             })
    //     });

    //     // ** NOTE! ** - Contract balance shows that it is charging sender twice
    //     // *********** - https://github.com/ethereumjs/ethereumjs-vm/issues/82 
    //     it("Should be possible to recover contract balance in an emergency.", () => {
    //         var contractBalanceStart, ownerBalanceStart; 
    //         var contractBalanceEnd, ownerBalanceEnd; 

    //         return Promise.all([
    //             web3.eth.getBalancePromise(remittance_address), 
    //             web3.eth.getBalancePromise(owner), 
    //         ])
    //         .then(balances => {
    //             contractBalanceStart = balances[0]; 
    //             ownerBalanceStart = balances[1]
    //             return remittance.recoverBalance.sendTransaction({ from: owner });
    //         })
    //         .then(txnHash => {
    //             return web3.eth.getTransactionReceiptMined(txnHash);
    //         })
    //         .then(receipt => {
    //             return Promise.all([
    //                 web3.eth.getBalancePromise(remittance_address), 
    //                 web3.eth.getBalancePromise(owner), 
    //             ]);        
    //         })
    //         .then(newBalances => {
    //             contractBalanceEnd = newBalances[0];
    //             ownerBalanceEnd = newBalances[1];
                
    //             // Contortions to account for gas consumed...
    //             var ownerGain = ownerBalanceEnd - ownerBalanceStart; 
    //             var diff = contractBalanceStart - ownerGain; 
    //             var diffPercent = ((diff / contractBalanceStart) * 100).toFixed(2);

    //             assert.isAtMost(diffPercent, 0.08, "Owner end balance does not indicate that entire contract amount was recovered.");                
    //             assert.equal(contractBalanceEnd, 0, "Contract should no longer have a balance.");
    //         });
    //     });

    //     it("Should stop contract, be unable to invoke 'stopInEmergency' method, then reactivate", () => {
    //         var newBeneficiary = accounts[4];
    //         var nbStartBalance, nbEndBalance;
    //         var ownerFee; 

    //         return web3.eth.expectedExceptionPromise(() => {
    //                  return remittance.createLockBox.sendTransaction(newBeneficiary, p1_hash, p2_hash, { from: creator, value: amount })
    //             }, 3000000)
    //             .then(() => {
    //                 return remittance.toggleContractActive.sendTransaction({ from: owner });
    //             })            
    //             .then(txnHash => {
    //                 return web3.eth.getTransactionReceiptMined(txnHash);
    //             })
    //             .then(receipt => {
    //                 return remittance.stopped()
    //             })
    //             .then(stopped => {
    //                 assert.isFalse(stopped, "The contract should not be on stop.");
    //                 return remittance.createLockBox.sendTransaction(newBeneficiary, p1_hash, p2_hash, { from: creator, value: amount });
    //             })
    //             .then(txnHash => {
    //                 return web3.eth.getTransactionReceiptMined(txnHash);
    //             })
    //             .then(receipt => {
    //                 return remittance.claimFunds.sendTransaction(password1, password2, { from: newBeneficiary });
    //             })
    //             .then(txnHash => {
    //                 return web3.eth.getTransactionReceiptMined(txnHash);
    //             })
    //             .then(receipt => {
    //                 return web3.eth.getBalancePromise(newBeneficiary);
    //             })
    //             .then(balance => {
    //                 nbStartBalance = balance; 
    //                 return remittance.ownerFee();
    //             })
    //             .then(fee => {
    //                 ownerFee = fee; 
    //                 return remittance.withdraw.sendTransaction(amount - ownerFee, { from: newBeneficiary })
    //             })
    //             .then(txnHash => {
    //                 return web3.eth.getTransactionReceiptMined(txnHash);
    //             })
    //             .then(receipt => {
    //                 return web3.eth.getBalancePromise(newBeneficiary);
    //             })
    //             .then(balance => {
    //                 nbEndBalance = balance;
    //                 var diff = amount - (nbEndBalance - nbStartBalance); 
    //                 var diffPercent = ((diff / amount) * 100).toFixed(2);

    //                 assert.isAtMost(diffPercent, 0.19, "Beneficiary balance is not correct");                                
    //             })
    //     });

    //     it("Contract should self destruct", () => {
    //         return remittance.killMe.sendTransaction({ from: owner})
    //             .then(txnHash => {
    //                 return web3.eth.getTransactionReceiptMined(txnHash);
    //             })
    //             .then(receipt => {
    //                 return web3.eth.getStorageAtPromise(remittance_address, 0);
    //             })
    //             .then(result => {
    //                 assert.equal(result, '0x00', "Contract storage should be empty. It is now " + result);
    //             })
    //     })
    // });
});