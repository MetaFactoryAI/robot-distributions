import _ from 'lodash';
import fs from 'fs';
import CURRENT_PRODUCT_DESIGNERS from '../data/productDesigners.json';
import { ALL_ORDERS } from '../data';

import { DesignerContribution } from '../lib/types';

type ProductDesignerInfo = {
  productId: number | string;
  title: string;
  designers: DesignerContribution[];
};

export const productDesignerMap: Record<string, ProductDesignerInfo> = CURRENT_PRODUCT_DESIGNERS;

const generateProductDesignersMap = () => {
  const products = _(ALL_ORDERS)
    .filter(order => {
      if (!order.product_id) {
        console.warn('Missing product ID for order: ', order)
      }

      return Boolean(order.product_id)
    })
    .groupBy('product_id')
    .mapValues((orders) =>
      orders.reduce(
        (acc, order) => ({
          productId: order.product_id,
          title: order.product_title,
          designers: [],
        }),
        { productId: 0, title: '', designers: [] } as ProductDesignerInfo,
      ),
    )
    .values()
    .value();

  for (const p of products) {
    const existing = productDesignerMap[p.productId];
    if (!existing) {
      productDesignerMap[p.productId] = p;
    } else {
      if (existing.title !== p.title) {
        console.log('Wrong title', existing, p);
      }
    }
  }

  fs.writeFileSync('./data/productDesigners.json', JSON.stringify(productDesignerMap));
};

generateProductDesignersMap();
