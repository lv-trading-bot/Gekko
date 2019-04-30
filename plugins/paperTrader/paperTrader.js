const _ = require('lodash');
const moment = require('moment');

const util = require('../../core/util');
const ENV = util.gekkoEnv();
const mode = util.gekkoMode();
const exchange = util.getConfig().watch.exchange;
const asset = util.getConfig().watch.asset;
const currency = util.getConfig().watch.currency;

const config = util.getConfig();
const calcConfig = config.paperTrader;
const watchConfig = config.watch;
const dirs = util.dirs();
const log = require(dirs.core + 'log');

const TrailingStop = require(dirs.broker + 'triggers/trailingStop');
const DoubleStop = require(dirs.broker + 'triggers/doubleStop');

const nameFileSaveStateTrigger = "triggersOfPaperTrader";
const nameFileSavePortfolio = "portfolioOfPaperTrader";

const PaperTrader = function () {
  _.bindAll(this);

  if (calcConfig.feeUsing === 'maker') {
    this.rawFee = calcConfig.feeMaker;
  } else {
    this.rawFee = calcConfig.feeTaker;
  }

  this.fee = 1 - this.rawFee / 100;

  this.currency = watchConfig.currency;
  this.asset = watchConfig.asset;

  try {
    this.portfolio = util.getCurrenPortfolio(nameFileSavePortfolio);
  } catch (err) {
    this.portfolio = {
      asset: calcConfig.simulationBalance.asset,
      currency: calcConfig.simulationBalance.currency,
    }
  }

  this.balance = false;

  if (this.portfolio.asset > 0) {
    // this.exposed = true;
  }

  this.propogatedTrades = 0;
  this.propogatedTriggers = 0;

  this.activeDoubleStopTriggers = [];
  this.loadTriggers();
  this.exchange = new (require('./getPriceFromOrderExchange/' + exchange))(asset, currency);
}

PaperTrader.prototype.loadTriggers = function () {
  let triggers = [];
  try {
    triggers = util.getTriggersStateFromFile(nameFileSaveStateTrigger);

    let totalAssetFromTriggers = 0;
    let triggerId = "";

    _.forEach(triggers, trigger => {
      totalAssetFromTriggers += parseFloat(trigger.assetAmount);
      triggerId = 'trigger-' + (++this.propogatedTriggers);
      this.activeDoubleStopTriggers.push(
        new DoubleStop({
          ...trigger,
          id: triggerId,
          initialStart: moment(trigger.initialStart),
          expires: moment(trigger.expires),
          onTrigger: this.onDoubleStopTrigger
        })
      )
    })

    // Trường hợp k đủ asset thì cancel toàn bộ trigger vừa load lên
    if (totalAssetFromTriggers > this.portfolio.asset) {
      this.activeDoubleStopTriggers = [];
    }
  } catch (error) {

  }
}

PaperTrader.prototype.isValidAdvice = function (advice) {
  // All in
  if (!advice.amount) {
    return true;
  }
  if (advice.recommendation === 'long') {
    if (advice.amount <= this.portfolio.currency) {
      return true;
    } else {
      log.warn(`Not enough money to buy. Currency: ${this.portfolio.currency}, Amount: ${advice.amount}`)
      return false;
    }
  } else if (advice.recommendation === 'short') {
    if (this.portfolio.asset >= advice.amount) {
      return true;
    } else {
      // Trường hợp sai số nhiều lần dẫn đến asset k đủ để bán
      if (advice.amount - this.portfolio.asset >= 0) {
        advice.amount = this.portfolio.asset;
        return true;
      }
      log.warn(`Not enough asset to sell. asset: ${this.portfolio.asset}, Amount: ${advice.amount}`)
      return false;
    }
  }
}

PaperTrader.prototype.relayPortfolioChange = function () {
  this.deferredEmit('portfolioChange', {
    asset: this.portfolio.asset,
    currency: this.portfolio.currency
  });
}

PaperTrader.prototype.relayPortfolioValueChange = function () {
  this.deferredEmit('portfolioValueChange', {
    balance: this.getBalance()
  });
}

PaperTrader.prototype.extractFee = function (amount) {
  amount *= 1e8;
  amount *= this.fee;
  amount = Math.floor(amount);
  amount /= 1e8;
  return amount;
}

PaperTrader.prototype.setStartBalance = function () {
  this.balance = this.getBalance();
}

// after every succesfull trend ride we hopefully end up
// with more BTC than we started with, this function
// calculates Gekko's profit in %.
PaperTrader.prototype.updatePosition = function (what, amount) {
  return new Promise(async (resolve, reject) => {
    let price = this.price;
    if (mode === 'realtime') {
      try {
        let tempPrice = await this.exchange.getPrice(what, amount);
        price = tempPrice ? tempPrice : this.price;
      } catch (error) {
        log.info("" + error);
        price = this.price;
      }
    }

    let cost;
    // let amount;
    let amountWithFee = 0;

    // virtually trade all {currency} to {asset}
    // at the current price (minus fees)
    if (what === 'long') {
      // amount: currency
      // amountWithFee: asset
      // Nếu không có amount thì chuyển về all-in
      amount = amount !== undefined ? amount : this.portfolio.currency;
      amountWithFee = this.extractFee(amount / price);
      cost = (1 - this.fee) * amount;
      this.portfolio.asset += amountWithFee;
      this.portfolio.currency -= amount;

      // this.exposed = true;
      // this.trades++;
    }

    // virtually trade all {currency} to {asset}
    // at the current price (minus fees)
    else if (what === 'short') {
      // amount: asset
      // amountWithFee: currency
      // Nếu không có amount thì chuyển về all-in
      amount = amount !== undefined ? amount : (this.portfolio.asset);
      amountWithFee = this.extractFee(amount * price);
      cost = (1 - this.fee) * (amount * price);
      this.portfolio.currency += amountWithFee;
      this.portfolio.asset -= amount;

      // this.exposed = false;
      // this.trades++;
    }

    const effectivePrice = price * this.fee;

    resolve({
      cost,
      amount,
      effectivePrice,
      amountWithFee
    });
  })
}

PaperTrader.prototype.getBalance = function () {
  return this.portfolio.currency + this.price * this.portfolio.asset;
}

PaperTrader.prototype.now = function () {
  return this.candle.start.clone().add(1, 'minute');
}

PaperTrader.prototype.processAdvice = async function (advice) {
  if (!this.isValidAdvice(advice) && advice.amount !== undefined) return;
  let action;
  if (advice.recommendation === 'short') {
    action = 'sell';

    // clean up potential old stop trigger
    if (this.activeStopTrigger) {
      this.deferredEmit('triggerAborted', {
        id: this.activeStopTrigger.id,
        date: advice.date
      });

      delete this.activeStopTrigger;
    }

  } else if (advice.recommendation === 'long') {
    action = 'buy';

    if (advice.trigger) {

      // clean up potential old stop trigger
      if (this.activeStopTrigger) {
        this.deferredEmit('triggerAborted', {
          id: this.activeStopTrigger.id,
          date: advice.date
        });

        delete this.activeStopTrigger;
      }

      this.createTrigger(advice);
    }
  } else {
    return log.warn(
      `[Papertrader] ignoring unknown advice recommendation: ${advice.recommendation}`
    );
  }

  //ignore 'ghost' advice (only used for creating triggers)
  if (advice.amount === 0) {
    return;
  }
  this.tradeId = 'trade-' + (++this.propogatedTrades);

  this.deferredEmit('tradeInitiated', {
    id: this.tradeId,
    adviceId: advice.id,
    action,
    portfolio: _.clone(this.portfolio),
    balance: this.getBalance(),
    date: advice.date,
  });

  const {
    cost,
    amount,
    effectivePrice,
    amountWithFee
  } = await this.updatePosition(advice.recommendation, advice.amount);

  this.relayPortfolioChange();
  this.relayPortfolioValueChange();

  this.deferredEmit('tradeCompleted', {
    id: _.cloneDeep(this.tradeId),
    adviceId: advice.id,
    action,
    cost,
    amount,
    price: _.cloneDeep(this.price),
    portfolio: _.cloneDeep(this.portfolio),
    balance: this.getBalance(),
    date: advice.date,
    effectivePrice,
    feePercent: this.rawFee,
    amountWithFee: amountWithFee
  });
}

PaperTrader.prototype.createTrigger = function (advice) {
  const trigger = advice.trigger;

  if (trigger && trigger.type === 'trailingStop') {

    if (!trigger.trailValue) {
      return log.warn(`[Papertrader] ignoring trailing stop without trail value`);
    }

    const triggerId = 'trigger-' + (++this.propogatedTriggers);

    this.deferredEmit('triggerCreated', {
      id: triggerId,
      at: advice.date,
      type: 'trailingStop',
      properties: {
        trail: trigger.trailValue,
        initialPrice: this.price,
      }
    });

    this.activeStopTrigger = {
      id: triggerId,
      adviceId: advice.id,
      instance: new TrailingStop({
        initialPrice: this.price,
        trail: trigger.trailValue,
        onTrigger: this.onStopTrigger
      })
    }
  } else if (trigger && trigger.type === 'doubleStop') {
    if (!trigger.id && (!trigger.stopLoss || !trigger.takeProfit || trigger.assetAmount < 0)) {
      return log.warn(`[Papertrader] Please provide correct arguments for doubleStop trigger: (stopLoss, takeProfit, assetAmount)=(${trigger.stopLoss}, ${trigger.takeProfit}, ${trigger.assetAmount})`);
    }

    if (!trigger.id) {
      const triggerId = 'trigger-' + (++this.propogatedTriggers);

      this.deferredEmit('triggerCreated', {
        id: triggerId,
        at: advice.date,
        type: 'doubleStop',
        properties: {
          initialStart: trigger.initialStart,
          initialPrice: trigger.initialPrice,
          currentInitialPrice: trigger.currentInitialPrice,
          stopLoss: trigger.stopLoss,
          takeProfit: trigger.takeProfit,
          expires: moment(trigger.expires),
          assetAmount: trigger.assetAmount
        }
      });

      this.activeDoubleStopTriggers.push(
        new DoubleStop({
          id: triggerId,
          adviceId: advice.id,
          initialStart: trigger.initialStart,
          initialPrice: trigger.initialPrice,
          currentInitialPrice: trigger.currentInitialPrice,
          stopLoss: trigger.stopLoss,
          takeProfit: trigger.takeProfit,
          expires: moment(trigger.expires),
          assetAmount: trigger.assetAmount,
          onTrigger: this.onDoubleStopTrigger
        })
      )
      this.saveCurrentState();
    } else if (trigger.id) {
      // update trigger
      for (let i = 0; i < this.activeDoubleStopTriggers.length; i++) {
        let curTrigger = this.activeDoubleStopTriggers[i];
        if (curTrigger.id === trigger.id) {
          curTrigger.expires = trigger.expires;
          curTrigger.currentInitialPrice = trigger.currentInitialPrice;
          this.deferredEmit('triggerUpdated', {
            id: curTrigger.id,
            at: curTrigger.initialStart,
            type: 'doubleStop',
            properties: {
              initialStart: curTrigger.initialStart,
              initialPrice: curTrigger.initialPrice,
              currentInitialPrice: curTrigger.currentInitialPrice,
              stopLoss: curTrigger.stopLoss,
              takeProfit: curTrigger.takeProfit,
              expires: moment(curTrigger.expires),
              assetAmount: curTrigger.assetAmount
            }
          });
          this.saveCurrentState();
          break;
        }
      }
    }
  } else {
    log.warn(`[Papertrader] Gekko does not know trigger with type "${trigger.type}".. Ignoring stop.`);
  }
}

PaperTrader.prototype.onDoubleStopTrigger = async function ({ id, assetAmount, roundTrip }) {

  const date = this.now();

  this.deferredEmit('triggerFired', roundTrip);

  const {
    cost,
    amount,
    effectivePrice,
    amountWithFee
  } = await this.updatePosition('short', assetAmount);

  this.relayPortfolioChange();
  this.relayPortfolioValueChange();

  this.tradeId = 'trade-' + (++this.propogatedTrades);

  let trigger = _.find(this.activeDoubleStopTriggers, function (item) {
    return item.id === id;
  })

  this.deferredEmit('tradeCompleted', {
    id: _.cloneDeep(this.tradeId),
    adviceId: _.cloneDeep(trigger.adviceId),
    action: 'sell',
    cost,
    amount,
    price: _.cloneDeep(this.price),
    portfolio: _.cloneDeep(this.portfolio),
    balance: this.getBalance(),
    date,
    effectivePrice,
    feePercent: _.cloneDeep(this.rawFee),
    amountWithFee
  });

  this.activeDoubleStopTriggers = this.activeDoubleStopTriggers.filter(function (item) {
    return item.id !== id
  })
  this.saveCurrentState();
}

PaperTrader.prototype.saveCurrentState = function () {
  if (util.gekkoMode() === 'realtime') {
    util.updateTriggersStateToFile(nameFileSaveStateTrigger, this.activeDoubleStopTriggers);
    util.saveCurrentPortfolio(nameFileSavePortfolio, this.portfolio);
  }
}

PaperTrader.prototype.onStopTrigger = async function () {

  const date = this.now();

  this.deferredEmit('triggerFired', {
    id: this.activeStopTrigger.id,
    date
  });

  const {
    cost,
    amount,
    effectivePrice,
    amountWithFee
  } = await this.updatePosition('short');

  this.relayPortfolioChange();
  this.relayPortfolioValueChange();

  this.deferredEmit('tradeCompleted', {
    id: this.tradeId,
    adviceId: this.activeStopTrigger.adviceId,
    action: 'sell',
    cost,
    amount,
    price: this.price,
    portfolio: this.portfolio,
    balance: this.getBalance(),
    date,
    effectivePrice,
    feePercent: this.rawFee,
    amountWithFee
  });

  delete this.activeStopTrigger;
}

PaperTrader.prototype.processCandle = function (candle, done) {
  if (util.gekkoMode() === 'realtime') {
    log.info('Number of triggers: ', this.activeDoubleStopTriggers.length);
  }
  this.price = candle.close;
  this.candle = candle;

  if (!this.balance) {
    this.setStartBalance();
    this.relayPortfolioChange();
    this.relayPortfolioValueChange();
  }

  // if (this.exposed) {
  //   this.relayPortfolioValueChange();
  // }

  //relay everytime because now gekko doesn't all-in
  this.relayPortfolioValueChange();

  if (this.activeStopTrigger) {
    this.activeStopTrigger.instance.updatePrice(this.price, this.candle.start);
  }

  if (this.activeDoubleStopTriggers) {
    this.activeDoubleStopTriggers.forEach(trigger => {
      trigger.updatePrice(candle)
    });
  }

  done();
}

module.exports = PaperTrader;
