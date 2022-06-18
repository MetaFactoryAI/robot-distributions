import _ from 'lodash';
import CUSTOMER_ETH_ADDRESSES from '../data/customerEthAddresses.json';
import { ExternalSale, Order, ShopOrder } from './types';

const customerEthAddressMap = _(CUSTOMER_ETH_ADDRESSES)
  .keyBy('customerId')
  .mapValues((v) => v.ethAddress.toLowerCase())
  .value();

export const isShopOrder = (order: Order): order is ShopOrder => {
  return 'payment_method' in order;
};

export const getBuyerDollarsSpent = (order: Order): number => {
  if (isShopOrder(order) && order.payment_method === 'gift_cards_only') return 0;
  if (isShopOrder(order) && order.payment_method === 'gift_card') return 0;
  if (isShopOrder(order) && order.product_title === 'MF GIFT CARD') return order.product_price;

  return getDesignerDollarsEarned(order);
};

export const getDesignerDollarsEarned = (order: Order): number => {
  if (typeof order.net_sales !== 'number') {
    return 0;
  }

  if ('order_cancelled_date' in order && order.order_cancelled_date) {
    return 0;
  }

  if ('net_quantity' in order) {
    // Index COOP Hoodie where it was paid for by the DAO
    if (order.product_id === 6566448234542 && order.net_quantity > 0 && order.net_sales === 0) {
      return order.product_price * order.net_quantity;
    }
    // Refunds shouldnt deduct shipping from net_sales
    if (
      order.total_refunded &&
      typeof order.total_refunded === 'number' &&
      order.total_refunded + order.net_sales === order.product_price
    ) {
      return 0;
    }
  }

  return order.net_sales;
};

export const getEthAddress = (order: Order) => {
  if ('ethAddress' in order) return order.ethAddress;
  return customerEthAddressMap[order.customer_id.toString()]?.toLowerCase();
};

