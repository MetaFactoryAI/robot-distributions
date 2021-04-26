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
export type Order = ShopifyOrder | ExternalSale;
export type OrderRewardAllocation = { buyer: number; designers: DesignerAllocation[] };
