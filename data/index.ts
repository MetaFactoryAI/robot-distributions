import ORDERS1 from './sales_2020-01-01_2020-12-06-2.json';
import ORDERS2 from './sales_2020-12-06_2021-02-23.json';
import VAUNKER_SALES from '../feb2021/vaunker_sale.json';
import AUCTIONS from '../feb2021/auctions.json';
import { Order } from '../lib/types';

export const ALL_ORDERS: Array<Order> = [...ORDERS1, ...ORDERS2, ...VAUNKER_SALES, ...AUCTIONS];
