const fs = require('fs');
const _ = require('lodash');
const {spawn} = require('child_process');
const moment = require('moment');
const axios = require('axios');

const marketsAndPair = [{
	exchange: "binance",
	currency: "USDT",
	asset: "BTC"
}]

// const candleSizes = [15, 30, 60, 90] // Đơn vị phút
const candleSizes = [60] // Đơn vị phút
const dateRanges = [{
		trainDaterange: {
			from: "2019-01-01 01:00:00",
			to: "2019-01-31 23:00:00"
		},
		backtestDaterange: {
			from: "2019-02-01 01:00:00",
			to: "2019-02-10 23:00:00"
		}
	},
	// {
	// 	trainDaterange: {
	// 		from: "2019-01-02 01:00:00",
	// 		to: "2019-01-31 23:00:00"
	// 	},
	// 	backtestDaterange: {
	// 		from: "2019-02-01 01:00:00",
	// 		to: "2019-02-12 23:00:00"
	// 	}
	// }
]

const strategyForBacktest = [{
	name: "OMLBCT",
	settings: {
		startBalance: 2500,
		startAsset: 0,
		stopLoss: -2,
		takeProfit: 4,
		amountForOneTrade: 100,
		stopTrade: 24,
		backtest: true
	}
}];

const modelName = "random-forest";
const strategyGetData = {
	name: "writeCandle2Json",
	settings: {
		fileName: ""
	}
};
const nameConfig = "backtest-config.js";
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

					generateConfig(config, marketsAndPair[k], candleSizes[i], strategyGetData);

					let trainDataName = generateConfigTrain(config, marketsAndPair[k], strategyForBacktest[l], candleSizes[i], dateRanges[j].trainDaterange);
					// Ghi file config train
					fs.writeFileSync(nameConfig, await generateConfigString(config));

					// Chạy backtest để chuẩn bị train data
					await runGekkoProcess(nameConfig);

					let testDataName = generateConfigTest(config, marketsAndPair[k], strategyForBacktest[l], candleSizes[i], dateRanges[j].backtestDaterange);
					// Ghi file config backtest
					fs.writeFileSync(nameConfig, await generateConfigString(config));

					// Chạy backtest để chuẩn bị backtest data
					await runGekkoProcess(nameConfig);

					// Gửi train data và test data cho python
					let trainData = require('./' + trainDataName);
					let testData = require('./' + testDataName);
					let result = await sendTrainAndTestDataToPythonServer(trainData, testData, dateRanges[j].trainDaterange, dateRanges[j].backtestDaterange, candleSizes[i], modelName);
					if(result) {
						let backtestData = result;
						// Write backtest data
						fs.writeFileSync('backtest-data.json', backtestData);
						generateConfigBacktest(config, dateRanges[j].backtestDaterange, strategyForBacktest);
						await runGekkoProcess(nameConfig)
					}
				}
				//
			}
		}
		// clearDataAfterDone()
	}
}

const sendTrainAndTestDataToPythonServer = (trainData, testData, trainDaterange, backtestDaterange, candleSize, modelName) => {
	return new Promise((resolve, reject) => {
		let data = {
			metadata: {
				train_daterange: {
					from: new Date(trainDaterange.from).getTime(),
					to: new Date(trainDaterange.to).getTime()
				},
				backtest_daterange: {
					from: new Date(backtestDaterange.from).getTime(),
					to: new Date(backtestDaterange.to).getTime()
				},
				candle_size: candleSize,
				model_name: modelName
			},
			train_data: trainData,
			backtest_data: testData
		}
		axios.post(api, data)
		  .then(function (response) {

			//handle
			console.log(response);

		  })
		  .catch(function (error) {
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

const generateConfig = (config, marketsAndPair, candleSizes, strategyGetData) => {
	// Chuẩn bị data train để gửi cho model
	// Tắt hết pluggin
	for (let m in config) {
		if (_.isObject(config[m]))
			config[m].enable = false;
	}
	// Bật lại những pluggin cần thiết
	let plugginEnable = ["tradingAdvisor", "paperTrader", "performanceAnalyzer"];
	for (let m = 0; m < plugginEnable.length; m ++) {
		if (_.isObject(config[plugginEnable[m]]))
		config[plugginEnable[m]].enable = true;
	}
	// Chỉnh sàn + cặp tiền
	config["watch"] = marketsAndPair;
	// Chỉnh candle size
	config["tradingAdvisor"].candleSize = candleSizes;
	// Chỉnh lại thuật toán để ghi candle ra file
	config["tradingAdvisor"].method = strategyGetData.name;
	config[strategyGetData.name] = strategyGetData.settings;
}

const generateConfigTrain = (config, marketsAndPair, strategyForBacktest, candleSizes, trainDaterange) => {
	let filename = generateNameFile(true,marketsAndPair, strategyForBacktest, candleSizes, trainDaterange);
	config[strategyGetData.name].fileName = filename;
	//Chỉnh daterange
	config["backtest"].daterange = trainDaterange;

	return filename;
}

const generateConfigTest = (config, marketsAndPair, strategyForBacktest, candleSizes, backtestDaterange) => {
	let filename = generateNameFile(false,marketsAndPair, strategyForBacktest, candleSizes, backtestDaterange);
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
	config["myBacktestResultExporter"].enable = true;
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
			// console.log(`stdout: ${data}`);
		});

		process.stderr.on('data', (data) => {
			// console.log(`stderr: ${data}`);
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
