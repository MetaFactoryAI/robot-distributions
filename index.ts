import _ from 'lodash';
import * as fs from 'fs';
import { formatAddress } from './lib/ethHelpers';
import { DesignerContribution, Order, OrderRewardAllocation } from './lib/types';

import PRODUCT_DESIGNERS from './data/productDesigners.json';
import ROBOT_MA from './data/robotMovingAverage.json';
import BUYER_REWARDS_BY_ORDER from './aug2021/buyerRewardsByOrder.json';
import DESIGNER_REWARDS_BY_ORDER from './aug2021/designerRewardsByOrder.json';

import { ALL_ORDERS } from './data';
import { getBuyerDollarsSpent, getDesignerDollarsEarned, getEthAddress } from './lib/orderHelpers';
import { getMconDesignerRewards } from './lib/formatMconSalesData';

const SALES_MILESTONES = [
  100_000,
  110_000,
  200_000,
  400_000,
  800_000,
  1_600_000,
  3_200_000,
  6_400_000,
];
const BUYER_ROBOT_PER_DOLLAR = [0.4, 0.2, 0.05, 0.025, '42%', '42%', '42%', '42%'];
const DESIGNER_ROBOT_PER_DOLLAR = [0.16, 0.12, 0.05, 0.025, 0.0125, 0.0125, 0.00625, '42%'];

const INITIAL_REVENUE = 50_000;

const VAUNKER_SALE_ROBOT_PER_ETH = 42;

// min # of ROBOT needed to be included in distro
const REWARD_DISTRO_THRESHOLD = 1e-8;

const CURRENT_DISTRO_MONTH = 'oct2021';

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
  'VAUNKER-KEYCARD': (order, milestoneIndex) => {
    if (!('ethPaid' in order && order.ethPaid)) {
      throw new Error('Missing ETH paid for Vaunker purchase');
    }

    const buyerAllocation = order.ethPaid * VAUNKER_SALE_ROBOT_PER_ETH;

    const designers = productDesignerMap[order.product_id]?.designers || [];
    const designerRatio = DESIGNER_ROBOT_PER_DOLLAR[milestoneIndex];
    if (typeof designerRatio !== 'number') {
      throw new Error('Invalid designer reward emount for VAUNKER KEYCARD');
    }
    const designerAllocation = order.net_sales * designerRatio;

    return {
      buyerSpent: order.net_sales,
      designerEarned: order.net_sales,
      buyer: buyerAllocation,
      designers: designers.map((d) => ({
        ethAddress: d.ethAddress,
        allocation: designerAllocation * d.contributionShare,
      })),
    };
  },
};

const calculateRobotToReward = (
  rewardRatio: string | number,
  order: Order,
  dollarsSpent: number,
) => {
  if (typeof rewardRatio === 'number') {
    // Robot per dollar spent reward
    return dollarsSpent * rewardRatio;
  }

  // Percent back reward
  const robotPrice = ROBOT_MA[order.day as keyof typeof ROBOT_MA];
  if (!robotPrice) {
    throw new Error(`Unable to get ROBOT price for order: ${order}`);
  }

  const percentReward = parseFloat(rewardRatio) / 100;
  const dollarReward = dollarsSpent * percentReward;
  return dollarReward / robotPrice;
};

const getTokenReward = (currentRevenue: number, order: Order): OrderRewardAllocation => {
  let milestoneIndex = 0;
  if (currentRevenue > SALES_MILESTONES[0]) milestoneIndex = 1;
  if (currentRevenue > SALES_MILESTONES[1]) milestoneIndex = 2;
  if (currentRevenue > SALES_MILESTONES[2]) milestoneIndex = 3;
  if (currentRevenue > SALES_MILESTONES[3]) milestoneIndex = 4;
  if (currentRevenue > SALES_MILESTONES[4]) milestoneIndex = 5;
  if (currentRevenue > SALES_MILESTONES[5]) milestoneIndex = 6;

  const buyerSpent = getBuyerDollarsSpent(order);
  const designerEarned = getDesignerDollarsEarned(order);

  if (!buyerSpent && !designerEarned) {
    return {
      buyerSpent: 0,
      designerEarned: 0,
      buyer: 0,
      designers: [],
    };
  }

  const nextRevenue = currentRevenue + buyerSpent;
  const nextRevenueDesigner = currentRevenue + designerEarned;

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

  // Simple case where we havent hit the next milestone yet
  if (nextRevenue <= SALES_MILESTONES[milestoneIndex]) {
    const buyerAllocation = calculateRobotToReward(
      BUYER_ROBOT_PER_DOLLAR[milestoneIndex],
      order,
      buyerSpent,
    );
    const designerAllocation = calculateRobotToReward(
      DESIGNER_ROBOT_PER_DOLLAR[milestoneIndex],
      order,
      designerEarned,
    );

    return {
      buyerSpent,
      designerEarned,
      buyer: buyerAllocation,
      designers: designers.map((d) => ({
        ethAddress: d.ethAddress,
        allocation: designerAllocation * d.contributionShare,
      })),
    };
  }

  // Handle the case where a purchase is split across milestones
  const overMilestoneSpent = nextRevenue - SALES_MILESTONES[milestoneIndex];
  const underMilestoneSpent = buyerSpent - overMilestoneSpent;

  const overMilestoneBuyerAllocation = calculateRobotToReward(
    BUYER_ROBOT_PER_DOLLAR[milestoneIndex + 1],
    order,
    overMilestoneSpent,
  );
  const underMilestoneBuyerAllocation = calculateRobotToReward(
    BUYER_ROBOT_PER_DOLLAR[milestoneIndex],
    order,
    underMilestoneSpent,
  );

  const overMilestoneEarnedDesigner = nextRevenueDesigner - SALES_MILESTONES[milestoneIndex];
  const underMilestoneEarnedDesigner = designerEarned - overMilestoneEarnedDesigner;

  const overMilestoneDesignerAllocation = calculateRobotToReward(
    DESIGNER_ROBOT_PER_DOLLAR[milestoneIndex + 1],
    order,
    overMilestoneEarnedDesigner,
  );
  const underMilestoneDesignerAllocation = calculateRobotToReward(
    DESIGNER_ROBOT_PER_DOLLAR[milestoneIndex],
    order,
    underMilestoneEarnedDesigner,
  );

  const buyerAllocation = overMilestoneBuyerAllocation + underMilestoneBuyerAllocation;
  const designerAllocation = overMilestoneDesignerAllocation + underMilestoneDesignerAllocation;

  return {
    buyerSpent,
    designerEarned,
    buyer: buyerSpent ? buyerAllocation : 0,
    designers: designers.map((d) => ({
      ethAddress: d.ethAddress,
      allocation: designerAllocation * d.contributionShare,
    })),
  };
};

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
    const reward = getTokenReward(totalRevenue, order);

    // Nothing to distribute
    if (!reward.buyerSpent && (!reward.designers.length || !reward.designerEarned)) continue;

    const orderId = `${order.order_id}`;
    if (!designerDistributed[orderId]) {
      designerDistributed[orderId] = {};
    }
    if (!buyerDistributed[orderId]) {
      buyerDistributed[orderId] = { amount: 0, address: '' };
    }

    if (typeof reward.buyerSpent === 'string') {
      throw new Error(`Buyer order string: ${JSON.stringify(order, null, 2)}`);
    }

    totalRevenue += reward.buyerSpent;

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
  const buyerAirdropAmounts: Record<string, number> = {};
  const designerAirdropAmounts: Record<string, number> = {};

  const buyerRewards = _.values<{ address: string; amount: number }>(buyerDistributed);
  const designerRewards = _.values<Record<string, number>>(designerDistributed);

  for (const reward of buyerRewards) {
    if (reward.amount > REWARD_DISTRO_THRESHOLD) {
      const checksumAddress = formatAddress(reward.address);
      buyerAirdropAmounts[checksumAddress] =
        (buyerAirdropAmounts[checksumAddress] || 0) + reward.amount;
      airdropAmounts[checksumAddress] = (airdropAmounts[checksumAddress] || 0) + reward.amount;
    } else if (reward.amount < -REWARD_DISTRO_THRESHOLD) {
      console.log('Negative buyer reward', reward);
    }
  }

  for (const reward of designerRewards) {
    for (const address in reward) {
      const rewardAmount = reward[address];

      if (rewardAmount < -REWARD_DISTRO_THRESHOLD)
        console.log('Negative designer reward', { reward, address });

      if (rewardAmount <= REWARD_DISTRO_THRESHOLD) continue;

      // Dont actually distribute to this, handled separately because we dont know what order had what items
      if (address === 'mcon-distributor-placeholder-address') {
        const mconDesignerRewards = getMconDesignerRewards(rewardAmount);
        for (const designerAddress in mconDesignerRewards) {
          const amount = mconDesignerRewards[designerAddress];
          const checksumAddress = formatAddress(designerAddress);

          designerAirdropAmounts[checksumAddress] =
            (designerAirdropAmounts[checksumAddress] || 0) + amount;
          airdropAmounts[checksumAddress] = (airdropAmounts[checksumAddress] || 0) + amount;
        }
      } else {
        const checksumAddress = formatAddress(address);
        designerAirdropAmounts[checksumAddress] =
          (designerAirdropAmounts[checksumAddress] || 0) + rewardAmount;
        airdropAmounts[checksumAddress] = (airdropAmounts[checksumAddress] || 0) + rewardAmount;
      }
    }
  }

  const airdropOutput = _.mapValues(airdropAmounts, (v) => v.toString());

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
  const totalBuyerTokens = Object.values(buyerAirdropAmounts).reduce(
    (total, amount) => (total += amount),
    0,
  );
  const totalDesignerTokens = Object.values(designerAirdropAmounts).reduce(
    (total, amount) => (total += amount),
    0,
  );
  console.log({
    totalBuyerTokens,
    totalDesignerTokens,
    total: totalBuyerTokens + totalDesignerTokens,
    totalTokens,
    totalRevenue,
  });

  fs.writeFileSync(`./${CURRENT_DISTRO_MONTH}/airdrop.json`, JSON.stringify(airdropOutput));
  fs.writeFileSync(
    `./${CURRENT_DISTRO_MONTH}/airdrop.csv`,
    `address,amount\n${Object.entries(airdropOutput)
      .map((e) => e.join(','))
      .join('\n')}`,
  );
};

const generateDistributedOrders = async () => {
  let totalRevenue = INITIAL_REVENUE;

  const sortedOrders = _(ALL_ORDERS).sortBy(['day', 'order_name', 'time']).value();

  const buyerOrdersDistributed: Record<string, { address: string; amount: number }> = {};
  const designerOrdersDistributed: Record<string, Record<string, number>> = {};

  for (const order of sortedOrders) {
    const orderId = `${order.order_id}`;

    if (!designerOrdersDistributed[orderId]) {
      designerOrdersDistributed[orderId] = {};
    }
    const reward = getTokenReward(totalRevenue, order);

    totalRevenue += reward.buyerSpent;

    for (const designer of reward.designers) {
      const address = designer.ethAddress.toLowerCase();
      designerOrdersDistributed[orderId][address] =
        (designerOrdersDistributed[orderId][address] || 0) + designer.allocation;
    }

    const buyerEthAddress = getEthAddress(order);
    if (!buyerEthAddress) {
      continue;
    }

    buyerOrdersDistributed[`${order.order_id}`] = {
      address: buyerEthAddress,
      amount: (buyerOrdersDistributed[`${order.order_id}`]?.amount || 0) + reward.buyer,
    };
  }

  fs.writeFileSync(
    `./${CURRENT_DISTRO_MONTH}/buyerRewardsByOrder.json`,
    JSON.stringify(buyerOrdersDistributed),
  );
  fs.writeFileSync(
    `./${CURRENT_DISTRO_MONTH}/designerRewardsByOrder.json`,
    JSON.stringify(designerOrdersDistributed),
  );
};

generateMonthlyAllocation().then(() => {
  generateDistributedOrders().then(() => {
    console.log('Done!');
  });
});
