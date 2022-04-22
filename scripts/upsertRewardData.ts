import _ from 'lodash';
import {
  Chain,
  robot_order_constraint,
  robot_product_constraint,
  robot_product_designer_constraint,
  robot_product_designer_update_column,
  robot_product_update_column,
} from '../lib/zeus';
import BUYER_REWARD_DATA from '../data/buyerRewardData.json';
import DESIGNER_REWARD_DATA from '../data/designerRewardData.json';
import PRODUCT_DESIGNERS from '../data/productDesigners.json';

require('dotenv').config();

const { GRAPHQL_API_URL, GRAPHQL_ADMIN_SECRET } = process.env;

if (!GRAPHQL_API_URL || !GRAPHQL_ADMIN_SECRET) {
  throw new Error('Missing ENV Variables.');
}

export const upsertRewardData = async () => {
  const chain = Chain(GRAPHQL_API_URL, {
    headers: {
      'x-hasura-admin-secret': GRAPHQL_ADMIN_SECRET,
    },
  });

  const orderObjects = Object.values(BUYER_REWARD_DATA).filter((o) => o.buyer_reward > 0);

  const { insert_robot_order } = await chain('mutation')({
    insert_robot_order: [
      {
        objects: orderObjects,
        on_conflict: {
          constraint: robot_order_constraint.order_pkey,
          update_columns: [],
        },
      },
      {
        affected_rows: true,
      },
    ],
  });

  console.log('Finished inserting orders: ', insert_robot_order);

  const productDesignerData = Object.values(DESIGNER_REWARD_DATA).filter((p) => !_.isEmpty(p.designers));

  const designerNames: Record<string, string> = {};
  for (const p of Object.values(PRODUCT_DESIGNERS)) {
    for (const d of p.designers) {
      designerNames[d.ethAddress.toLowerCase()] = d.name;
    }
  }
  //
  // for (const p of productDesignerData) {
  //   for (const address in p.designers) {
  //   }
  // }

  const { insert_robot_product } = await chain('mutation')({
    insert_robot_product: [
      {
        objects: productDesignerData.map((p, i) => ({
          ...p,
          nft_token_id: 1000 + i,
          designers: {
            data: Object.values(p.designers).map((d) => ({
              ...d,
              designer_name: designerNames[d.eth_address.toLowerCase()],
            })),
            on_conflict: {
              constraint: robot_product_designer_constraint.product_designer_pkey,
              update_columns: [
                robot_product_designer_update_column.robot_reward,
                robot_product_designer_update_column.contribution_share,
                robot_product_designer_update_column.designer_name,
              ],
            },
          },
        })),
        on_conflict: {
          constraint: robot_product_constraint.product_pkey,
          update_columns: [robot_product_update_column.shopify_id, robot_product_update_column.nft_token_id],
        },
      },
      {
        affected_rows: true,
      },
    ],
  });

  console.log('Finished inserting products: ', insert_robot_product);
};

upsertRewardData().catch(e => console.error(e));
