import Web3 from 'web3';
import BN from 'bn.js';

require('dotenv').config();

export const web3 = new Web3('http://geth.dappnode:8545');

export const numberToWei = (n: number) => web3.utils.toWei(n.toFixed(9), 'ether');
export const weiToNumber = (n: string) => parseFloat(web3.utils.fromWei(n, 'ether'));

export const stringToBn = (n: string) => web3.utils.toBN(n);
