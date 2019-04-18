
const _ = require('lodash');
const moment = require('moment');

const statslite = require('stats-lite');
const util = require('../../core/util');
const log = require(util.dirs().core + 'log')
const ENV = util.gekkoEnv();

const config = util.getConfig();
const perfConfig = config.performanceAnalyzer;
const watchConfig = config.watch;

const Logger = require('./logger');

const PerformanceAnalyzer = function() {
  _.bindAll(this);

  this.dates = {
    start: false,
    end: false
  }

  this.startPrice = 0;
  this.endPrice = 0;

  this.currency = watchConfig.currency;
  this.asset = watchConfig.asset;

  this.roundTripReportMode = perfConfig.roundTripReportMode; // DEFAULT || BY_DOUBLESTOP_TRIGGER

  this.logger = new Logger(watchConfig, this.roundTripReportMode);

  this.trades = 0;

  this.exposure = 0;
  
  this.roundTrips = [];
  this.losses = [];
  this.roundTrip = {
    id: 0,
    entry: false,
    exit: false
  }

  this.portfolio = {};
  this.balance;

  this.start = {};
  this.openRoundTrip = false;

  this.report = false;
}

PerformanceAnalyzer.prototype.processPortfolioValueChange = function(event) {
  if(!this.start.balance) {
    this.start.balance = event.balance;
  }
  //porforlio value is re-calculated
  this.balance = event.balance;
 
  const report = this.calculateReportStatistics();
  if(report) {
    this.report = report;
    this.deferredEmit('performanceReport', report);
  }
}

PerformanceAnalyzer.prototype.processPortfolioChange = function(event) {
  if(!this.start.portfolio) {
    this.start.portfolio = event;
  }
}

PerformanceAnalyzer.prototype.processCandle = function(candle, done) {
  this.price = candle.close;
  this.dates.end = candle.start.clone().add(1, 'minute');

  if(!this.dates.start) {
    this.dates.start = candle.start;
    this.startPrice = candle.close;
  }

  this.endPrice = candle.close;

  if(this.openRoundTrip) {
    this.emitRoundtripUpdate();
  }

  done();
}

PerformanceAnalyzer.prototype.emitRoundtripUpdate = function() {
  const uPnl = this.price - this.roundTrip.entry.price;

  this.deferredEmit('roundtripUpdate', {
    at: this.dates.end,
    duration: this.dates.end.diff(this.roundTrip.entry.date),
    uPnl,
    uProfit: uPnl / this.roundTrip.entry.total * 100
  })
}

PerformanceAnalyzer.prototype.processTradeCompleted = function(trade) {
  this.trades++;
  this.portfolio = trade.portfolio;
  // this.balance = trade.balance;

  this.registerRoundtripPart(trade);

  const report = this.calculateReportStatistics();
  if(report) {
    this.logger.handleTrade(trade, report);
    this.report = report;
    this.deferredEmit('performanceReport', report);
  }
}

PerformanceAnalyzer.prototype.processTriggerFired = function(roundTrip) {
  this.logger.handleRoundtrip(roundTrip, "BY_DOUBLESTOP_TRIGGER");
  this.logger.handleTriggerFired(roundTrip);
}

PerformanceAnalyzer.prototype.processTriggerCreated = function(trigger) {
  this.logger.handleTriggerCreated(trigger);
}

PerformanceAnalyzer.prototype.registerRoundtripPart = function(trade) {
  if(this.trades === 1 && trade.action === 'sell') {
    // this is not part of a valid roundtrip
    return;
  }

  if(trade.action === 'buy') {
    if (this.roundTrip.exit) {
      this.roundTrip.id++;
      this.roundTrip.exit = false
    }

    this.roundTrip.entry = {
      date: trade.date,
      price: trade.price,
      total: trade.portfolio.currency + (trade.portfolio.asset * trade.price),
    }
    this.openRoundTrip = true;
  } else if(trade.action === 'sell') {
    this.roundTrip.exit = {
      date: trade.date,
      price: trade.price,
      total: trade.portfolio.currency + (trade.portfolio.asset * trade.price),
    }
    this.openRoundTrip = false;

    this.handleCompletedRoundtrip();
  }
}

PerformanceAnalyzer.prototype.handleCompletedRoundtrip = function() {
  var roundtrip = {
    id: this.roundTrip.id,

    entryAt: this.roundTrip.entry.date,
    entryPrice: this.roundTrip.entry.price,
    entryBalance: this.roundTrip.entry.total,

    exitAt: this.roundTrip.exit.date,
    exitPrice: this.roundTrip.exit.price,
    exitBalance: this.roundTrip.exit.total,

    duration: this.roundTrip.exit.date.diff(this.roundTrip.entry.date)
  }

  roundtrip.pnl = roundtrip.exitBalance - roundtrip.entryBalance;
  roundtrip.profit = (100 * roundtrip.exitBalance / roundtrip.entryBalance) - 100;

  this.roundTrips[this.roundTrip.id] = roundtrip;

  this.logger.handleRoundtrip(roundtrip, "DEFAULT");

  this.deferredEmit('roundtrip', roundtrip);

  // update cached exposure
  this.exposure = this.exposure + Date.parse(this.roundTrip.exit.date) - Date.parse(this.roundTrip.entry.date);
  // track losses separately for downside report
  if (roundtrip.exitBalance < roundtrip.entryBalance)
    this.losses.push(roundtrip);
  
}

PerformanceAnalyzer.prototype.calculateReportStatistics = function() {
  if(!this.start.balance || !this.start.portfolio) {
    log.error('Cannot calculate a profit report without having received portfolio data.');
    log.error('Skipping performanceReport..');
    return false;
  }

  // the portfolio's balance is measured in {currency}
  const profit = this.balance - this.start.balance;

  const timespan = moment.duration(
    this.dates.end.diff(this.dates.start)
  );
  const relativeProfit = this.balance / this.start.balance * 100 - 100;
  const relativeYearlyProfit = relativeProfit / timespan.asYears();
  
  const percentExposure = this.exposure / (Date.parse(this.dates.end) - Date.parse(this.dates.start));

  const sharpe = (relativeYearlyProfit - perfConfig.riskFreeReturn) 
    / statslite.stdev(this.roundTrips.map(r => r.profit)) / Math.sqrt(this.trades / (this.trades - 2));
  
  const downside = statslite.percentile(this.losses.map(r => r.profit), 0.25)
    * Math.sqrt(this.trades / (this.trades - 2));

  const report = {
    momentEndTime: moment(_.cloneDeep(this.dates.end)),
    startTime: this.dates.start.utc().format('YYYY-MM-DD HH:mm:ss'),
    endTime: this.dates.end.utc().format('YYYY-MM-DD HH:mm:ss'),
    timespan: timespan.humanize(),
    market: this.endPrice * 100 / this.startPrice - 100,

    balance: this.balance,
    profit,
    relativeProfit: relativeProfit,

    yearlyProfit: profit / timespan.asYears(),
    relativeYearlyProfit,

    startPrice: this.startPrice,
    endPrice: this.endPrice,
    trades: this.trades,
    startBalance: this.start.balance,
    exposure: percentExposure,
    sharpe,
    downside
  }

  report.alpha = report.profit - report.market;

  return report;
}

PerformanceAnalyzer.prototype.finalize = function(done) {
  if(!this.trades) {
    return done();
  }

  if(this.report) {
    this.logger.finalize(this.report);
  }
  done();
}


module.exports = PerformanceAnalyzer;
