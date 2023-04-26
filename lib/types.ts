export type DesignerAllocation = {
  ethAddress: string;
  allocation: number;
};
export type DesignerContribution = {
  name: string;
  ethAddress: string;
  contributionShare: number;
};

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

const shopOrder3 = {
  order_number: 6192,
  month: '11-2021',
  order_name: '#6192',
  order_id: 3992418123822,
  product_title: 'Axie Navy 9 Face Tee',
  quantity: 1,
  product_id: 6707335397422,
  product_price: 0,
  net_quantity: 0,
  payment_method: 'direct',
  gift_card_amount: 0,
  customer_id: 5366057271342,
  is_gift_card: 'FALSE',
  day: '2021-11-13',
  net_sales: 'NaN',
  total_refunded: 'NaN',
  order_cancelled_date: '2021-11-15',
};

export type ShopOrder = typeof shopOrder1 | typeof shopOrder2 | typeof shopOrder3;

export type ExternalSale = {
  ethAddress: string;
  product_id: string;
  alt_product_id?: string;
  order_id: string;
  product_title: string;
  product_vendor: string;
  ethPaid?: number;
  net_sales: number;
  day: string;
  time?: string;
};
export type Order = ShopOrder | ExternalSale;
export type OrderRewardAllocation = {
  buyer: number;
  designers: DesignerAllocation[];
  buyerSpent: number;
  season: number;
};

export type OrderEthAddressData = {
  id: string,
  customAttributes: Array<{ key: string, value: string }>,
  note: string
}
