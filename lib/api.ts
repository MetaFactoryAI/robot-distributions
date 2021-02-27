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
      orders(first: 10) {
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

const CUSTOMER_ID_PREFIX = 'gid://shopify/Customer/';
const ETH_REGEX = /0x[a-fA-F0-9]{40}/;
const ENS_REGEX = /\w+\.eth/;

const nodeIdToCustomerId = (nodeId: string) => nodeId.split(CUSTOMER_ID_PREFIX)[1];
const customerIdToNodeId = (id: string | number) => `${CUSTOMER_ID_PREFIX}${id}`;

const extractEthAddress = (s: string | null | undefined) =>
  s && (s.match(ETH_REGEX)?.[0] || s.match(ENS_REGEX)?.[0]);

export const resolveEnsToAddress = async (addressOrEnsName: string): Promise<string | null> => {
  // already resolved
  if (web3.utils.isAddress(addressOrEnsName)) return addressOrEnsName;

  const ensName = addressOrEnsName.match(ENS_REGEX)?.[0];

  if (!ensName) {
    console.warn('Unable to resolve ETH address from', addressOrEnsName);
    return null;
  }

  console.log(`Fetching ETH address for ENS`, ensName);
  try {
    const ethAddress = await web3.eth.ens.getAddress(ensName);
    console.log({ ethAddress, ensName });
    return ethAddress;
  } catch (e) {
    console.warn('Unable to resolve ETH address for ENS: ', ensName, e);
    return null;
  }
};

export const getEthAddressForCustomer = async (customerId: number): Promise<string | null> => {
  const data = await client.request(CUSTOMER_QUERY, { id: customerIdToNodeId(customerId) });

  // Check if address is already set in metafield
  let address = extractEthAddress(data.customer.metafield?.value);
  if (address) return resolveEnsToAddress(address);

  // Otherwise check if the user gave the ETH address at checkout
  const ethAddressField = _.findLast(
    data.customer.orders.edges,
    (e) => e.node.customAttributes.length > 0,
  )?.node.customAttributes[0].value;
  address = extractEthAddress(ethAddressField);

  if (!address) {
    // Otherwise check if the user gave the ETH address in order notes
    const orderNoteWithEthAddress = _.findLast(data.customer.orders.edges, (e) =>
      extractEthAddress(e.node.note),
    )?.node.note;
    address = extractEthAddress(orderNoteWithEthAddress);
  }

  const ethAddress = address && (await resolveEnsToAddress(address));

  // Set the address in the metafield for the customer
  if (ethAddress) {
    await updateEthAddressForCustomer(data.customer, ethAddress);
    return ethAddress;
  }

  return null;
};

const SET_ETH_ADDRESS_MUTATION = gql`
  mutation setEthAddressForCustomer($id: ID!, $address: String!, $fieldId: ID) {
    customerUpdate(
      input: {
        id: $id
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

const updateEthAddressForCustomer = async (c: any, ethAddress: string) => {
  console.log('Updating ETH address for customer: ', c.displayName, c.email);

  const fieldId = c.metafield?.id;

  const res = await client.request(SET_ETH_ADDRESS_MUTATION, {
    id: c.id,
    address: ethAddress,
    fieldId,
  });

  if (res.customerUpdate.userErrors.length) {
    console.log('Error updating ETH address', JSON.stringify(res));
  }
};
