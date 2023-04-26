import eligibleWearables from '../data/eligibleWearables.json';
import { Order, ShopOrder } from '../lib/types';
import _ from 'lodash';
import ShopOrders from '../data/all_orders.json';
import { getEthAddressForCustomer } from '../lib/api';
import assert from 'assert';
import fs from 'fs';
import { getEthAddressForOrder } from '../lib/orderHelpers';

type GiveawayItem = {
  'to': string,
  'erc1155': [{
    'contractAddress': string,
    'ids': string[],
    'values': number[]
  }],
  'erc721': [],
  'erc20': {
    'contractAddresses': [],
    'amounts': []
  }
};

const WEARABLES_CONTRACT_ADDRESS = '0x65725931BF9d37d7e1b1CEb90928271B572829F4';

const generateGiveawayData = async () => {
  const sortedOrders: ShopOrder[] = _(ShopOrders).sortBy(['day', 'order_name', 'time']).value();
  const eligibleOrders = sortedOrders.filter(o => eligibleWearables.find(w => w.shopify_id === o.product_id.toString()));
  console.log(`${eligibleOrders.length} eligible orders out of ${sortedOrders.length}`);
  const ordersByAddress: Record<string, ShopOrder[]> = {};

  for (const order of eligibleOrders) {
    let ethAddress = await getEthAddressForOrder(order);
    if (ethAddress) {
      if (!ordersByAddress[ethAddress]) ordersByAddress[ethAddress] = [];
      ordersByAddress[ethAddress].push(order)
    }
  }
  const ethAddresses = _.keys(ordersByAddress);
  const wearablesByShopifyId = _.keyBy(eligibleWearables, 'shopify_id');

  const giveawayData: GiveawayItem[] = [];
  for (const ethAddress of ethAddresses) {
    console.log(`got ${giveawayData.length} items from ${ethAddresses.length} customers`);

    if (ethAddress) {
      const giveaway: GiveawayItem = {
        to: ethAddress,
        erc1155: [{ contractAddress: WEARABLES_CONTRACT_ADDRESS, ids: [], values: [] }],
        erc721: [],
        erc20: {
          'contractAddresses': [],
          'amounts': [],
        },
      };

      const productQuantitiesOrdered = _(ordersByAddress[ethAddress]).groupBy('product_id').mapValues(v => v.reduce((acc, o) => {
          return acc + ('net_quantity' in o ? o.net_quantity : o.quantity);
        }, 0,
      )).value();

      for (const productId in productQuantitiesOrdered) {
        const nftTokenId = wearablesByShopifyId[productId].nft_token_id;
        const quantity = productQuantitiesOrdered[productId.toString()];
        assert(nftTokenId);
        if (quantity <= 0) {
          console.log('NO QUANTITY!!');
        }
        if (quantity > 0) {
          giveaway.erc1155[0].ids.push(nftTokenId.toString());
          giveaway.erc1155[0].values.push(quantity);
        }
      }

      giveawayData.push(giveaway)
    }
  }

  fs.writeFileSync('./june2022/wearablesGiveaway.json', JSON.stringify(giveawayData));

};

generateGiveawayData();
