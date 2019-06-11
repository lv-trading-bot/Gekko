const fs = require('fs');
const _ = require('lodash');
const {
  spawn
} = require('child_process');
const moment = require('moment');
const axios = require('axios');

let AUTHENTICAION_TOKEN = process.env.AUTHENTICAION_TOKEN;

axios.defaults.headers.common['Authorization'] = AUTHENTICAION_TOKEN;

const marketsAndPair = [{
    exchange: "binance",
    currency: "USDT",
    asset: "BTC"
  },
  /*{
    exchange: "binance",
    currency: "USDT",
    asset: "ETH"
  },
  {
    exchange: "binance",
    currency: "USDT",
    asset: "EOS",
  },
  {
    exchange: "binance",
    currency: "USDT",
    asset: "XRP",
  },
  {
    exchange: "binance",
    currency: "USDT",
    asset: "BNB",
  },
  {
    exchange: "binance",
    currency: "USDT",
    asset: "TRX",
  },
  {
    exchange: "binance",
    currency: "USDT",
    asset: "LTC",
  },
  {
    exchange: "binance",
    currency: "USDT",
    asset: "BCHABC",
  },
  {
    exchange: "binance",
    currency: "USDT",
    asset: "ONE",
  },
  {
    exchange: "binance",
    currency: "USDT",
    asset: "BTT",
  },
  {
    exchange: "binance",
    currency: "USDT",
    asset: "ATOM",
  },
  {
    exchange: "binance",
    currency: "USDT",
    asset: "ADA",
  },
  {
    exchange: "binance",
    currency: "USDT",
    asset: "TUSD",
  },
  {
    exchange: "binance",
    currency: "USDT",
    asset: "ETC",
  },
  {
    exchange: "binance",
    currency: "USDT",
    asset: "USDC",
  },
  {
    exchange: "binance",
    currency: "USDT",
    asset: "PAX",
  },
  {
    exchange: "binance",
    currency: "USDT",
    asset: "MATIC",
  },
  {
    exchange: "binance",
    currency: "USDT",
    asset: "FET",
  },
  {
    exchange: "binance",
    currency: "USDT",
    asset: "NEO",
  },
  {
    exchange: "binance",
    currency: "USDT",
    asset: "ZIL",
  },*/
]

const candleSizes = [30, 60] // Đơn vị phút
// const candleSizes = [15, 30, 60, 90, 120, 240, 480, 1440] // Đơn vị phút
// const candleSizes = [60]
// const candleSizes = [60]
//NOTE: MUST INCLUDE TIMEZONE, gekko uses UTC inside
const dateRanges = [
  // //theo tác giả
  // {
  //   trainDaterange: {
  //     from: "2018-02-11T21:00:00.000Z",
  //     to: "2018-03-30T18:00:00.000Z"
  //   },
  //   backtestDaterange: {
  //     from: "2018-04-15T09:00:00.000Z",
  //     to: "2018-05-01T00:00:00.000Z"
  //   }
  // },
  // //tăng mạnh
  // {
  //   trainDaterange: {
  //     from: "2017-11-04T12:00:00.000Z",
  //     to: "2018-02-05T00:00:00.000Z"
  //   },
  //   backtestDaterange: {
  //     from: "2018-02-05T00:00:00.000Z",
  //     to: "2018-03-05T00:00:00.000Z"
  //   }
  // },
  // //giảm mạnh
  // {
  //   trainDaterange: {
  //     from: "2018-01-05T00:00:00.000Z",
  //     to: "2018-03-05T00:00:00.000Z"
  //   },
  //   backtestDaterange: {
  //     from: "2018-03-05T00:00:00.000Z",
  //     to: "2018-04-05T00:00:00.000Z"
  //   }
  // },
  // //tăng nhẹ
  // {
  //   trainDaterange: {
  //     from: "2018-10-24T00:00:00.000Z",
  //     to: "2019-01-21T00:00:00.000Z"
  //   },
  //   backtestDaterange: {
  //     from: "2019-01-21T00:00:00.000Z",
  //     to: "2019-02-21T00:00:00.000Z"
  //   }
  // },
  //giảm nhẹ
  {
    trainDaterange: {
      from: "2018-08-11T00:00:00.000Z",
      to: "2018-09-01T00:00:00.000Z"
    },
    backtestDaterange: {
      from: "2018-09-01T00:00:00.000Z",
      to: "2018-10-01T00:00:00.000Z"
    }
  },
  // //gần đây
  // {
  //   trainDaterange: {
  //     from: "2018-12-01T00:00:00.000Z",
  //     to: "2019-03-01T00:00:00.000Z"
  //   },
  //   backtestDaterange: {
  //     from: "2019-03-01T00:00:00.000Z",
  //     to: "2019-04-15T00:00:00.000Z"
  //   }
  // },
]

const strategyForBacktest = [{
  name: "OMLBCTWithStopTrade",
  settings: {
    stopLoss: -10,
    takeProfit: 2,
    amountForOneTrade: 100,
    expirationPeriod: 24,
    decisionThreshold: 0.5,
    backtest: true,
    dataFile: "",
    stopTradeLimit: -5000,
    // totalWatchCandles: 24,
    breakDuration: -1,
    features: ["start", "open", "high", "low", "close", "volume", "trades", {
        name: "omlbct",
        params: {
          takeProfit: 2,
          stopLoss: -10,
          expirationPeriod: 24
        }
      },
      // {
      //   name: "MACD",
      //   params: {
      //     short: 12,
      //     long: 26,
      //     signal: 9
      //   }
      // },
      // {
      //   name: "RSI",
      //   params: {
      //     interval: 14
      //   }
      // },
      // {
      //   name: "ADX",
      //   params: {
      //     period: 14
      //   }
      // },
      // {
      //   name: "TREND_BY_DI",
      //   params: {
      //     period: 14
      //   }
      // },
      // {
      //   name: "PLUS_DI",
      //   params: {
      //     period: 14
      //   }
      // },
      // {
      //   name: "MINUS_DI",
      //   params: {
      //     period: 14
      //   }
      // },
    ],
    label: "omlbct",
    note: "Ghi chú tại đây"
  }
}];

const performMaxTest = false;

const modelName = process.argv[2] || "random_forest";
const modelType = process.argv[3] || "fixed";
const rollingStep = parseInt(process.argv[4]) || 0;
const modelLag = parseInt(process.argv[5]) || 0;

const nameConfig = "config-backtest.js";
const nameSampleConfig = "sample-config-for-backtest.js";

const api = "http://localhost:3002/backtest";

const main = async () => {
  let sampleConfig = require('./' + nameSampleConfig);
  // Duyệt qua hết các candle size
  for (let i = 0; i < candleSizes.length; i++) {
    // Duyệt qua hết các date range
    for (let j = 0; j < dateRanges.length; j++) {
      // Duyệt qua các cặp tiền
      for (let k = 0; k < marketsAndPair.length; k++) {
        for (let l = 0; l < strategyForBacktest.length; l++) {
          // Chuẩn bị config để lấy data
          let config = _.cloneDeep(sampleConfig);

          console.log("Connect to ML server...");
          let result = await getAdvicesFromMLServer(marketsAndPair[k], dateRanges[j].trainDaterange, dateRanges[j].backtestDaterange, candleSizes[i], modelName, modelType, rollingStep, modelLag, strategyForBacktest[l]);
          console.log('Connect to ML server done...')
          
          if (result) {
            //Create an unique ID for predicted data file and config file
            randomNumber = Math.floor((Math.random() * 10000000) + 1)
            id = `${moment().valueOf()}_${randomNumber}`
            strategyForBacktest[l].settings.dataFile = `data-for-backtest/${id}.json`

            // Write backtest data
            console.log("Write predicted data to file...");
            fs.writeFileSync(strategyForBacktest[l].settings.dataFile, JSON.stringify(result));

            console.log("Generate config for backtest...");
            generateConfigBacktest(config, marketsAndPair[k], dateRanges[j], candleSizes[i],  strategyForBacktest[l]);

            // Ghi file config để backtest
            console.log("Write config file for backtest...");
            backtestFileName = `backtestConfigs/${id}.js`
            fs.writeFileSync(backtestFileName, await generateConfigString(config));
            console.log("Run gekko in backtest mode...");
            await runGekkoProcess(backtestFileName)
          }
        }
        //
      }
    }
    // clearDataAfterDone()
  }
}

const getAdvicesFromMLServer = (marketInfo, trainDaterange, backtestDaterange, candleSize, modelName, modelType, rollingStep, modelLag, strategyConfig) => {
  return new Promise((resolve, reject) => {
    let data = {
      metadata: {
        market_info: marketInfo,
        model_type: modelType,
        train_daterange: {
          from: new Date(trainDaterange.from).getTime(),
          to: new Date(trainDaterange.to).getTime()
        },
        backtest_daterange: {
          from: new Date(backtestDaterange.from).getTime(),
          to: new Date(backtestDaterange.to).getTime()
        },
        candle_size: candleSize,
        model_name: modelName,
        rolling_step: rollingStep,
        lag: modelLag,
        features: strategyConfig.settings.features,
        label: strategyConfig.settings.label,
        max_test: performMaxTest
      }
    }

    axios.post(api, data)
      .then(function (response) {
        //handle
        resolve(response.data);
      })
      .catch(function (error) {
        console.log(error + "");
        console.log(error.response && error.response.data);
        resolve(false);
      });
  })
}

const generateConfigBacktest = (config, marketInfo, daterange, candleSize, strategy) => {
  config['watch'] = marketInfo;
  
  config['dateRange'] = daterange;
  config["backtest"].daterange = daterange.backtestDaterange;
  
  config["tradingAdvisor"].method = strategy.name;
  config["tradingAdvisor"].candleSize = candleSize;

  config[strategy.name] = strategy.settings;
  config["myBacktestResultExporter"].enabled = true;
  config["backtestResultExporter"].enabled = true;
  config['miscellaneous'] = {
    modelName: modelName,
    modelType: modelType,
    rollingStep: rollingStep,
    lag: modelLag,
  }
}

const generateConfigString = (config) => {
  return new Promise((resolve, reject) => {
    let dataOut = '';
    dataOut += `var config = {}; \n`;
    for (let attr in config) {
      dataOut += `config['${attr}'] = ${JSON.stringify(config[attr])};\n`
    }
    dataOut += "module.exports = config;";
    resolve(dataOut);
  })
}

const runGekkoProcess = (nameConfig) => {
  return new Promise((resolve, reject) => {
    const process = spawn('node', ['gekko', '-c', nameConfig, '-b']);
    process.stdout.on('data', (data) => {
      console.log(`${data}`);
    });

    process.stderr.on('data', (data) => {
      console.log(`stderr: ${data}`);
    });

    process.on('close', (code) => {
      console.log(`child process exited with code ${code}`);
      resolve();
    });
  })
}

const clearDataAfterDone = () => {
  spawn('rm', [nameConfig]);
}

main()
