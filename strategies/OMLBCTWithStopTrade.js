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
  this.breakDuration = this.settings.breakDuration;

  this.advices = require("../" + this.settings.dataFile);

  this.isAllowTrade = true;
  this.deadLineAllowTradeAgain = null;

  this.totalProfit = 0;
}

method.updateStateTrade = function(candle) {
  //Xét xem vượt ngưỡng thì đặt thời gian dừng
  if(this.totalProfit <= this.stopTradeLimit) {
    let message = ["\n"];
    message.push("*************************************************************************************");
    message.push("Hiện tại hệ thống đã dừng trade!");
    message.push(`Hiện tại đã lỗ ${this.totalProfit.toFixed(2)}%`);
    message.push("Trong khoảng thời gian dừng trade, hệ thống sẽ bán các lệnh đã mua như thường lệ!");

    this.isAllowTrade = false;

    if(this.breakDuration === -1) {
      this.deadLineAllowTradeAgain = null;
    } else {
      this.deadLineAllowTradeAgain = candle.start.clone().add(this.breakDuration * candleSize, "m");
      message.push(`Hệ thống sẽ bắt đầu trade lại vào lúc ${this.deadLineAllowTradeAgain.utc().format('YYYY-MM-DD HH:mm')}`);
    }
    // cập nhật để "if" phía trên không bị gọi lại
    this.totalProfit = 0;
    message.push("*************************************************************************************");
    this.notify(message.join("\n\t"));
    log.info(message.join("\n\t"));
  } else if (this.totalProfit > 0) {
    //Bỏ những lần trade dương đi, khi nào lỗ mới dừng
    this.totalProfit = 0;
  }

  // Cập nhật lại biến isAllowTrade khi hết thời gian chờ
  if(this.deadLineAllowTradeAgain!= null && !this.isAllowTrade && candle.start.isAfter(this.deadLineAllowTradeAgain)) {
    this.isAllowTrade = true;
    // reset phiên
    this.totalProfit = 0;
  }
}

method.update = function (candle) {

  this.updateStateTrade(candle);

  if (!this.startClose) {
    this.startClose = candle.close;
  }

  let advice = this.advices[new Date(candle.start).getTime()];

  if (advice == 1 && this.isAllowTrade) {
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
          expires: moment(trade.date).add(this.expirationPeriod * candleSize, 'm'),
          assetAmount: trade.amountWithFee,
        }
      })
    }
  } else if (trade.action === 'sell') {

  }
}

method.onTriggerFired = function(trigger) {
  let profit = (trigger.meta.exitPrice - trigger.meta.initialPrice) * 100 / trigger.meta.initialPrice;
  this.totalProfit += profit;
}

// for backtest
method.finished = function () {}

module.exports = method;