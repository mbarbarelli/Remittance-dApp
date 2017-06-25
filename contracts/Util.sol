pragma solidity ^0.4.8;

library Util{    
	function authenticate(string input1, string input2, bytes32 password1, bytes32 password2) returns (bool authenticated)
	{
		if(sha3(input1) == password1 && sha3(input2) == password2) {
			return true;
		}
		return false; 
	}
}
