import * as fs from 'fs';
import { SMA } from 'technicalindicators';
import fetch from 'node-fetch';

const getMovingAverage = async () => {
  const data = await (
    await fetch(
      'https://api.coingecko.com/api/v3/coins/robot/market_chart?vs_currency=usd&days=90&interval=daily',
    )
  ).json();

  const latestPrices: Array<[number, number]> = data.prices.reverse();

  const dailyPrice = latestPrices.map((p: [number, number]) => p[1]);

  const movingAvg = SMA.calculate({ period: 14, values: dailyPrice, reversedInput: true });
  const timeStamps = data.prices.map((p: [number, number]) => p[0]);

  const maWithTimestamp = movingAvg.map((price, i) => {
    const dayString = new Date(timeStamps[i]).toISOString().split('T')[0];
    return [dayString, price];
  });

  fs.writeFileSync(
    './data/robotMovingAverage.json',
    JSON.stringify(Object.fromEntries(maWithTimestamp)),
  );
};

getMovingAverage();
