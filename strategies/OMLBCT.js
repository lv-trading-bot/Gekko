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
    direction: "long", // short/long
    // trigger: { // Chưa dùng

    // },
    amount: amountDollar,
  })
  // cacl new balance and new asset
  // if (this.balance >= amountDollar) {
  //   this.balance = this.balance - amountDollar;
  //   this.asset = this.asset + amountDollar / price;
  //   return idBuy;
  // }
}

method.sell = function (amountAsset) {
  this.advice({
    direction: "short", // short/long,
    amount: amountAsset,
  })
  // // cacl new balance and new asset
  // if (this.asset - amountAsset >= -0.000001) { // Sai số qua nhiều lần mua bán
  //   this.asset = this.asset - amountAsset;
  //   this.balance = this.balance + amountAsset * price;
  //   return true;
  // } else {
  //   // log.info(`Not enough asset to sell, asset = ${this.asset}, amount asset = ${amountAsset}`);
  //   return false;
  // }
}

// prepare everything our method needs
method.init = function () {
  // config.OMLBCT = {
  //   startBalance: 2500,
  //   startAsset: 0,
  //   stopLoss: -8,
  //   takeProfit: 2,
  //   amountForOneTrade: 100,
  //   stopTrade: 24
  // }

  // Cấu hình random siêu lời
  // startBalance: 2500,
  // startAsset: 0,
  // stopLoss: -2,
  // takeProfit: 4,
  // amountForOneTrade: 100,
  // stopTrade: 24,
  // backtest: true
  this.balance = this.settings.startBalance;
  this.asset = this.settings.startAsset;
  this.stopLoss = this.settings.stopLoss;
  this.takeProfit = this.settings.takeProfit;
  this.amountForOneTrade = this.settings.amountForOneTrade;
  this.stopTrade = this.settings.stopTrade;
  // this.advices = [0,1,1,1,1,1,1,0,0,1,1,0,1]

  this.tradesHistory = [];
  this.tradesManager = [];

  // this.id = 1;
  this.advices = require("../" + this.settings.dataFile);

  this.loi = 0;
  this.lo = 0;
  this.random = 0;
}

method.update = function (candle) {
  if (!this.startClose) {
    this.startClose = candle.close;
  }

  let advice = this.advices[new Date(candle.start).getTime()];

  if (advice == 1) {
    this.buy(this.amountForOneTrade, candle.close);
  }

  // sell
  // for (let i = 0; i < this.tradesManager.length; i++) {
  //   let curTrade = this.tradesManager[i];
  //   // Tăng biến đợi của trade lên 1
  //   curTrade.wait++;
  // let pecentProfit = 100 * (candle.close - curTrade.close) / curTrade.close;
  // let upTrend = 100 * (candle.high - curTrade.buy.price) / Math.abs(curTrade.buy.price);
  // let downTrend = 100 * (candle.low - curTrade.buy.price) / Math.abs(curTrade.buy.price);

  // finalizeTrade = () => {
  //   curTrade.isDone = true;
  //   this.adviceIdSelling = curTrade.buy.adviceId;
  // if (this.settings.backtest) {
  //   for (let j = 0; j < this.tradesHistory.length; j++) {
  //     if (this.tradesHistory[j].id === curTrade.id) {
  //       this.tradesHistory[j].candleSell = candle;
  //       this.tradesHistory[j].candleSell.sellingPrice = sellingPrice;
  //     }
  //   }
  // }
  // }

  // // Profit less than stopLoss
  // if (downTrend <= this.stopLoss) {
  //   this.sell(curTrade.buy.amountWithFee);
  //   this.lo++;
  //   finalizeTrade()
  // } else

  //   // Profit greater than takeProfit
  //   if (upTrend >= this.takeProfit) {
  //     this.sell(curTrade.buy.amountWithFee);
  //     this.loi++;
  //     finalizeTrade()
  //   } else

  // // Vượt quá giới hạn trade
  // if (curTrade.wait >= this.stopTrade) {
  //   this.sell(curTrade.buy.amountWithFee);
  //   this.random++;
  // }
  // }
  // // Clear trading === false
  // this.tradesManager = this.tradesManager.filter(trade => {
  //   return !trade.isDone;
  // })

  this.finalClose = candle.close;
  this.finalTime = candle.start;
  // })
}

method.check = function (candle) {}

method.onTrade = function (trade) {
  if (trade.action === "buy") {
    this.tradesManager.push({
      buy: trade,
      wait: 0
    })
    if (this.settings.backtest) {
      this.tradesHistory.push({
        buy: trade
      })
    }
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
    if (this.settings.backtest) {
      for (let i = 0; i < this.tradesHistory.length; i++) {
        let curTrade = this.tradesHistory[i];
        if (curTrade.buy.adviceId === this.adviceIdSelling) {
          curTrade.sell = trade
          break;
        }
      }
    }
    //TODO: remove completed trade instead of finalizeTrade()
  }
}

const caclDistance2Dates = (date1, date2) => {
  let i = 0;
  let diff = date2 - date1;

  return diff / 3600 + 'h';
}

method.finished = function () {
  // Report
  let index = 1;
  let totalProfitPerTrade = 0;
  for (let i = 0; i < this.tradesHistory.length; i++) {
    let curTrade = this.tradesHistory[i];
    if (curTrade.sell) {
      log.write(`${index++} \t ${moment.utc(curTrade.buy.date).format('DD-MM-YYYY HH:mm')} \t Hold: ${caclDistance2Dates(curTrade.buy.date.unix(), curTrade.sell.date.unix())} \t buy: ${curTrade.buy.price} \t sell: ${curTrade.sell.price} \t profit: ${100* (curTrade.sell.price - curTrade.buy.price)/curTrade.buy.price} %`)
      totalProfitPerTrade += 100 * (curTrade.sell.price - curTrade.buy.price) / curTrade.buy.price;
    }
  }
  for (let i = 0; i < this.tradesManager.length; i++) {
    let curTrade = this.tradesManager[i];
    log.write(`${index++} \t ${moment.utc(curTrade.buy.date).format('DD-MM-YYYY HH:mm')} \t Hold: ${curTrade.wait}h \t buy: ${curTrade.buy.price} \t sell: ${this.finalClose} \t profit: ${100* (this.finalClose - curTrade.buy.price)/curTrade.buy.price} %`)
    totalProfitPerTrade += 100 * (this.finalClose - curTrade.buy.price) / curTrade.buy.price;
  }
  log.write(`Total Profit Per Trade: \t ${totalProfitPerTrade} %`);
  log.write(`Amount take profit: \t ${this.loi}`);
  log.write(`Amount stop loss: \t ${this.lo}`);
  log.write(`Amount random: \t ${this.random}`);
  // log.write(`\n`);
  // log.write(`Start Balance: \t\t\t ${this.tradesHistory[0].buy.} $`);
  // log.write(`End balance: \t\t\t ${this.balance} $`);
  // log.write(`Profit: \t\t\t ${this.balance - this.settings.startBalance} $`);
  // log.write(`Total Profit: \t\t\t ${100*(this.balance - this.settings.startBalance)/this.settings.startBalance} %`);
  // log.write(`Total Profit Per Trade: \t ${totalProfitPerTrade} %`);
  // log.write(`Profit versus Market: \t\t ${100*(this.balance - this.settings.startBalance)/this.startClose} %`)
  // log.write(`Number of profitable trades: \t ${_.filter(this.tradesHistory, curTrade => {
  //   if (!curTrade.candleSell) {
  //     return false;
  //   }
  //   return (curTrade.candleSell.sellingPrice - curTrade.candleBuy.close) > 0;
  // }).length}`);
  // log.write(`Number of loss-making trades: \t ${
  //   _.filter(this.tradesHistory, curTrade => {
  //     if (!curTrade.candleSell) return false;
  //     return (curTrade.candleSell.sellingPrice - curTrade.candleBuy.close) < 0;
  //   }).length
  // }`);
  // log.write(`Market: \t\t\t ${100 * (this.finalClose - this.startClose) / this.startClose} %`);
  // log.write(`Start Price (open): \t\t ${this.startClose} $`);
  // log.write(`End Price (close): \t\t ${this.finalClose} $`);
  // log.write(`\n`);
}

module.exports = method;
