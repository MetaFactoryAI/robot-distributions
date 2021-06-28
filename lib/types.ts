import ORDERS1 from '../data/all_orders.json';

export type DesignerAllocation = {
  ethAddress: string;
  allocation: number;
};
export type DesignerContribution = {
  name: string;
  ethAddress: string;
  contributionShare: number;
};
export type ShopifyOrder = typeof ORDERS1[0];

const shopOrder1 = {
  product_title: 'MF MASK - METADREAMER',
  product_vendor: 'METADREAMER',
  quantity: 1,
  order_id: 2175721406510,
  order_name: '#1002',
  customer_id: 3120605495342,
  product_price: 16.99,
  variant_title: '8-INCHES',
  net_sales: 0,
  cancelled: 'No',
  order_number: 1002,
  payment_method: 'direct',
  day: '2020-05-14',
  time: '13:47:25',
  product_id: 4546341240878,
};

const shopOrder2 = {
  order_number: 3847,
  order_name: '#3847',
  order_id: 3807305039918,
  product_title: 'Don’t Drink Meme-Cola" Hoodie',
  quantity: 1,
  product_id: 6593663860782,
  product_vendor: '$MEME',
  product_price: 150,
  net_quantity: 1,
  payment_method: 'direct',
  gift_card_amount: 0,
  customer_id: 5179429158958,
  is_gift_card: 'FALSE',
  day: '2021-06-25',
  net_sales: 150,
  total_refunded: 0,
};
type ShopOrder = typeof shopOrder1 | typeof shopOrder2;

type ExternalSale = {
  ethAddress: string;
  product_id: string;
  order_id: string;
  product_title: string;
  product_vendor: string;
  ethPaid?: number;
  net_sales: number;
  day: string;
};
export type Order = ShopOrder | ExternalSale;
export type OrderRewardAllocation = { buyer: number; designers: DesignerAllocation[] };
