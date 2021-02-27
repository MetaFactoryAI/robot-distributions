import _ from 'lodash';
import { getEthAddressForCustomer } from '../lib/api';
import fs from 'fs';
import { ALL_ORDERS } from '../data';

const fetchCustomerEthAddresses = async () => {
  const customerIds = _(ALL_ORDERS)
    .filter((c) => Boolean('customer_id' in c && c.customer_id))
    .groupBy('customer_id')
    .keys()
    .value();

  const customers = [];
  for (const id of customerIds) {
    try {
      const ethAddress = await getEthAddressForCustomer(parseInt(id, 10));
      if (ethAddress) {
        customers.push({ ethAddress, customerId: id });
      } else {
        console.warn('Missing ETH Address for customerID: ', id);
      }
    } catch (e) {
      console.warn(e);
    }
  }

  fs.writeFileSync('./data/customerEthAddresses.json', JSON.stringify(customers));
};

fetchCustomerEthAddresses();
