import { gql, GraphQLClient } from "graphql-request/dist";
import _ from 'lodash';
import ALL_ORDERS from './dec2020/sales_2020-01-01_2020-12-06-2.json';
import PRODUCT_DESIGNERS from './dec2020/productDesigners.json';
import Web3 from 'web3';
require('dotenv').config()

const BUYER_ROBOT_PER_DOLLAR = 0.4;
const DESIGNER_ROBOT_PER_DOLLAR = 0.16;

const ENDPOINT = process.env.GRAPHQL_ENDPOINT;
const TOKEN = process.env.ACCESS_TOKEN;

if (!ENDPOINT || !TOKEN) {
  throw new Error('Missing ENV Variables.')
}

const client = new GraphQLClient(ENDPOINT, { headers: { 'X-Shopify-Access-Token': TOKEN } })


const web3 = new Web3("http://geth.dappnode:8545")

const numberToWei = (n: number) => web3.utils.toWei(n.toFixed(5), 'ether')

const calculateBuyerAllocation = async () => {
  const buyers = _(ALL_ORDERS)
    .groupBy('customer_id')
    .mapValues(
      orders => orders.reduce((acc, order) => ({
        totalSpent: acc.totalSpent + order.net_sales,
        customerId: order.customer_id,
      }), { totalSpent: 0, customerId: 0 })
    ).values().value();

  const recipients: Array<{ ethAddress: string, tokenAmount: number}> = [];
  let totalSales = 0;

  // map buyer purchases to ETH Addresses and token allocation
  for (const b of buyers) {
    totalSales += b.totalSpent;
    const ethAddress = await getEthAddressForCustomer(b.customerId);
    if (ethAddress) {
      recipients.push({ ethAddress, tokenAmount: b.totalSpent * BUYER_ROBOT_PER_DOLLAR })
    } else {
      console.warn('Missing ETH Address for customerID: ', b.customerId, '. Total spend: ', b.totalSpent)
    }
  }


  // Merge duplicate ETH address entries
  const airdropList = _(recipients)
    .groupBy('ethAddress')
    .mapValues(
      receipts => receipts.reduce((acc, r) => ({
        tokenAmount: acc.tokenAmount + r.tokenAmount,
        ethAddress: r.ethAddress,
      }), { tokenAmount: 0, ethAddress: '' })
    ).values().value();


  const tokensToDistribute = airdropList.reduce((sum, { tokenAmount }) => sum += tokenAmount, 0)

  const output = airdropList.filter(t => t.tokenAmount > 0).map(t => `${t.ethAddress},${numberToWei(t.tokenAmount)}`)
  // Output result to console as CSV
  console.log(output.join('\n'));
  console.log({ totalSales, totalTokens: totalSales * BUYER_ROBOT_PER_DOLLAR, tokensToDistribute })
};

const getEthAddressForCustomer = async (customerId: number): Promise<string | null> => {
  const QUERY = gql`
    query getCustomer($customerId: ID!) {
      customer(id: $customerId) {
        metafield(key: "ethereum_address", namespace: "cf_app") {
          value
        }
      }
    }
  `
  const data = await client.request(QUERY, { customerId: `gid://shopify/Customer/${customerId}` });
  const value = data.customer.metafield?.value;

  let ethAddress = /0x[a-fA-F0-9]{40}/.exec(value)?.[0];
  const ensName = /\w+\.eth/.exec(value)?.[0];

  if (ensName) {
    console.log(`Fetching ETH address for ENS`, ensName);
    try {
      ethAddress = await web3.eth.ens.getAddress(ensName);
      console.log({ ethAddress, ensName });
    } catch (e) {
      console.warn("Unable to resolve ETH address for ENS: ", ensName);
    }
  }

  if (!ethAddress) return null;

  if (!web3.utils.isAddress(ethAddress)) {
    console.log("Invalid ETH Address: ", { ethAddress, customerId });
    return null;
  }

  return ethAddress;
}


type DesignerContribution = { name: string, ethAddress: string, contributionShare: number };

const DesignerMap: Record<string, {
  productId: number,
  title: string,
  designers: DesignerContribution[]
}> = PRODUCT_DESIGNERS;

const calculateDesignerAllocation = () => {
  const products = _(ALL_ORDERS)
    .groupBy('product_id')
    .mapValues(
      orders => orders.reduce((acc, order) => ({
        totalSales: acc.totalSales + order.net_sales,
        productId: order.product_id,
        title: order.product_title,
        designers: DesignerMap[order.product_id]?.designers
      }), { totalSales: 0, productId: 0, title: '', designers: [] as DesignerContribution[] })
    ).values().value();


  const tokensToDistribute = products.reduce((sum, { totalSales }) => sum += totalSales, 0) * DESIGNER_ROBOT_PER_DOLLAR
  let tokensToDistribute2 = 0


  const allocationMap = new Map<string, number>();

  // map buyer purchases to ETH Addresses and token allocation
  for (const p of products) {
    const { designers, totalSales } = p;
    for (const d of designers) {
      const numTokens = d.contributionShare * totalSales * DESIGNER_ROBOT_PER_DOLLAR;
      tokensToDistribute2 += numTokens;
      allocationMap.set(d.ethAddress, (allocationMap.get(d.ethAddress) || 0) + numTokens)
    }
  }


  const output = [...allocationMap.entries()].map(([ethAddress,tokens]) => `${ethAddress},${numberToWei(tokens)}`).join('\n')

  // Output result to console as CSV
  console.log(`ethAddress,tokenAmount\n${output}`);
  console.log({ tokensToDistribute, tokensToDistribute2 });
};

calculateDesignerAllocation()
//
// calculateBuyerAllocation();
