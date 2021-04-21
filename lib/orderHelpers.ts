import _ from 'lodash';
import CUSTOMER_ETH_ADDRESSES from '../data/customerEthAddresses.json';
import { Order } from './types';

const customerEthAddressMap = _(CUSTOMER_ETH_ADDRESSES)
  .keyBy('customerId')
  .mapValues((v) => v.ethAddress.toLowerCase())
  .value();

export const getDollarsSpent = (order: Order): number => {
  if ('payment_method' in order && order.payment_method === 'gift_cards_only') return 0;
  if ('order_name' in order && order.product_title === 'MF GIFT CARD') return order.product_price;

  return order.net_sales;
};

export const getEthAddress = (order: Order) => {
  if ('ethAddress' in order) return order.ethAddress;
  return customerEthAddressMap[order.customer_id.toString()]?.toLowerCase();
};
