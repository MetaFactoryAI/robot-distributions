import _ from "lodash";
import ETH_SALES from "../mconSales/ethSales.json";
import TOKEN_SALES from "../mconSales/tokenSales.json";
import FIAT_SALES from "../mconSales/fiatSales.json";
import MCON_PRODUCTS from "../mconSales/products.json";

import { ExternalSale } from "./types";

type EthSale = typeof ETH_SALES[0];
type TokenSale = typeof TOKEN_SALES[0];


const VALID_TOKENS = ["DAI", 'USDT', 'USDC', 'WETH']
const isValidToken = (symbol: string) => Boolean(VALID_TOKENS.find(s => s === symbol))

const getDollarValueOfTx = (tx: EthSale | TokenSale): number => {
  if ('TokenSymbol' in tx) {
    if (!isValidToken(tx.TokenSymbol)) {
      throw new Error(`Invalid token in TX: ${JSON.stringify(tx)}`)
    }

    if (tx.TokenSymbol === 'WETH') {
      return tx.Value * tx['Historical $Price/Eth']
    }

    // else its a stablecoin
    return tx.Value
  } else {
    return tx['Value_IN(ETH)'] * tx['Historical $Price/Eth']
  }
}

export const getMconSales = (): ExternalSale[] => {
  const formattedOnChainSales = [...ETH_SALES, ...TOKEN_SALES].map((tx) => ({
    ethAddress: tx.From,
    product_id: 'mcon-sale',
    order_id: `MCON-${tx.Txhash}`,
    product_title: 'MCON SALE',
    product_vendor: 'MF @ MCON',
    net_sales: getDollarValueOfTx(tx),
    day: tx.DateTime.slice(0, 10),
    time: tx.DateTime.slice(11)
  }))

  const formattedFiatSales = FIAT_SALES.map(sale => ({
    ethAddress: sale.ethAddress,
    product_id: 'mcon-sale',
    order_id: `MCON-FIAT-${sale.order_id}`,
    product_title: 'MCON SALE',
    product_vendor: 'MF @ MCON',
    net_sales: sale.net_sales,
    day: sale.day,
    time: sale.time
  }))

  return _.sortBy([...formattedFiatSales, ...formattedOnChainSales], ['day', 'time'])

};

const approximatelyEqual = (v1: number, v2: number, epsilon = 1e-10) =>
  Math.abs(v1 - v2) < epsilon;

// 2948.4307702418932
export const getMconDesignerRewards = (tokenAmount: number) => {
  const designerRewards: Record<string, number> = {};

  for (const p of MCON_PRODUCTS) {
    for (const d of p.designers) {
      const address = d.ethAddress.toLowerCase();
      designerRewards[address] =
        (designerRewards[address] || 0) + d.contributionShare * p.rewardShare * tokenAmount;
    }
  }

  const total = Object.values(designerRewards).reduce((acc, v) => acc += v, 0);
  if (!approximatelyEqual(total, tokenAmount)) {
    throw new Error(`INCORRECT MCON DESIGNER CALCULATION: ${{ total, tokenAmount }}`)
  }

  return designerRewards;
};
