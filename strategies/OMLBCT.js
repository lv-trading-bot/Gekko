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
  this.balance = this.settings.startBalance;
  this.asset = this.settings.startAsset;
  this.stopLoss = this.settings.stopLoss;
  this.takeProfit = this.settings.takeProfit;
  this.amountForOneTrade = this.settings.amountForOneTrade;
  this.stopTrade = this.settings.stopTrade;

  this.advices = require("../" + this.settings.dataFile);
}

method.update = function (candle) {

  if (candle.start.isSame(moment.utc("2018-05-01 01:00:00"))) {
    this.sell();
  }

  if (!this.startClose) {
    this.startClose = candle.close;
  }

  let advice = this.advices[new Date(candle.start).getTime()];

  if (advice == 1) {
    this.buy(this.amountForOneTrade, candle.close);
  }

  this.finalClose = candle.close;
  this.finalTime = candle.start;
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
