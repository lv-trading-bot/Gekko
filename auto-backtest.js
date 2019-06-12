const fs = require('fs');
const _ = require('lodash');
const {
  spawn
} = require('child_process');
const moment = require('moment');
const axios = require('axios');

let AUTHENTICATION_TOKEN = process.env.AUTHENTICATION_TOKEN;

axios.defaults.headers.common['Authorization'] = AUTHENTICATION_TOKEN;

let configName = process.argv[2];

if (!configName) {
    console.log('Config file is required for backtets');
    process.exit(1);
    return;
}

let userConfig = null;
try {
    userConfig = require('./' + configName);
} catch (error) {
    console.log('Cannot read ' + configName);
    process.exit(1);
}

const marketsAndPair = [
    userConfig.marketsAndPair
]

const candleSizes = [userConfig.candleSizes] // Đơn vị phút
// const candleSizes = [15, 30, 60, 90, 120, 240, 480, 1440] // Đơn vị phút
const dateRanges = [
    userConfig.dateRanges
]
const strategyForBacktest = [{
  name: "OMLBCTWithStopTrade",
  settings: userConfig.settingsOfStrategy
}];

const performMaxTest = false;

const modelName = userConfig.modelName;
const modelType = userConfig.modelType;
const rollingStep = userConfig.rollingStep;
const modelLag = userConfig.modelLag;
const fileNameResult = userConfig.fileNameResult;

const nameSampleConfig = "sample-config-for-backtest.js";

const api = userConfig.api_base + "/backtest";

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
  
  config["backtestResultExporterForAutoBacktest"].enabled = true;
  config["backtestResultExporterForAutoBacktest"].fileNameResult = fileNameResult;

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