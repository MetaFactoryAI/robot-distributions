import _ from 'lodash';
import * as fs from 'fs';
import { formatAddress, numberToWei, weiToNumber } from './lib/ethHelpers';
import {
  DesignerAllocation,
  DesignerContribution,
  Order,
  OrderRewardAllocation,
} from './lib/types';

import DEC2020_AIRDROP from './dec2020/finalTokensDistributed.json';
import FEB2021_AIRDROP from './feb2021/finalTokensDistributed.json';

import PRODUCT_DESIGNERS from './data/productDesigners.json';
import { ALL_ORDERS } from './data';
import { getDollarsSpent, getEthAddress } from './lib/orderHelpers';

const SALES_MILESTONES = [100_000, 110_000, 200_000, 400_000, 800_000];
const BUYER_ROBOT_PER_DOLLAR = [0.4, 0.2, 0.05, 0.025, 0.0125];
const DESIGNER_ROBOT_PER_DOLLAR = [0.16, 0.12, 0.05, 0.025, 0.0125];

const INITIAL_REVENUE = 50_000;

const VAUNKER_SALE_ROBOT_PER_ETH = 42;

export const productDesignerMap: Record<
  string,
  {
    productId: number | string;
    title: string;
    designers: DesignerContribution[];
  }
> = PRODUCT_DESIGNERS;

const customRewardHandlers: Record<
  string,
  (order: Order, milestoneIndex: number) => OrderRewardAllocation
> = {
  'VAUNKER-KEYCARD': (order, milestoneIndex: number) => {
    if (!('ethPaid' in order && order.ethPaid)) {
      throw new Error('Missing ETH paid for Vaunker purchase');
    }

    const buyerAllocation = order.ethPaid * VAUNKER_SALE_ROBOT_PER_ETH;

    const designers = productDesignerMap[order.product_id]?.designers || [];
    const designerAllocation = order.net_sales * DESIGNER_ROBOT_PER_DOLLAR[milestoneIndex];

    return {
      buyer: buyerAllocation,
      designers: designers.map((d) => ({
        ethAddress: d.ethAddress,
        allocation: designerAllocation * d.contributionShare,
      })),
    };
  },
};

const getTokenReward = (
  currentRevenue: number,
  dollarsSpent: number,
  order: Order,
): { buyer: number; designers: DesignerAllocation[] } => {
  let milestoneIndex = 0;
  if (currentRevenue > SALES_MILESTONES[0]) milestoneIndex = 1;
  if (currentRevenue > SALES_MILESTONES[1]) milestoneIndex = 2;
  if (currentRevenue > SALES_MILESTONES[2]) milestoneIndex = 3;
  if (currentRevenue > SALES_MILESTONES[3]) milestoneIndex = 4;

  const nextRevenue = currentRevenue + dollarsSpent;

  if (nextRevenue > SALES_MILESTONES[milestoneIndex]) {
    console.log('Next Revenue', { order, nextRevenue });
  }

  const customHandler = customRewardHandlers[order.product_id.toString()];
  if (customHandler) {
    return customHandler(order, milestoneIndex);
  }

  const designers = productDesignerMap[order.product_id]?.designers || [];
  if (!designers.length) {
    console.log('product has no designers', {
      id: order.product_id,
      title: order.product_title,
      sale: order.net_sales,
      orderName: 'order_name' in order ? order.order_name : order.product_title,
      milestoneIndex,
    });
  }

  // Handle the case where a purchase is split across milestones
  if (nextRevenue > SALES_MILESTONES[milestoneIndex]) {
    const overMilestoneSpent = nextRevenue - SALES_MILESTONES[milestoneIndex];
    const underMilestoneSpent = dollarsSpent - overMilestoneSpent;

    const overMilestoneBuyerAllocation =
      overMilestoneSpent * BUYER_ROBOT_PER_DOLLAR[milestoneIndex + 1];
    const underMilestoneBuyerAllocation =
      underMilestoneSpent * BUYER_ROBOT_PER_DOLLAR[milestoneIndex];

    const overMilestoneDesignerAllocation =
      overMilestoneSpent * DESIGNER_ROBOT_PER_DOLLAR[milestoneIndex + 1];
    const underMilestoneDesignerAllocation =
      underMilestoneSpent * DESIGNER_ROBOT_PER_DOLLAR[milestoneIndex];

    const designerAllocation = overMilestoneDesignerAllocation + underMilestoneDesignerAllocation;

    return {
      buyer: overMilestoneBuyerAllocation + underMilestoneBuyerAllocation,
      designers: designers.map((d) => ({
        ethAddress: d.ethAddress,
        allocation: designerAllocation * d.contributionShare,
      })),
    };
  }

  const designerAllocation = dollarsSpent * DESIGNER_ROBOT_PER_DOLLAR[milestoneIndex];

  return {
    buyer: dollarsSpent * BUYER_ROBOT_PER_DOLLAR[milestoneIndex],
    designers: designers.map((d) => ({
      ethAddress: d.ethAddress,
      allocation: designerAllocation * d.contributionShare,
    })),
  };
};

const getTokensAlreadyAirdropped = () => {
  const pastAirdrops = [...DEC2020_AIRDROP, ...FEB2021_AIRDROP];

  return _(pastAirdrops)
    .map((v) => ({ ...v, ethAddress: v.ethAddress.toLowerCase() }))
    .groupBy('ethAddress')
    .mapValues((drops) => drops.reduce((acc, r) => acc - weiToNumber(r.numTokens), 0))
    .value();
};

const generateMonthlyAllocation = async () => {
  let totalRevenue = INITIAL_REVENUE;

  // start with negative balances for tokens that were already airdropped
  const airdropped = getTokensAlreadyAirdropped();

  const sortedOrders = _(ALL_ORDERS).sortBy(['day', 'order_name', 'time']).value();

  const allocations: Record<string, number> = {};

  for (const order of sortedOrders) {
    const spent = getDollarsSpent(order);

    if (!spent) continue;

    const reward = getTokenReward(totalRevenue, spent, order);

    totalRevenue += spent;

    for (const designer of reward.designers) {
      const address = designer.ethAddress.toLowerCase();
      airdropped[address] = (airdropped[address] || 0) + designer.allocation;
      if (airdropped[address] > 0) {
        allocations[address] = airdropped[address];
      }
    }

    const buyerEthAddress = getEthAddress(order);
    if (!buyerEthAddress) {
      console.log(
        `No Eth Address for order ${
          'order_name' in order ? order.order_name : order.product_title
        }. Day: ${order.day}. ${order.product_title}`,
      );
      continue;
    }

    airdropped[buyerEthAddress] = (airdropped[buyerEthAddress] || 0) + reward.buyer;

    // Only add tokens to next allocation if there's no previous airdrops left
    if (airdropped[buyerEthAddress] > 0) {
      allocations[buyerEthAddress] = airdropped[buyerEthAddress];
    }
  }

  const airdropAmounts: Record<string, string> = {};
  const csvOutput: string[] = ['ethAddress,numTokens'];

  Object.keys(allocations).forEach((ethAddress) => {
    const allocation = allocations[ethAddress];
    if (allocation > 1e-8) {
      const checksumAddress = formatAddress(ethAddress);
      airdropAmounts[checksumAddress] = allocation.toString();
      csvOutput.push(`${checksumAddress},${numberToWei(allocation)}`);
    }
  });

  const totalTokens = Object.values(airdropAmounts).reduce(
    (total, amount) => (total += parseFloat(amount)),
    0,
  );
  console.log({ totalTokens, totalRevenue });

  fs.writeFileSync('./april2021/airdrop.json', JSON.stringify(airdropAmounts));
  fs.writeFileSync('./april2021/finalTokensDistributed.csv', csvOutput.join('\n'));
};

generateMonthlyAllocation();

// const loadAirdrop = async () => {
//   // Merge duplicate ETH address entries
//   const airdropList = _(DEC2020_AIRDROP)
//     .groupBy('ethAddress')
//     .mapValues(
//       drops => drops.reduce((acc, r) => ({
//         numTokens: acc.numTokens.add(stringToBn(r.tokenAmount)),
//         ethAddress: r.ethAddress,
//       }), { numTokens: stringToBn("0"), ethAddress: '' })
//     ).values().map(v => ({ ...v, numTokens: v.numTokens.toString() })).value();
//
//   fs.writeFileSync('./feb2021/airdrop.json', JSON.stringify(airdropList))
//   // console.log(airdropList.length, DEC2020_AIRDROP.length);
// }
//
// loadAirdrop()

// const calculateBuyerAllocation = async (orders: RawOrder[]) => {
//   const buyers = _(ordersWithAllocations)
//     .groupBy('customer_id')
//     .mapValues((orders) =>
//       orders.reduce(
//         (acc, order) => ({
//           numTokens: acc.numTokens + order.numTokens,
//           customerId: order.customer_id,
//         }),
//         { numTokens: 0, customerId: 0 },
//       ),
//     )
//     .values()
//     .value();
//
//   const recipients: Array<{ ethAddress: string; numTokens: number }> = [];
//
//   // map buyer purchases to ETH Addresses and token allocation
//   for (const b of buyers) {
//     const ethAddress = await getEthAddressForCustomer(b.customerId);
//     if (ethAddress) {
//       recipients.push({ ethAddress, numTokens: b.numTokens });
//     } else {
//       console.warn(
//         'Missing ETH Address for customerID: ',
//         b.customerId,
//         '. Num Tokens: ',
//         b.numTokens,
//       );
//     }
//   }
//
//   // Merge duplicate ETH address entries
//   const airdropList = _(recipients)
//     .groupBy('ethAddress')
//     .mapValues((receipts) =>
//       receipts.reduce(
//         (acc, r) => ({
//           numTokens: acc.numTokens + r.numTokens,
//           ethAddress: r.ethAddress,
//         }),
//         { numTokens: 0, ethAddress: '' },
//       ),
//     )
//     .values()
//     .value();
//
//   const tokensToDistribute = airdropList.reduce((sum, { numTokens }) => (sum += numTokens), 0);
//   const output = airdropList
//     .filter((t) => t.numTokens > 0)
//     .map((t) => `${t.ethAddress},${numberToWei(t.numTokens)}`);
//   // // Output result to console as CSV
//   console.log(output.join('\n'));
//   // console.log({ totalSales, totalTokens: totalSales * BUYER_ROBOT_PER_DOLLAR, tokensToDistribute })
// };
