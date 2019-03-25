const _ = require('lodash');

const util = require('../../core/util');
const ENV = util.gekkoEnv();

const config = util.getConfig();
const calcConfig = config.paperTrader;
const watchConfig = config.watch;
const dirs = util.dirs();
const log = require(dirs.core + 'log');

const TrailingStop = require(dirs.broker + 'triggers/trailingStop');

const PaperTrader = function() {
  _.bindAll(this);

  if(calcConfig.feeUsing === 'maker') {
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

  if(this.portfolio.asset > 0) {
    this.exposed = true;
  }

  this.propogatedTrades = 0;
  this.propogatedTriggers = 0;
}

PaperTrader.prototype.isValidAdvice = function(advice) {
  if ( advice.recommendation === 'long') {
    if ( advice.amount <= this.portfolio.currency ) {
      return true;
    } else {
      log.warn(`Not enough money to buy. Currency: ${this.portfolio.currency}, Amount: ${advice.amount}`)
      return false;
    }
  } else if ( advice.recommendation === 'short' ) {
    if ( this.portfolio.asset >= advice.amount ) {
      return true;
    } else {
      // Trường hợp sai số nhiều lần dẫn đến asset k đủ để bán
      if( advice.amount - this.portfolio.asset >= 0) {
        advice.amount = this.portfolio.asset;
        return true;
      }
      log.warn(`Not enough asset to sell. asset: ${this.portfolio.asset}, Amount: ${advice.amount}`)
      return false;
    }
  }
}

PaperTrader.prototype.relayPortfolioChange = function() {
  this.deferredEmit('portfolioChange', {
    asset: this.portfolio.asset,
    currency: this.portfolio.currency
  });
}

PaperTrader.prototype.relayPortfolioValueChange = function() {
  this.deferredEmit('portfolioValueChange', {
    balance: this.getBalance()
  });
}

PaperTrader.prototype.extractFee = function(amount) {
  amount *= 1e8;
  amount *= this.fee;
  amount = Math.floor(amount);
  amount /= 1e8;
  return amount;
}

PaperTrader.prototype.setStartBalance = function() {
  this.balance = this.getBalance();
}

// after every succesfull trend ride we hopefully end up
// with more BTC than we started with, this function
// calculates Gekko's profit in %.
PaperTrader.prototype.updatePosition = function(what, amount) {

  let cost;
  // let amount;
  let amountWithFee = 0;

  // virtually trade all {currency} to {asset}
  // at the current price (minus fees)
  if(what === 'long') {
    amountWithFee = this.extractFee(amount / this.price);
    cost = (1 - this.fee) * this.portfolio.currency;
    this.portfolio.asset += amountWithFee;
    amount = amount || this.portfolio.asset;
    this.portfolio.currency = this.portfolio.currency - amount;

    this.exposed = true;
    this.trades++;
  }

  // virtually trade all {currency} to {asset}
  // at the current price (minus fees)
  else if(what === 'short') {
    amountWithFee = this.extractFee(amount * this.price);
    cost = (1 - this.fee) * (this.portfolio.asset * this.price);
    this.portfolio.currency += amountWithFee;
    amount = amount || (this.portfolio.currency / this.price);
    this.portfolio.asset = this.portfolio.asset - amount;

    this.exposed = false;
    this.trades++;
  }

  const effectivePrice = this.price * this.fee;

  return { cost, amount, effectivePrice, amountWithFee };
}

PaperTrader.prototype.getBalance = function() {
  return this.portfolio.currency + this.price * this.portfolio.asset;
}

PaperTrader.prototype.now = function() {
  return this.candle.start.clone().add(1, 'minute');
}

PaperTrader.prototype.processAdvice = function(advice) {
  if( !this.isValidAdvice(advice) ) return;
  let action;
  if(advice.recommendation === 'short') {
    action = 'sell';

    // clean up potential old stop trigger
    if(this.activeStopTrigger) {
      this.deferredEmit('triggerAborted', {
        id: this.activeStopTrigger.id,
        date: advice.date
      });

      delete this.activeStopTrigger;
    }

  } else if(advice.recommendation === 'long') {
    action = 'buy';

    if(advice.trigger) {

      // clean up potential old stop trigger
      if(this.activeStopTrigger) {
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

  this.tradeId = 'trade-' + (++this.propogatedTrades);

  this.deferredEmit('tradeInitiated', {
    id: this.tradeId,
    adviceId: advice.id,
    action,
    portfolio: _.clone(this.portfolio),
    balance: this.getBalance(),
    date: advice.date,
  });

  const { cost, amount, effectivePrice, amountWithFee } = this.updatePosition(advice.recommendation, advice.amount);

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

PaperTrader.prototype.createTrigger = function(advice) {
  const trigger = advice.trigger;

  if(trigger && trigger.type === 'trailingStop') {

    if(!trigger.trailValue) {
      return log.warn(`[Papertrader] ignoring trailing stop without trail value`);
    }

    const triggerId = 'trigger-' + (++this.propogatedTriggers);

    this.deferredEmit('triggerCreated', {
      id: triggerId,
      at: advice.date,
      type: 'trailingStop',
      proprties: {
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
  } else {
    log.warn(`[Papertrader] Gekko does not know trigger with type "${trigger.type}".. Ignoring stop.`);
  }
}

PaperTrader.prototype.onStopTrigger = function() {

  const date = this.now();

  this.deferredEmit('triggerFired', {
    id: this.activeStopTrigger.id,
    date
  });

  const { cost, amount, effectivePrice } = this.updatePosition('short');

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

PaperTrader.prototype.processCandle = function(candle, done) {
  this.price = candle.close;
  this.candle = candle;

  if(!this.balance) {
    this.setStartBalance();
    this.relayPortfolioChange();
    this.relayPortfolioValueChange();
  }

  if(this.exposed) {
    this.relayPortfolioValueChange();
  }

  if(this.activeStopTrigger) {
    this.activeStopTrigger.instance.updatePrice(this.price);
  }

  done();
}

module.exports = PaperTrader;
