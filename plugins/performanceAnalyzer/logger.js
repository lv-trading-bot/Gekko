// log trade performance results

const _ = require('lodash');
const moment = require('moment');
const humanizeDuration = require('humanize-duration');

const util = require('../../core/util.js');
const dirs = util.dirs();
const mode = util.gekkoMode();
const log = require(dirs.core + 'log');

const Logger = function (watchConfig, roundTripReportMode) {
  this.currency = watchConfig.currency;
  this.asset = watchConfig.asset;

  this.roundtrips = [];

  this.roundTripReportMode = roundTripReportMode;

  this.triggersManager = [];
}

Logger.prototype.round = function (amount) {
  return amount.toFixed(8);
}

// used for:
// - realtime logging (per advice)
// - backtest logging (on finalize)
Logger.prototype.logReport = function (trade, report) {
  // ignore the trade

  var start = this.round(report.startBalance);
  var current = this.round(report.balance);

  log.info(`(PROFIT REPORT) original balance:\t\t ${start} ${this.currency}`);
  log.info(`(PROFIT REPORT) current balance:\t\t ${current} ${this.currency}`);
  log.info(
    `(PROFIT REPORT) profit:\t\t\t\t ${this.round(report.profit)} ${this.currency}`,
    `(${this.round(report.relativeProfit)}%)`
  );
}

Logger.prototype.logRoundtripHeading = function () {
  if (this.roundTripReportMode === "BY_DOUBLESTOP_TRIGGER") {
    log.info('(ROUNDTRIP)', 'entry date (UTC) \thold(h) buy \tsell \tprofit');
  } else {
    log.info('(ROUNDTRIP)', 'entry date (UTC)  \texit date (UTC)  \texposed duration\tP&L \tprofit');
  }
}

Logger.prototype.logRoundtrip = function (rt) {
  let display = [];
  if (this.roundTripReportMode === "BY_DOUBLESTOP_TRIGGER") {
    let meta = rt.meta;
    // '(ROUNDTRIP)', 'entry date \thold \tbuy \tsell \tprofit'
    display = [
      meta.initialStart.utc().format('YYYY-MM-DD HH:mm'),
      moment.duration(meta.exitCandle.start.diff(meta.initialStart)).asHours().toFixed(2),
      meta.initialPrice,
      meta.exitPrice,
      ((meta.exitPrice - meta.initialPrice) * 100 / meta.initialPrice).toFixed(2)
    ];

  } else {
    display = [
      rt.entryAt.utc().format('YYYY-MM-DD HH:mm'),
      rt.exitAt.utc().format('YYYY-MM-DD HH:mm'),
      (moment.duration(rt.duration).humanize() + "           ").slice(0, 16),
      rt.pnl.toFixed(2),
      rt.profit.toFixed(2)
    ];
  }

  log.info('(ROUNDTRIP)', display.join('\t'));
}

Logger.prototype.handleTriggerCreated = function(trigger) {
  this.triggersManager.push(trigger);
}

Logger.prototype.handleTriggerFired = function(roundTrip) {
  this.triggersManager = _.filter(this.triggersManager, trigger => {
    return trigger.id !== roundTrip.id;
  })
}

if (mode === 'backtest') {
  // we only want to log a summarized one line report, like:
  // 2016-12-19 20:12:00: Paper trader simulated a BUY 0.000 USDT => 1.098 BTC
  Logger.prototype.handleTrade = function (trade) {
    if (trade.action !== 'sell' && trade.action !== 'buy')
      return;

    let at = trade.date.utc().format('YYYY-MM-DD HH:mm:ss');


    if (trade.action === 'sell')

      log.info(
        `${at}: Paper trader simulated a SELL`,
        `\t${this.round(trade.portfolio.currency)}`,
        `${this.currency} \t<= ${this.round(trade.portfolio.asset)}`,
        `${this.asset}`
      );

    else if (trade.action === 'buy')

      log.info(
        `${at}: Paper trader simulated a BUY`,
        `\t${this.round(trade.portfolio.currency)}`,
        `${this.currency}\t=> ${this.round(trade.portfolio.asset)}`,
        `${this.asset}`
      );
  }

  Logger.prototype.reportTrigger = function(report) {

    let profitableTrades = 0, lossMakingTrades = 0, expiredTrades = 0, 
    trashs = 0, runningTriggers = 0, profitWithoutRunningTriggers = 0, profitByRunningTriggers = 0;

    for (let i = 0; i < this.roundtrips.length; i++) {

      let curRt = this.roundtrips[i];

      if (curRt.what === "TAKEPROFIT") {
        profitableTrades++;
      } else if (curRt.what === "STOPLOSS") {
        lossMakingTrades++;
      } else if (curRt.what === "EXPIRES") {
        expiredTrades++;
      } else {
        trashs++;
      }

      profitWithoutRunningTriggers += (curRt.meta.exitPrice - curRt.meta.initialPrice) * 100 / curRt.meta.initialPrice;
    }

    runningTriggers = this.triggersManager.length;

    // Log trading trigger (vì ở đây trigger chỉ xuất hiện sau khi mua nên đồng nghĩa với việc những đồng đang trade)
    log.info();
    log.info("(PROFIT REPORT) Trading Triggers")
    log.info();
    this.logRoundtripHeading();
    for(let i = 0; i < this.triggersManager.length; i++) {
      let curTrigger = this.triggersManager[i];
      let display = [
        curTrigger.at.utc().format('YYYY-MM-DD HH:mm'),
        moment.duration(report.momentEndTime.diff(curTrigger.at)).asHours().toFixed(2),
        curTrigger.properties.initialPrice,
        report.endPrice,
        ((report.endPrice - curTrigger.properties.initialPrice) * 100 / curTrigger.properties.initialPrice).toFixed(2)
      ]
      log.info('(ROUNDTRIP)', display.join('\t'));
      profitByRunningTriggers += (report.endPrice - curTrigger.properties.initialPrice) * 100 / curTrigger.properties.initialPrice;
    }

    log.info()
    log.info("(PROFIT REPORT) Profitable Trades: \t\t\t", profitableTrades);
    log.info("(PROFIT REPORT) Loss-making Trades: \t\t\t", lossMakingTrades);
    log.info("(PROFIT REPORT) Expired Trades: \t\t\t", expiredTrades);
    log.info("(PROFIT REPORT) Running Triggers: \t\t\t", runningTriggers);
    // log.info("(PROFIT REPORT) Trash Trades: \t\t\t", trashs);
    log.info("(PROFIT REPORT) Total Profit per Trade without Running Triggers: \t", profitWithoutRunningTriggers, "%");
    log.info("(PROFIT REPORT) Total Profit per Trade by Running Triggers: \t\t", profitByRunningTriggers, "%");
    log.info("(PROFIT REPORT) Total Profit per Trade: \t\t\t\t", profitWithoutRunningTriggers + profitByRunningTriggers, "%");
  }

  Logger.prototype.finalize = function (report) {

    log.info();
    log.info('(ROUNDTRIP) REPORT:');

    this.logRoundtripHeading();
    _.each(this.roundtrips, this.logRoundtrip, this);

    // Thống kê các lần đặt trigger
    if (this.roundTripReportMode === "BY_DOUBLESTOP_TRIGGER") {
      this.reportTrigger(report);
    }

    log.info()
    log.info(`(PROFIT REPORT) start time:\t\t\t ${report.startTime}`);
    log.info(`(PROFIT REPORT) end time:\t\t\t ${report.endTime}`);
    log.info(`(PROFIT REPORT) timespan:\t\t\t ${report.timespan}`);
    log.info(`(PROFIT REPORT) exposure:\t\t\t ${report.exposure}`);
    log.info();
    log.info(`(PROFIT REPORT) start price:\t\t\t ${report.startPrice} ${this.currency}`);
    log.info(`(PROFIT REPORT) end price:\t\t\t ${report.endPrice} ${this.currency}`);
    log.info(`(PROFIT REPORT) Market:\t\t\t\t ${this.round(report.market)}%`);
    log.info();
    log.info(`(PROFIT REPORT) amount of trades:\t\t ${report.trades}`);

    this.logReport(null, report);

    log.info(
      `(PROFIT REPORT) simulated yearly profit:\t ${report.yearlyProfit}`,
      `${this.currency} (${report.relativeYearlyProfit}%)`
    );

    log.info(`(PROFIT REPORT) sharpe ratio:\t\t\t ${report.sharpe}`);
    log.info(`(PROFIT REPORT) expected downside:\t\t ${report.downside}`);
  }

  Logger.prototype.handleRoundtrip = function (rt, roundTripReportMode) {
    if (this.roundTripReportMode === roundTripReportMode) {
      this.roundtrips.push(rt);
    }
  }

} else if (mode === 'realtime') {
  Logger.prototype.handleTrade = Logger.prototype.logReport;

  Logger.prototype.handleRoundtrip = function (rt, roundTripReportMode) {
    if (this.roundTripReportMode === roundTripReportMode) {
      this.logRoundtripHeading();
      this.logRoundtrip(rt);
    }
  }

}




module.exports = Logger;
