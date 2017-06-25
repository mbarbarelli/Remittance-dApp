

// expectedException gist 
// https://gist.github.com/xavierlepretre/d5583222fde52ddfbc58b7cfa0d2d0a9 

web3.eth.expectedExceptionPromise = function (action, gasToUse) {
  var e_msg_invalid_jump = "invalid JUMP";
  var e_msg_out_of_gas = "out of gas"; 
  var e_msg_check_gas = "please check your gas amount";

  return new Promise(function (resolve, reject) {
      try {
        resolve(action());
      } catch(e) {
        reject(e);
      }
    })
    .then(function (txnHash) {
      return web3.eth.getTransactionReceiptMined(txnHash);
    })
    .then(function (receipt) {
      // We are in Geth      
      assert.equal(receipt.gasUsed, gasToUse, "Geth: should have used all the gas");      
    })
    .catch(function (e) {     
      if ((e + "").indexOf(e_msg_invalid_jump) > -1 || (e + "").indexOf(e_msg_out_of_gas) > -1) {
        // We are in TestRPC
        // And exception contains invalid jump
        console.log("\nExpected TestRPC exception occured: " + e_msg_invalid_jump + " or " + e_msg_out_of_gas);
      } else if ((e + "").indexOf(e_msg_invalid_jump) == -1 || (e + "").indexOf(e_msg_out_of_gas) == -1) {
        // We are in TestRPC 
        // And Exception does not contain invalid JUMP        
        console.log("\nExpected exception thrown by TestRPC: " + e);
      } else if ((e + "").indexOf(e_msg_check_gas) > -1) {
        // We are in Geth for a deployment
      } else {
        throw e;
      }
    });
};

// getEventsPromise gist 
// https://gist.github.com/xavierlepretre/afab5a6ca65e0c52eaf902b50b807401
getEventsPromise = function (myFilter, count, timeOut) {
    timeOut = timeOut ? timeOut : 30000;
    var promise = new Promise(function (resolve, reject) {
        count = (typeof count !== "undefined") ? count : 1;
        var results = [];
        var toClear = setTimeout(function () {
            reject("Timed out");
        }, timeOut);
        myFilter.watch(function (error, result) {
            if (error) {
                clearTimeout(toClear);
                reject(error);
            } else {
                count--;
                results.push(result);
            }
            if (count <= 0) {
                resolve(results.map(value => value)); // returs array of events
                clearTimeout(toClear);
                myFilter.stopWatching(() => {});
            }
        });
        if (count == 0) {
            promise = promise
                .then(function (events) {
                    throw "Expected to have no event";
                })
                .catch(function (error) {
                    if (error != "Timed out") {
                        throw error;
                    }
                });
        }
        return promise;
    });
};

// getTransactionReceiptMined gist 
// https://gist.github.com/xavierlepretre/88682e871f4ad07be4534ae560692ee6
web3.eth.getTransactionReceiptMined = function (txnHash, interval) {
    var transactionReceiptAsync;
    interval = interval ? interval : 500;
    transactionReceiptAsync = function(txnHash, resolve, reject) {
        web3.eth.getTransactionReceipt(txnHash, (error, receipt) => {
            if (error) {
                reject(error);
            } else {
                if (receipt == null) {
                    setTimeout(function () {
                        transactionReceiptAsync(txnHash, resolve, reject);
                    }, interval);
                } else {
                    resolve(receipt);
                }
            }
        });
    };

    if (Array.isArray(txnHash)) {
        var promises = [];
        txnHash.forEach(function (oneTxHash) {
            promises.push(web3.eth.getTransactionReceiptMined(oneTxHash, interval));
        });
        return Promise.all(promises);
    } else {
        return new Promise(function (resolve, reject) {
                transactionReceiptAsync(txnHash, resolve, reject);
            });
    }
};