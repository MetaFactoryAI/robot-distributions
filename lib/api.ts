import _ from 'lodash';
import { gql, GraphQLClient } from 'graphql-request';
import { web3 } from './ethHelpers';

const ENDPOINT = process.env.GRAPHQL_ENDPOINT;
const TOKEN = process.env.ACCESS_TOKEN;

if (!ENDPOINT || !TOKEN) {
  throw new Error('Missing ENV Variables.');
}

const client = new GraphQLClient(ENDPOINT, { headers: { 'X-Shopify-Access-Token': TOKEN } });

const CUSTOMER_QUERY = gql`
  query getEthFieldForCustomer($id: ID!) {
    customer(id: $id) {
      id
      displayName
      email
      tags
      orders(first: 20) {
        edges {
          node {
            id
            email
            customAttributes {
              key
              value
            }
            note
          }
        }
      }
      metafield(key: "ethereum_address", namespace: "cf_app") {
        id
        value
      }
    }
  }
`;

const MISSING_ETH_ADDRESS_TAG = 'missing_eth_address';

const CUSTOMER_ID_PREFIX = 'gid://shopify/Customer/';
const ETH_REGEX = /0x[a-fA-F0-9]{40}/;
const ENS_REGEX = /\w+\.eth/;

type CustomAttribute = { key: string; value: string };

const nodeIdToCustomerId = (nodeId: string) => nodeId.split(CUSTOMER_ID_PREFIX)[1];
const customerIdToNodeId = (id: string | number) => `${CUSTOMER_ID_PREFIX}${id}`;

const extractEthAddress = (s: string | null | undefined) =>
  s && (s.match(ETH_REGEX)?.[0] || s.match(ENS_REGEX)?.[0]);

export const resolveEnsToAddress = async (addressOrEnsName: string): Promise<string | null> => {
  // already resolved
  if (web3.utils.isAddress(addressOrEnsName)) return addressOrEnsName.toLowerCase();

  const ensName = addressOrEnsName.match(ENS_REGEX)?.[0];

  if (!ensName) {
    console.warn('Unable to resolve ETH address from', addressOrEnsName);
    return null;
  }

  console.log(`Fetching ETH address for ENS`, ensName);
  try {
    const ethAddress = await web3.eth.ens.getAddress(ensName);
    console.log({ ethAddress, ensName });
    return ethAddress.toLowerCase();
  } catch (e) {
    console.warn('Unable to resolve ETH address for ENS: ', ensName, e);
    return null;
  }
};

const getEthAddressFromCustomAttributes = (attributes: CustomAttribute[]) => {
  return attributes.find((a: CustomAttribute) => a.key === 'Ethereum Address')?.value;
};

export const getEthAddressForCustomer = async (customerId: number | string | null): Promise<string | null> => {
  if (!customerId) return null
  console.log('fetching remote address ');

  const data = await client.request(CUSTOMER_QUERY, { id: customerIdToNodeId(customerId) });

  // Check if address is already set in metafield
  let address = extractEthAddress(data.customer.metafield?.value);
  if (address) return resolveEnsToAddress(address);

  // Otherwise check if the user gave the ETH address at checkout
  const allAddresses = await getAllAddressesForCustomer(customerId);

  const latestAddress = _.last(allAddresses);

  // Set the address in the metafield for the customer
  if (latestAddress) {
    await updateEthAddressForCustomer(data.customer, latestAddress);
    return latestAddress;
  }

  await setMissingEthAddressTagForCustomer(data.customer);
  return null;
};

export const getAllAddressesForCustomer = async (customerId: number | string): Promise<string[]> => {
  const data = await client.request(CUSTOMER_QUERY, { id: customerIdToNodeId(customerId) });

  const addresses = new Set<string>();

  // Check if the user gave the ETH address at checkout in past orders
  const ethAddressFields = _.reduce(
    data.customer.orders.edges,
    (ethAddresses, order) => {
      const address = getEthAddressFromCustomAttributes(order.node.customAttributes);
      if (address) {
        ethAddresses.push(address);
      }
      const notesAddress = extractEthAddress(order.node.note);
      if (notesAddress) {
        ethAddresses.push(notesAddress);
      }
      return ethAddresses;
    },
    [] as string[],
  );

  for (const address of ethAddressFields) {
    const extracted = extractEthAddress(address);
    const resolved = extracted && (await resolveEnsToAddress(extracted));
    if (resolved) {
      addresses.add(resolved);
    }
  }

  return Array.from(addresses);
};

const SET_ETH_ADDRESS_MUTATION = gql`
  mutation setEthAddressForCustomer($id: ID!, $address: String!, $fieldId: ID, $tags: [String!]) {
    customerUpdate(
      input: {
        id: $id
        tags: $tags
        metafields: [
          {
            key: "ethereum_address"
            namespace: "cf_app"
            value: $address
            valueType: STRING
            id: $fieldId
          }
        ]
      }
    ) {
      customer {
        tags
        metafield(key: "ethereum_address", namespace: "cf_app") {
          id
          key
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const SET_MISSING_ETH_ADDRESS_MUTATION = gql`
  mutation addMissingEthAddressTag($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) {
      node {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const updateEthAddressForCustomer = async (c: any, ethAddress: string) => {
  console.log('Updating ETH address for customer: ', c.displayName, c.email);

  const fieldId = c.metafield?.id;

  const res = await client.request(SET_ETH_ADDRESS_MUTATION, {
    id: c.id,
    address: ethAddress,
    fieldId,
    tags: c.tags.filter((t: string) => t !== MISSING_ETH_ADDRESS_TAG),
  });

  if (res.customerUpdate.userErrors.length) {
    console.log('Error updating ETH address', JSON.stringify(res));
  }
};

const setMissingEthAddressTagForCustomer = async (c: any) => {
  if (c.tags.find((t: string) => t === MISSING_ETH_ADDRESS_TAG)) return;

  console.log('Setting Missing ETH address for customer: ', c.displayName, c.email);

  const res = await client.request(SET_MISSING_ETH_ADDRESS_MUTATION, {
    id: c.id,
    tags: [MISSING_ETH_ADDRESS_TAG],
  });

  if (res.tagsAdd.userErrors.length) {
    console.log('Error setting missing ETH address tag', JSON.stringify(res));
  }
};
