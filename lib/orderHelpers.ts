import _ from 'lodash';
import CUSTOMER_ETH_ADDRESSES from '../data/customerEthAddresses.json';
import { ExternalSale, Order, ShopOrder } from './types';
import { getEthAddressForCustomer, getEthAddressFromOrder, resolveEnsToAddress } from './api';

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

    // Free products shouldn't deduct shipping from net_sales
    if (
      typeof order.total_refunded === 'number' &&
      order.net_quantity > 0 &&
      order.net_sales < 0
    ) {
      return 0;
    }
  }

  return order.net_sales;
};

export const getEthAddressForOrder = async (order: Order): Promise<string | null> => {
  let addressOrEns: string | null = null;
  const customerId = 'customer_id' in order ? order.customer_id?.toString() : null;

  if ('ethAddress' in order && order.ethAddress) {
    addressOrEns = order.ethAddress.toLowerCase();
  } else if (customerId) {
    addressOrEns = customerEthAddressMap[customerId]?.toLowerCase();
  }

  if (!addressOrEns) {
    addressOrEns = await getEthAddressFromOrder(order.order_id.toString());
  }

  const address = addressOrEns && await resolveEnsToAddress(addressOrEns);

  return address // || (await getEthAddressForCustomer(customerId));
};

