// Small plugin that subscribes to some events, stores
// them and sends it to the parent process.

const log = require('../core/log');
const _ = require('lodash');
const util = require('../core/util.js');
const env = util.gekkoEnv();
const config = util.getConfig();
const moment = require('moment');
const fs = require('fs');

const BacktestResultExporterForAutoBacktest = function() {
  this.performanceReport;
  this.roundtrips = [];

  _.bindAll(this);
}

BacktestResultExporterForAutoBacktest.prototype.processTriggerFired = function(trigger) {
  this.roundtrips.push(trigger);
}

BacktestResultExporterForAutoBacktest.prototype.processPerformanceReport = function(performanceReport) {
  this.performanceReport = performanceReport;
}

BacktestResultExporterForAutoBacktest.prototype.finalize = function(done) {
  const backtest = {
    market: config.watch,
    tradingAdvisor: config.tradingAdvisor,
    strategyParameters: config[config.tradingAdvisor.method],
    performanceReport: this.performanceReport,
    roundtrips: this.roundtrips
  };

  if(env === 'child-process') {
    process.send({backtest});
  }

  if(config.backtestResultExporterForAutoBacktest.writeToDisk) {
    this.writeToDisk(backtest, done);
  } else {
    done();
  }
};

BacktestResultExporterForAutoBacktest.prototype.writeToDisk = function(backtest, next) {
  const filename = config.backtestResultExporterForAutoBacktest.fileNameResult;
  const fileDir = util.dirs().gekko + '/'
  fs.writeFile(
    fileDir + filename,
    JSON.stringify(backtest),
    err => {
      if(err) {
        log.error('unable to write backtest result', err);
      } else {
        log.info('written backtest to: ', fileDir + filename);
      }

      next();
    }
  );
}

module.exports = BacktestResultExporterForAutoBacktest;
