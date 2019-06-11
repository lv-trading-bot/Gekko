// helpers
var _ = require('lodash');
var log = require('../core/log');
const moment = require('moment');
const axios = require('axios');
var utils = require('../core/util');
const fs = require('fs');
let candleSize = utils.getConfig()['tradingAdvisor'].candleSize;
let marketInfo = utils.getConfig().watch;
const ML_base_api = process.env.LIVE_TRADE_MANAGER_BASE_API;
const api = ML_base_api ? `${ML_base_api}/advice` : "http://localhost:3004/advice";
const apiStopLoss = ML_base_api ? `${ML_base_api}/pair-control` : "http://localhost:3004/pair-control";

let AUTHENTICATION_TOKEN = process.env.AUTHENTICATION_TOKEN;

axios.defaults.headers.common['Authorization'] = AUTHENTICATION_TOKEN;

// let's create our own method
var method = {};

method.buy = function (amountDollar, candle) {
  // Tìm xem có trigger nào sắp hết hạn không
  let triggerExpireSoons = _.filter(this.triggerManagers, trigger => {
    // 2 lần candle size + 1m vì 1 lần candle size để dịch tới hiện tại từ candle.start
    // 1 lần còn lại để phát hiện những candle đã chờ 23h
    if (candle.start.clone().add(2 * candleSize + 1, 'm').isSameOrAfter(trigger.properties.expires)) {
      return true;
    }
    return false;
  })
  if (triggerExpireSoons.length > 0) {
    //Tìm ra trigger có giá mua thấp nhất
    let theBestTrigger = null;
    for (let i = 0; i < triggerExpireSoons.length; i++) {
      let curTrigger = triggerExpireSoons[i];
      if (!theBestTrigger) {
        theBestTrigger = curTrigger;
      } else if (theBestTrigger.properties.initialPrice > curTrigger.properties.initialPrice) {
        theBestTrigger = curTrigger;
      }
    }

    this.updateTrigger(theBestTrigger, candle.close, candle.start);

  } else {
    this.advice({
      direction: "long",
      amount: amountDollar,
    })
  }
}

method.sell = function (amountAsset) {
  this.advice({
    direction: "short",
    amount: amountAsset,
  })
}

method.createTrigger = function (trade) {
  this.advice({
    direction: 'long',
    amount: 0,
    trigger: {
      type: 'doubleStop',
      initialStart: trade.date,
      initialPrice: trade.price,
      currentInitialPrice: trade.price,
      stopLoss: this.stopLoss,
      takeProfit: this.takeProfit,
      expires: moment(trade.date).clone().add(this.expirationPeriod * candleSize, 'm'),
      assetAmount: trade.amountWithFee,
    }
  })
}

method.updateTrigger = function (trigger, price, start) {
  this.advice({
    direction: 'long',
    amount: 0,
    trigger: {
      type: 'doubleStop',
      id: trigger.id,
      currentInitialPrice: price,
      expires: moment(start).clone().add(this.expirationPeriod * candleSize, 'm'),
    }
  })
}

const loadId = () => {
  let id = null;
  try {
    id = JSON.parse((fs.readFileSync('./save_info/' + '/idOfManager.json'))).id;
  } catch (error) {
    log.warn(error)
  }
  return id;
}

method.getAdvice = function (_candle) {
  return new Promise((resolve, reject) => {
    let id = loadId();
    let candle = _.cloneDeep(_candle);
    let data = {
      model_info: {
        ...this.settings.modelInfo,
        market_info: marketInfo,
        candle_size: candleSize,
        train_daterange: {
          from: new Date(this.settings.modelInfo.train_daterange.from).getTime(),
          to: new Date(this.settings.modelInfo.train_daterange.to).getTime()
        },
      },
      candle_start: moment(candle.start).valueOf(),
      id: id || "cannot_get_id",
      asset: marketInfo.asset,
      currency: marketInfo.currency
    }

    log.info('get advice');
    axios.post(api, data)
      .then(function (response) {
        //handle
        let result = response.data.result || 0;
        resolve(result)
      })
      .catch(function (error) {
        console.log(error + "", error.response ? error.response.data : "");
        log.warn(error, error.response ? error.response.data : "");
        resolve(0);
      });
  })
}

// prepare everything our method needs
method.init = function () {
  this.stopLoss = this.settings.stopLoss;
  this.takeProfit = this.settings.takeProfit;
  this.amountForOneTrade = this.settings.amountForOneTrade;
  this.expirationPeriod = this.settings.expirationPeriod;
  this.decisionThreshold = this.settings.decisionThreshold;
  this.stopTradeLimit = this.settings.stopTradeLimit;
  this.breakDuration = this.settings.breakDuration;

  // this.advices = require("../" + this.settings.dataFile);

  this.isAllowTrade = true;
  this.deadLineAllowTradeAgain = null;

  this.totalProfit = 0;

  this.triggerManagers = [];

}

method.updateStateTrade = function (candle) {
  //Xét xem vượt ngưỡng thì đặt thời gian dừng
  if (this.totalProfit <= this.stopTradeLimit) {
    let message = ["\n"];
    message.push("*************************************************************************************");
    message.push("Hiện tại hệ thống đã dừng trade!");
    message.push(`Hiện tại đã lỗ ${this.totalProfit.toFixed(2)}%`);
    message.push("Trong khoảng thời gian dừng trade, hệ thống sẽ bán các lệnh đã mua như thường lệ!");


    if (this.breakDuration === -1) {
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

    let id = loadId();

    let data = {
      id: id || "cannot_get_id",
      asset: marketInfo.asset,
      currency: marketInfo.currency,
      accept_buy: false,
      set_by: "gekko"
    };

    axios.put(apiStopLoss, data)
      .then(function (response) {
      })
      .catch(function (error) {
        this.isAllowTrade = false;
        console.log(error + "", error.response ? error.response.data : "");
        log.warn(error, error.response ? error.response.data : "");
      });
  } else if (this.totalProfit > 0) {
    //Bỏ những lần trade dương đi, khi nào lỗ mới dừng
    this.totalProfit = 0;
  }

  // Cập nhật lại biến isAllowTrade khi hết thời gian chờ
  if (this.deadLineAllowTradeAgain != null && !this.isAllowTrade && candle.start.isAfter(this.deadLineAllowTradeAgain)) {
    this.isAllowTrade = true;
    // reset phiên
    this.totalProfit = 0;
  }
}

method.check = async function (candle) {

  this.updateStateTrade(candle);

  if (!this.startClose) {
    this.startClose = candle.close;
  }

  let advice = await this.getAdvice(candle);
  // let advice = 1;

  log.debug('advice', advice);
  log.debug(candle)

  if (advice >= this.decisionThreshold && this.isAllowTrade) {
    this.buy(this.amountForOneTrade, candle);
  }

  this.finalClose = candle.close;
  this.finalTime = candle.start;
}

// method.check = function (candle) {}

//completed trades
method.onTrade = function (trade) {
  if (trade.action === "buy") {
    //assetAmount now known, insert trigger
    if (trade.amountWithFee != 0) {
      this.createTrigger(trade);
    }
  } else if (trade.action === 'sell') {

  }
}

method.onTriggerFired = function (trigger) {
  let profit = (trigger.meta.exitPrice - trigger.meta.initialPrice) * 100 / trigger.meta.initialPrice;
  this.totalProfit += profit;

  // Xóa các trigger đang giữ
  this.triggerManagers = _.filter(this.triggerManagers, _trigger => {
    return _trigger.id !== trigger.id
  })
}

method.onTriggerCreated = function (trigger) {
  this.triggerManagers.push(trigger);
}

method.onTriggerUpdated = function (trigger) {
  for (let i = 0; i < this.triggerManagers.length; i++) {
    if (this.triggerManagers[i].id === trigger.id) {
      this.triggerManagers[i] = trigger;
      break;
    }
  }
}

// for backtest
method.finished = function () { }

module.exports = method;