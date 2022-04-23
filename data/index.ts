import ORDERS from './all_orders.json';
import VAUNKER_SALES from '../feb2021/vaunker_sale.json';
import NFTNYC_SALES from './nftNycSales.json';
import AUCTIONS from '../feb2021/auctions.json';
import { Order } from '../lib/types';
import { getMconSales } from "../lib/formatMconSalesData";

const mconSales = getMconSales()


export const ALL_ORDERS: Array<Order> = [...ORDERS, ...VAUNKER_SALES, ...AUCTIONS, ...mconSales, ...NFTNYC_SALES];
