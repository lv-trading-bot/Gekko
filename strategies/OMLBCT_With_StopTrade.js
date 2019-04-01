// helpers
var _ = require('lodash');
var log = require('../core/log');
// const axios = require('axios');
const moment = require('moment');
var utils = require('../core/util');
let candleSize = utils.getConfig()['tradingAdvisor'].candleSize;

// let's create our own method
var method = {};

method.buy = function (amountDollar) {
  this.advice({
    direction: "long",
    // trigger: { // Chưa dùng

    // },
    amount: amountDollar,
  })
}

method.sell = function (amountAsset) {
  this.advice({
    direction: "short",
    amount: amountAsset,
  })
}

// prepare everything our method needs
method.init = function () {
  this.stopLoss = this.settings.stopLoss;
  this.takeProfit = this.settings.takeProfit;
  this.amountForOneTrade = this.settings.amountForOneTrade;
  this.expirationPeriod = this.settings.expirationPeriod;

  this.stopTradeLimit = this.settings.stopTradeLimit;
  this.totalWatchCandles = this.settings.totalWatchCandles;
  this.breakDuration = this.settings.breakDuration;
  this.totalWatchCandlesManager = [];

  this.advices = require("../" + this.settings.dataFile);

  this.isAllowTrade = true;
  this.deadLineAllowTradeAgain = null;
}

method.updateStateTrade = function(candle) {
  //Nếu số lượng candle theo dõi vượt lượng cần theo dõi thì xóa bớt những thằng đầu
  if(this.totalWatchCandlesManager.length > this.totalWatchCandles) {
    this.totalWatchCandlesManager.splice(0, this.totalWatchCandles - this.totalWatchCandlesManager.length);
  }
  // Tính lời lỗ
  let totalProfit = 0;
  for(let i = 0; i < this.totalWatchCandlesManager.length; i++) {
    let curCandle = this.totalWatchCandlesManager[i];
    totalProfit += (candle.close - curCandle.close) * 100 / curCandle.close;
  }

  //Xét xem vượt ngưỡng thì đặt thời gian dừng
  if(totalProfit <= this.stopTradeLimit) {
    this.isAllowTrade = false;
    this.deadLineAllowTradeAgain = candle.start.clone().add(this.breakDuration * candleSize, "m");
  }

  // Cập nhật lại biến isAllowTrade khi hết thời gian chờ
  if(!this.isAllowTrade && candle.start.isAfter(this.deadLineAllowTradeAgain)) {
    this.isAllowTrade = true;
    // reset
    this.totalWatchCandlesManager = [];
  }
}

method.update = function (candle) {
  if (!this.startClose) {
    this.startClose = candle.close;
  }

  let advice = this.advices[new Date(candle.start).getTime()];

  if (advice == 1 && this.isAllowTrade) {
    this.buy(this.amountForOneTrade, candle.close);
    this.totalWatchCandlesManager.push(candle);
  }

  this.finalClose = candle.close;
  this.finalTime = candle.start;
  
  this.updateStateTrade(candle);
}

method.check = function (candle) {}

//completed trades
method.onTrade = function (trade) {
  if (trade.action === "buy") {
    //assetAmount now known, insert trigger
    if (trade.amountWithFee != 0) {
      this.advice({
        direction: 'long',
        amount: 0,
        trigger: {
          type: 'doubleStop',
          initialStart: trade.date,
          initialPrice: trade.price,
          stopLoss: this.settings.stopLoss,
          takeProfit: this.settings.takeProfit,
          expires: moment(trade.date).add(this.expirationPeriod * candleSize, 'm'),
          assetAmount: trade.amountWithFee,
        }
      })
    }
  } else if (trade.action === 'sell') {

  }
}

const caclDistance2Dates = (date1, date2) => {
  let diff = date2 - date1;
  return diff / 3600 + 'h';
}

method.finished = function () {}

module.exports = method;
