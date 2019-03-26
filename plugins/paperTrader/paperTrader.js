const _ = require('lodash');
const moment = require('moment');

const util = require('../../core/util');
const ENV = util.gekkoEnv();

const config = util.getConfig();
const calcConfig = config.paperTrader;
const watchConfig = config.watch;
const dirs = util.dirs();
const log = require(dirs.core + 'log');

const TrailingStop = require(dirs.broker + 'triggers/trailingStop');
const DoubleStop = require(dirs.broker + 'triggers/doubleStop');

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

  this.portfolio = {
    asset: calcConfig.simulationBalance.asset,
    currency: calcConfig.simulationBalance.currency,
  }

  this.balance = false;

  if (this.portfolio.asset > 0) {
    this.exposed = true;
  }

  this.propogatedTrades = 0;
  this.propogatedTriggers = 0;

  this.activeDoubleStopTriggers = []
}

PaperTrader.prototype.isValidAdvice = function (advice) {
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
    amountWithFee = this.extractFee(amount / this.price);
    cost = (1 - this.fee) * amount;
    this.portfolio.asset += amountWithFee;
    this.portfolio.currency -= amount;

    this.exposed = true;
    this.trades++;
  }

  // virtually trade all {currency} to {asset}
  // at the current price (minus fees)
  else if (what === 'short') {
    // amount: asset
    // amountWithFee: currency
    // Nếu không có amount thì chuyển về all-in
    amount = amount !== undefined ? amount : (this.portfolio.currency / this.price);
    amountWithFee = this.extractFee(amount * this.price);
    cost = (1 - this.fee) * (amount * this.price);
    this.portfolio.currency += amountWithFee;
    this.portfolio.asset -= amount;

    this.exposed = false;
    this.trades++;
  }

  const effectivePrice = this.price * this.fee;

  return {
    cost,
    amount,
    effectivePrice,
    amountWithFee
  };
}

PaperTrader.prototype.getBalance = function () {
  return this.portfolio.currency + this.price * this.portfolio.asset;
}

PaperTrader.prototype.now = function () {
  return this.candle.start.clone().add(1, 'minute');
}

PaperTrader.prototype.processAdvice = function (advice) {
  if (!this.isValidAdvice(advice)) return;
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
  } = this.updatePosition(advice.recommendation, advice.amount);

  this.relayPortfolioChange();
  this.relayPortfolioValueChange();

  this.deferredEmit('tradeCompleted', {
    id: this.tradeId,
    adviceId: advice.id,
    action,
    cost,
    amount,
    price: this.price,
    portfolio: this.portfolio,
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

    if (!trigger.stopLoss || !trigger.takeProfit || trigger.assetAmount < 0) {
      return log.warn(`[Papertrader] Please provide correct arguments for doubleStop trigger: (stopLoss, takeProfit, assetAmount)=(${trigger.stopLoss}, ${trigger.takeProfit}, ${trigger.assetAmount})`);
    }

    const triggerId = 'trigger-' + (++this.propogatedTriggers);

    this.deferredEmit('triggerCreated', {
      id: triggerId,
      at: advice.date,
      type: 'doubleStop',
      properties: {
        initialStart: trigger.initialStart,
        initialPrice: trigger.initialPrice,
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
        stopLoss: trigger.stopLoss,
        takeProfit: trigger.takeProfit,
        expires: moment(trigger.expires),
        assetAmount: trigger.assetAmount,
        onTrigger: this.onDoubleStopTrigger
      })
    )
  } else {
    log.warn(`[Papertrader] Gekko does not know trigger with type "${trigger.type}".. Ignoring stop.`);
  }
}

PaperTrader.prototype.onDoubleStopTrigger = function (id, assetAmount, debug) {

  console.log(debug);

  const date = this.now();

  this.deferredEmit('triggerFired', {
    id: id,
    date
  });

  const {
    cost,
    amount,
    effectivePrice,
    amountWithFee
  } = this.updatePosition('short', assetAmount);

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

}

PaperTrader.prototype.onStopTrigger = function () {

  const date = this.now();

  this.deferredEmit('triggerFired', {
    id: this.activeStopTrigger.id,
    date
  });

  const {
    cost,
    amount,
    effectivePrice
  } = this.updatePosition('short');

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
    feePercent: this.rawFee
  });

  delete this.activeStopTrigger;
}

PaperTrader.prototype.processCandle = function (candle, done) {
  this.price = candle.close;
  this.candle = candle;

  if (!this.balance) {
    this.setStartBalance();
    this.relayPortfolioChange();
    this.relayPortfolioValueChange();
  }

  if (this.exposed) {
    this.relayPortfolioValueChange();
  }

  if (this.activeStopTrigger) {
    this.activeStopTrigger.instance.updatePrice(this.price, this.candle.start);
  }

  if (this.activeDoubleStopTriggers) {
    this.activeDoubleStopTriggers.forEach(trigger => {
      trigger.updatePrice(this.price, moment(this.candle.start))
    });
  }

  done();
}

module.exports = PaperTrader;
