import ORDERS from './all_orders.json';
import VAUNKER_SALES from '../feb2021/vaunker_sale.json';
import AUCTIONS from '../feb2021/auctions.json';
import { Order } from '../lib/types';

export const ALL_ORDERS: Array<Order> = [...ORDERS, ...VAUNKER_SALES, ...AUCTIONS];
