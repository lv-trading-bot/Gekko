const EventEmitter = require('events');
const moment = require('moment');
const util = require('../../core/util');
const mode = util.gekkoMode();

/**
 * @param initialPrice
 * @param assetAmount: amount of asset to sell when triggered
 * @param stopLoss: stop-loss limit (in %), negative number
 * @param takeProfit: take-profit limit (in %), positive number
 * @param onTrigger: fn to call when triggered
 */

class DoubleStop extends EventEmitter {
  constructor({
    id,
    adviceId,
    initialStart,
    initialPrice,
    currentInitialPrice,
    assetAmount,
    stopLoss,
    takeProfit,
    expires,
    onTrigger
  }) {
    super();

    this.id = id;
    this.adviceId = adviceId;
    this.initialStart = initialStart;
    this.initialPrice = initialPrice;
    this.stopLoss = stopLoss;
    this.takeProfit = takeProfit;
    this.expires = expires;
    this.assetAmount = assetAmount;
    this.onTrigger = onTrigger;
    this.currentInitialPrice = currentInitialPrice;

    this.isLive = true;
  }

  updatePrice(candle) {
    if (!this.isLive) {
      return;
    }
    if(typeof candle === 'object') {
      // Backtest mode only
      const upTrend = (candle.high - this.currentInitialPrice) * 100 / Math.abs(this.currentInitialPrice);
      const downTrend = (candle.low - this.currentInitialPrice) * 100 / Math.abs(this.currentInitialPrice);
      //trend at close
      const trend = (candle.close - this.currentInitialPrice) * 100 / Math.abs(this.currentInitialPrice);

      if (downTrend <= this.stopLoss || upTrend >= this.takeProfit) {
        this.trigger({
          what: downTrend <= this.stopLoss ? "STOPLOSS" : "TAKEPROFIT",
          meta: {
            initialStart: this.initialStart,
            initialPrice: this.initialPrice,
            trend,
            expires: this.expires,
            assetAmount: this.assetAmount,
            exitAt: (mode === "backtest" ? candle.start.clone().utc().add(1, 'm') : moment().utc()),
            exitPrice: candle.close,
            exitCandle: candle
          },
          id: this.id
        });
        return;
      }
      
      if (moment(candle.start.clone().add(61, 's')).isAfter(this.expires)) {
        this.trigger({
          what: "EXPIRES",
          meta: {
            initialStart: this.initialStart,
            initialPrice: this.initialPrice,
            trend,
            expires: this.expires,
            assetAmount: this.assetAmount,
            exitAt: (mode === "backtest" ? candle.start.clone().utc().add(1, 'm') : moment().utc()),
            exitPrice: candle.close,
            exitCandle: candle
          },
          id: this.id
        });
      }
    } else {
      // Realtime mode only
      let price = candle;
      const upTrend = (price - this.currentInitialPrice) * 100 / Math.abs(this.currentInitialPrice);
      const downTrend = (price - this.currentInitialPrice) * 100 / Math.abs(this.currentInitialPrice);
      //trend at close
      const trend = (price - this.currentInitialPrice) * 100 / Math.abs(this.currentInitialPrice);

      if (downTrend <= this.stopLoss || upTrend >= this.takeProfit) {
        this.trigger({
          what: downTrend <= this.stopLoss ? "STOPLOSS" : "TAKEPROFIT",
          meta: {
            initialStart: this.initialStart,
            initialPrice: this.initialPrice,
            trend,
            expires: this.expires,
            assetAmount: this.assetAmount,
            exitAt: moment().utc(),
            exitPrice: candle.close,
            exitCandle: {
              start: moment().utc(),
              close: price,
            }
          },
          id: this.id
        });
        return;
      }
      if (moment().add(1, 's').utc().isAfter(this.expires)) {
        this.trigger({
          what: "EXPIRES",
          meta: {
            initialStart: this.initialStart,
            initialPrice: this.initialPrice,
            trend,
            expires: this.expires,
            assetAmount: this.assetAmount,
            exitAt: moment().utc(),
            exitPrice: candle.close,
            exitCandle: {
              start: moment().utc(),
              close: price,
            }
          },
          id: this.id
        });
      }
    }
  }

  trigger(roundTrip) {
    if (!this.isLive) {
      return;
    }

    this.isLive = false;
    if (this.onTrigger) {
      this.onTrigger({id: this.id, assetAmount: this.assetAmount, roundTrip});
    }
    this.emit('trigger', this.assetAmount);
  }
}

module.exports = DoubleStop;
