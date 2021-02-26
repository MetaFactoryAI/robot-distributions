import ORDERS1 from '../data/sales_2020-01-01_2020-12-06-2.json';

export type DesignerAllocation = {
  ethAddress: string;
  allocation: number;
};
export type DesignerContribution = {
  name: string;
  ethAddress: string;
  contributionShare: number;
};
type ShopifyOrder = typeof ORDERS1[0];
type ExternalSale = {
  ethAddress: string;
  product_id: string;
  product_title: string;
  product_vendor: string;
  ethPaid?: number;
  net_sales: number;
  day: string;
};
export type Order = ShopifyOrder | ExternalSale;
export type OrderRewardAllocation = { buyer: number; designers: DesignerAllocation[] };
