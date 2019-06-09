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
  // {
  //   exchange: "binance",
  //   currency: "USDT",
  //   asset: "ETH"
  // }
]

// const candleSizes = [15, 30, 60, 90] // Đơn vị phút
// const candleSizes = [15, 30, 60, 90, 120, 240, 480, 1440] // Đơn vị phút
const candleSizes = [30]
// const candleSizes = [60]
//NOTE: MUST INCLUDE TIMEZONE, gekko uses UTC inside
const dateRanges = [
  //theo tác giả
  {
    trainDaterange: {
      from: "2018-02-11T21:00:00.000Z",
      to: "2018-03-30T18:00:00.000Z"
    },
    backtestDaterange: {
      from: "2018-04-15T09:00:00.000Z",
      to: "2018-05-01T00:00:00.000Z"
    }
  },
  //tăng mạnh
  {
    trainDaterange: {
      from: "2017-11-04T12:00:00.000Z",
      to: "2018-02-05T00:00:00.000Z"
    },
    backtestDaterange: {
      from: "2018-02-05T00:00:00.000Z",
      to: "2018-03-05T00:00:00.000Z"
    }
  },
  //giảm mạnh
  {
    trainDaterange: {
      from: "2017-12-04T12:00:00.000Z",
      to: "2018-03-05T00:00:00.000Z"
    },
    backtestDaterange: {
      from: "2018-03-05T00:00:00.000Z",
      to: "2018-04-05T00:00:00.000Z"
    }
  },
  //tăng nhẹ
  {
    trainDaterange: {
      from: "2018-10-24T12:00:00.000Z",
      to: "2019-01-21T00:00:00.000Z"
    },
    backtestDaterange: {
      from: "2019-01-21T00:00:00.000Z",
      to: "2019-02-21T00:00:00.000Z"
    }
  },
  //giảm nhẹ
  {
    trainDaterange: {
      from: "2018-05-30T12:00:00.000Z",
      to: "2018-09-01T00:00:00.000Z"
    },
    backtestDaterange: {
      from: "2018-09-01T00:00:00.000Z",
      to: "2018-10-01T00:00:00.000Z"
    }
  },
  //gần đây
  {
    trainDaterange: {
      from: "2018-11-28T12:00:00.000Z",
      to: "2019-03-01T00:00:00.000Z"
    },
    backtestDaterange: {
      from: "2019-03-01T00:00:00.000Z",
      to: "2019-04-15T00:00:00.000Z"
    }
  },
]

const strategyForBacktest = [{
  name: "OMLBCTWithStopTrade",
  settings: {
    stopLoss: -10,
    takeProfit: 2,
    amountForOneTrade: 100,
    expirationPeriod: 24,
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
    }],
    label: "omlbct"
  }
}];

const performMaxTest = false;

const modelName = process.argv[2] || "random_forest";
const modelType = process.argv[3] || "fixed";
const rollingStep = parseInt(process.argv[4]) || 0;
const modelLag = parseInt(process.argv[5]) || 0;

const strategyGetData = {
  name: "writeCandle2Json",
  settings: {
    fileName: "",
    stopTrade: 24,
    stopLoss: -10,
    takeProfit: 2
  }
};
const nameConfig = "config-backtest.js";
const nameSampleConfig = "sample-config-for-backtest.js";

const api = "http://localhost:5000/backtest";

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

          console.log("Generate config...");
          generateConfig(config, marketsAndPair[k], candleSizes[i], strategyGetData, dateRanges[j]);

          // console.log("Generate config for prepare train data...");
          // let trainDataName = generateConfigTrain(config, marketsAndPair[k], strategyForBacktest[l], candleSizes[i], dateRanges[j].trainDaterange);
          // // Ghi file config train
          // console.log("Write config for prepare train data...");
          // fs.writeFileSync(nameConfig, await generateConfigString(config));

          // // Chạy backtest để chuẩn bị train data
          // console.log("Run gekko for prepare train data...");
          // await runGekkoProcess(nameConfig);

          // console.log("Generate config for prepare test data...");
          // let testDataName = generateConfigTest(config, marketsAndPair[k], strategyForBacktest[l], candleSizes[i], dateRanges[j].backtestDaterange);
          // Ghi file config backtest
          // console.log("Write config for prepare test data...");
          // fs.writeFileSync(nameConfig, await generateConfigString(config));

          // // Chạy backtest để chuẩn bị backtest data
          // console.log("Run gekko for prepare test data...");
          // await runGekkoProcess(nameConfig);

          // Gửi train data và test data cho python -> bỏ
          let trainData = {}
          let testData = {}
          console.log("Connect to python ...");
          let result = await sendTrainAndTestDataToPythonServer(marketsAndPair[k], trainData, testData, dateRanges[j].trainDaterange, dateRanges[j].backtestDaterange, candleSizes[i], modelName, modelType, rollingStep, modelLag, strategyForBacktest[l]);
          console.log('Connect to python done ...')
          if (result) {
            //Create an unique ID for predicted data file and config file
            randomNumber = Math.floor((Math.random() * 10000000) + 1)
            id = `${moment().valueOf()}_${randomNumber}`
            strategyForBacktest[l].settings.dataFile = `data-for-backtest/${id}.json`

            // Write backtest data
            console.log("Write predicted data file for backtest ...");
            fs.writeFileSync(strategyForBacktest[l].settings.dataFile, JSON.stringify(result));

            console.log("Generate config for backtest ...");
            generateConfigBacktest(config, dateRanges[j].backtestDaterange, strategyForBacktest[l]);

            // Ghi file config để backtest
            console.log("Write config file for backtest ...");
            backtestFileName = `backtestConfigs/${id}.js`
            fs.writeFileSync(backtestFileName, await generateConfigString(config));
            console.log("Run gekko for backtest test data...");
            await runGekkoProcess(backtestFileName)
          }
        }
        //
      }
    }
    // clearDataAfterDone()
  }
}

const sendTrainAndTestDataToPythonServer = (marketInfo, trainData, testData, trainDaterange, backtestDaterange, candleSize, modelName, modelType, rollingStep, modelLag, strategyConfig) => {
  return new Promise((resolve, reject) => {
    // remove vwp from train data
    trainData = _.map(trainData, temp => {
      return _.omit(temp, ['vwp']);
    })
    // remove action & vwp from test data
    testData = _.map(testData, temp => {
      return _.omit(temp, ['action', 'vwp'])
    })

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
      },
      train_data: trainData,
      backtest_data: testData
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

const generateNameFile = (train = true, marketsAndPair, strategyForBacktest, candleSize, daterange) => {
  //-${daterange.from}-${daterange.to}
  let fileName = [
    marketsAndPair.exchange,
    marketsAndPair.asset,
    marketsAndPair.currency,
    strategyForBacktest.name,
    candleSize,
    moment.utc(daterange.from).format("DD-MM-YY"),
    moment.utc(daterange.to).format("DD-MM-YY")
  ].join('_');

  return `data-for-backtest/${train ? "train" : "test"}_${fileName}.json`
}

const generateConfig = (config, marketsAndPair, candleSizes, strategyGetData, dateRange) => {
  // Chuẩn bị data train để gửi cho model
  // Tắt hết pluggin
  for (let m in config) {
    if (_.isObject(config[m]))
      config[m].enabled = false;
  }
  // Bật lại những pluggin cần thiết
  let plugginEnable = ["tradingAdvisor", "paperTrader", "performanceAnalyzer"];
  for (let m = 0; m < plugginEnable.length; m++) {
    if (_.isObject(config[plugginEnable[m]]))
      config[plugginEnable[m]].enabled = true;
  }
  // Chỉnh sàn + cặp tiền
  config["watch"] = marketsAndPair;
  // Chỉnh candle size
  config["tradingAdvisor"].candleSize = candleSizes;
  // Chỉnh lại thuật toán để ghi candle ra file
  config["tradingAdvisor"].method = strategyGetData.name;
  config[strategyGetData.name] = strategyGetData.settings;

  config["dateRange"] = dateRange;
  config['miscellaneous'] = {
    modelName: modelName,
    modelType: modelType,
    rollingStep: rollingStep,
    lag: modelLag,
  }
}

const generateConfigTrain = (config, marketsAndPair, strategyForBacktest, candleSizes, trainDaterange) => {
  let filename = generateNameFile(true, marketsAndPair, strategyForBacktest, candleSizes, trainDaterange);
  config[strategyGetData.name].fileName = filename;
  //Chỉnh daterange
  config["backtest"].daterange = trainDaterange;

  return filename;
}

const generateConfigTest = (config, marketsAndPair, strategyForBacktest, candleSizes, backtestDaterange) => {
  let filename = generateNameFile(false, marketsAndPair, strategyForBacktest, candleSizes, backtestDaterange);
  // Chuẩn bị tập test
  //Chỉnh daterange
  config["backtest"].daterange = backtestDaterange;
  // name file out
  config[strategyGetData.name].fileName = filename;
  return filename;
}

const generateConfigBacktest = (config, backtestDaterange, strategy) => {
  config["backtest"].daterange = backtestDaterange;
  config["tradingAdvisor"].method = strategy.name;
  config[strategy.name] = strategy.settings;
  config["myBacktestResultExporter"].enabled = true;
  config["backtestResultExporter"].enabled = true;
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
