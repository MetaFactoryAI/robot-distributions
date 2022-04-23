import _ from 'lodash';
import { getEthAddressForCustomer } from '../lib/api';
import fs from 'fs';
import { ALL_ORDERS } from '../data';
import CustomerAddresses from '../data/customerEthAddresses.json';

const fetchCustomerEthAddresses = async () => {
  const existingAddresses = _.keyBy(CustomerAddresses, 'customerId');
  const customerIds = _(ALL_ORDERS)
    .filter((c) => Boolean('customer_id' in c && c.customer_id))
    .groupBy('customer_id')
    .keys()
    .value();

  const customers = [];
  for (const id of customerIds) {
    if (existingAddresses[id]) {
      // console.log('customer has address: ', id);
      customers.push(existingAddresses[id]);
      continue;
    }

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
