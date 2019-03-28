// helpers
var _ = require('lodash');
var log = require('../core/log');
// const axios = require('axios');
const moment = require('moment');
var utils = require('../core/util');
const candleSize = utils.getConfig()['tradingAdvisor'].candleSize;
const daterange = utils.getConfig()['backtest'].daterange;

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
  this.stopTrade = this.settings.stopTrade;

  this.advices = require("../" + this.settings.dataFile);
}

method.update = function (candle) {
  const isLastCandle = candle.start.isSame(moment.utc(daterange.to).subtract(candleSize, 'm'));
  if (isLastCandle) {
    this.advice({
      direction: 'clean'
    })
    return;
  }

  let advice = this.advices[new Date(candle.start).getTime()];

  if (advice == 1) {
    this.buy(this.amountForOneTrade, candle.close);
  }

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
          expires: moment(trade.date).add(this.settings.stopTrade * candleSize, 'm'),
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
