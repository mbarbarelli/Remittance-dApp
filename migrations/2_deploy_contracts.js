var Remittance = artifacts.require("./Remittance.sol");
var Data = artifacts.require("./Data.sol");
var Util = artifacts.require("./Util.sol");

module.exports = function(deployer) { 
  deployer.deploy(Data);
  deployer.link(Data, Remittance);  
  deployer.deploy(Util);  
  deployer.link(Util, Remittance);
  deployer.deploy(Remittance);  
};
