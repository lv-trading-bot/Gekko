const EventEmitter = require('events');
const moment = require('moment');

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
            exitPrice: candle.close,
            exitCandle: candle
          },
          id: this.id
        });
        return;
      }
      //console.log(candle, this.expires, candle.isAfter(this.expires))
      if (moment(candle.start).isAfter(this.expires)) {
        this.trigger({
          what: "EXPIRES",
          meta: {
            initialStart: this.initialStart,
            initialPrice: this.initialPrice,
            trend,
            expires: this.expires,
            exitPrice: candle.close,
            exitCandle: candle
          },
          id: this.id
        });
      }
    } else {
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
            exitPrice: candle.close,
            exitCandle: candle
          },
          id: this.id
        });
        return;
      }
      //console.log(candle, this.expires, candle.isAfter(this.expires))
      if (moment().utc().isAfter(this.expires)) {
        this.trigger({
          what: "EXPIRES",
          meta: {
            initialStart: this.initialStart,
            initialPrice: this.initialPrice,
            trend,
            expires: this.expires,
            exitPrice: candle.close,
            exitCandle: candle
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
