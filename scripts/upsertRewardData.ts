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

  const designerData = Object.values(DESIGNER_REWARD_DATA).filter((p) => !_.isEmpty(p.designers));

  const { insert_robot_product } = await chain('mutation')({
    insert_robot_product: [
      {
        objects: designerData.map((p) => ({
          ...p,
          designers: {
            data: Object.values(p.designers),
            on_conflict: {
              constraint: robot_product_designer_constraint.product_designer_pkey,
              update_columns: [
                robot_product_designer_update_column.robot_reward,
                robot_product_designer_update_column.contribution_share,
              ],
            },
          },
        })),
        on_conflict: {
          constraint: robot_product_constraint.product_pkey,
          update_columns: [robot_product_update_column.title],
        },
      },
      {
        affected_rows: true,
      },
    ],
  });

  console.log('Finished inserting products: ', insert_robot_product);
};

upsertRewardData();