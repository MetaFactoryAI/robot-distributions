import _ from 'lodash';
import * as fs from 'fs';
import { formatAddress, weiToNumber } from './lib/ethHelpers';
import {
  DesignerAllocation,
  DesignerContribution,
  Order,
  OrderRewardAllocation,
} from './lib/types';

import PRODUCT_DESIGNERS from './data/productDesigners.json';
import ROBOT_MA from './data/robotMovingAverage.json';
import BUYER_REWARDS_BY_ORDER from './june2021/buyerRewardsByOrder.json';
import DESIGNER_REWARDS_BY_ORDER from './june2021/designerRewardsByOrder.json';

import { ALL_ORDERS } from './data';
import { getDollarsSpent, getEthAddress } from './lib/orderHelpers';

const SALES_MILESTONES = [100_000, 110_000, 200_000, 400_000, 800_000, 1_600_000];
const BUYER_ROBOT_PER_DOLLAR = [0.4, 0.2, 0.05, 0.025];
const DESIGNER_ROBOT_PER_DOLLAR = [0.16, 0.12, 0.05, 0.025, 0.0125, 0.00625];

const BUYER_ROBOT_PERCENT_BACK = 0.42;

const SWITCH_TO_PERCENT_MILESTONE_INDEX = 4;

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
  (order: Order, milestoneIndex: number, usePercentBuyerRewards?: boolean) => OrderRewardAllocation
> = {
  'VAUNKER-KEYCARD': (order, milestoneIndex) => {
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

const getBuyerTokenReward = (
  milestoneIndex: number,
  order: Order,
  dollarsSpent: number,
): number => {
  if (milestoneIndex >= SWITCH_TO_PERCENT_MILESTONE_INDEX) {
    // use 42% back reward based on moving avg ROBOT price
    const robotPrice = ROBOT_MA[order.day as keyof typeof ROBOT_MA];
    if (!robotPrice) {
      console.error('Unable to get ROBOT price for order: ', order);
    }

    const dollarReward = dollarsSpent * BUYER_ROBOT_PERCENT_BACK;
    return dollarReward / robotPrice;
  }

  return dollarsSpent * BUYER_ROBOT_PER_DOLLAR[milestoneIndex];
};

const getDesignerTokenReward = (milestoneIndex: number, dollarsSpent: number): number => {
  return dollarsSpent * DESIGNER_ROBOT_PER_DOLLAR[milestoneIndex];
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
  if (currentRevenue > SALES_MILESTONES[4]) milestoneIndex = 5;

  const usePercentBuyerRewards = milestoneIndex >= 4;

  const nextRevenue = currentRevenue + dollarsSpent;

  if (nextRevenue > SALES_MILESTONES[milestoneIndex]) {
    console.log('Next Revenue', { order, nextRevenue });
  }

  const customHandler = customRewardHandlers[order.product_id.toString()];
  if (customHandler) {
    return customHandler(order, milestoneIndex, usePercentBuyerRewards);
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

    const overMilestoneBuyerAllocation = getBuyerTokenReward(
      milestoneIndex + 1,
      order,
      overMilestoneSpent,
    );
    const underMilestoneBuyerAllocation = getBuyerTokenReward(
      milestoneIndex,
      order,
      underMilestoneSpent,
    );

    const overMilestoneDesignerAllocation = getDesignerTokenReward(
      milestoneIndex + 1,
      overMilestoneSpent,
    );
    const underMilestoneDesignerAllocation = getDesignerTokenReward(
      milestoneIndex,
      underMilestoneSpent,
    );

    const designerAllocation = overMilestoneDesignerAllocation + underMilestoneDesignerAllocation;

    return {
      buyer: overMilestoneBuyerAllocation + underMilestoneBuyerAllocation,
      designers: designers.map((d) => ({
        ethAddress: d.ethAddress,
        allocation: designerAllocation * d.contributionShare,
      })),
    };
  }

  const designerAllocation = getDesignerTokenReward(milestoneIndex, dollarsSpent);

  return {
    buyer: getBuyerTokenReward(milestoneIndex, order, dollarsSpent),
    designers: designers.map((d) => ({
      ethAddress: d.ethAddress,
      allocation: designerAllocation * d.contributionShare,
    })),
  };
};

// const getTokensAlreadyAirdropped = () => {
//   const pastAirdrops = [...DEC2020_AIRDROP, ...FEB2021_AIRDROP];
//
//   return _(pastAirdrops)
//     .map((v) => ({ ...v, ethAddress: v.ethAddress.toLowerCase() }))
//     .groupBy('ethAddress')
//     .mapValues((drops) => drops.reduce((acc, r) => acc - weiToNumber(r.numTokens), 0))
//     .value();
// };

const getBuyerRewardsAlreadyDistributedForOrders = (): Record<
  string,
  { address: string; amount: number }
> => {
  return _(BUYER_REWARDS_BY_ORDER)
    .mapValues((v) => ({ ...v, amount: -v.amount }))
    .value();
};

const getDesignerRewardsAlreadyDistributedForOrders = (): Record<
  string,
  Record<string, number>
> => {
  return _(DESIGNER_REWARDS_BY_ORDER)
    .mapValues((d) => _.mapValues(d, (v) => -v))
    .value();
};

const generateMonthlyAllocation = async () => {
  let totalRevenue = INITIAL_REVENUE;

  // start with negative balances for order rewards that were already distributed
  const buyerDistributed = getBuyerRewardsAlreadyDistributedForOrders();
  const designerDistributed = getDesignerRewardsAlreadyDistributedForOrders();

  const sortedOrders = _(ALL_ORDERS).sortBy(['day', 'order_name', 'time']).value();

  for (const order of sortedOrders) {
    const spent = getDollarsSpent(order);

    if (!spent) continue;

    const reward = getTokenReward(totalRevenue, spent, order);

    const orderId = `${order.order_id}`;
    if (!designerDistributed[orderId]) {
      designerDistributed[orderId] = {};
    }
    if (!buyerDistributed[orderId]) {
      buyerDistributed[orderId] = { amount: 0, address: '' };
    }

    totalRevenue += spent;

    for (const designer of reward.designers) {
      const address = designer.ethAddress.toLowerCase();
      designerDistributed[orderId][address] =
        (designerDistributed[orderId][address] || 0) + designer.allocation;
    }

    const buyerEthAddress = getEthAddress(order);

    if (!buyerEthAddress) {
      // console.log(
      //   `No Eth Address for order ${
      //     'order_name' in order ? order.order_name : order.product_title
      //   }. Day: ${order.day}. ${order.product_title}`,
      // );
      continue;
    }

    buyerDistributed[orderId] = {
      address: buyerEthAddress,
      amount: (buyerDistributed[orderId]?.amount || 0) + reward.buyer,
    };
  }

  const airdropAmounts: Record<string, number> = {};

  const buyerRewards = _.values(buyerDistributed);
  const designerRewards = _.values(designerDistributed);

  for (const reward of buyerRewards) {
    if (reward.amount > 1e-8) {
      const checksumAddress = formatAddress(reward.address);
      airdropAmounts[checksumAddress] = (airdropAmounts[checksumAddress] || 0) + reward.amount;
    } else if (reward.amount < -1e-8) {
      console.log('Negative buyer reward', reward);
    }
  }

  for (const reward of designerRewards) {
    for (const address in reward) {
      if (reward[address] > 1e-8) {
        const checksumAddress = formatAddress(address);
        airdropAmounts[checksumAddress] = (airdropAmounts[checksumAddress] || 0) + reward[address];
      } else if (reward[address] < -1e-8) {
        console.log('Negative designer reward', { reward, address });
      }
    }
  }

  const airdropOutput = _.mapValues(airdropAmounts, (v) => v.toString());

  // Object.keys(airdropAmounts).forEach((ethAddress) => {
  //   const amount = airdropAmounts[ethAddress];
  //   if (amount > 1e-8) {
  //     const checksumAddress = formatAddress(ethAddress);
  //     airdropAmounts[checksumAddress] = allocation.toString();
  //     csvOutput.push(`${checksumAddress},${numberToWei(allocation)}`);
  //   }
  // });

  // Check that designers map is configured properly
  Object.values(productDesignerMap).forEach((product) => {
    const totalContributionShare = product.designers.reduce(
      (acc, d) => acc + d.contributionShare,
      0,
    );

    // because math isnt perfectly accurate in JS
    const totalShareRounded = +totalContributionShare.toFixed(2);
    if (totalShareRounded !== 1) {
      console.warn('Design contribution does not add up to 100%, ', {
        totalContributionShare,
        product,
      });
    }
  });

  const totalTokens = Object.values(airdropAmounts).reduce((total, amount) => (total += amount), 0);
  console.log({ totalTokens, totalRevenue });

  fs.writeFileSync('./aug2021/airdrop.json', JSON.stringify(airdropOutput));
};

const generateDistributedOrders = async () => {
  let totalRevenue = INITIAL_REVENUE;

  const sortedOrders = _(ALL_ORDERS).sortBy(['day', 'order_name', 'time']).value();

  const buyerOrdersDistributed: Record<string, { address: string; amount: number }> = {};
  const designerOrdersDistributed: Record<string, Record<string, number>> = {};

  for (const order of sortedOrders) {
    const spent = getDollarsSpent(order);

    if (!spent) continue;

    const orderId = `${order.order_id}`;

    if (!designerOrdersDistributed[orderId]) {
      designerOrdersDistributed[orderId] = {};
    }
    const reward = getTokenReward(totalRevenue, spent, order);

    totalRevenue += spent;

    for (const designer of reward.designers) {
      const address = designer.ethAddress.toLowerCase();
      designerOrdersDistributed[orderId][address] =
        (designerOrdersDistributed[orderId][address] || 0) + designer.allocation;
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

    buyerOrdersDistributed[`${order.order_id}`] = {
      address: buyerEthAddress,
      amount: (buyerOrdersDistributed[`${order.order_id}`]?.amount || 0) + reward.buyer,
    };
  }

  fs.writeFileSync('./aug2021/buyerRewardsByOrder.json', JSON.stringify(buyerOrdersDistributed));
  fs.writeFileSync(
    './aug2021/designerRewardsByOrder.json',
    JSON.stringify(designerOrdersDistributed),
  );
};

generateMonthlyAllocation();
//
generateDistributedOrders();
