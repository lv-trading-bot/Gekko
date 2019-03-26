const EventEmitter = require('events');

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

    this.isLive = true;
  }

  updatePrice(price, candleStart) {
    if (!this.isLive) {
      return;
    }

    const trend = (price - this.initialPrice) * 100 / Math.abs(this.initialPrice);

    if (trend <= this.stopLoss || trend >= this.takeProfit) {
      this.trigger({
        what: trend <= this.stopLoss ? "STOPLOSS" : "TAKEPROFIT",
        meta: {
          trend,
          initialPrice: this.initialPrice,
          price: price,
        }
      });
      return;
    }
    //console.log(candleStart, this.expires, candleStart.isAfter(this.expires))
    if (candleStart.isAfter(this.expires)) {
      this.trigger({
        what: "EXPIRES",
        meta: {
          initialStart: this.initialStart,
          expires: this.expires,
          candleStart: candleStart
        }
      });
    }
  }

  trigger(debug) {
    if (!this.isLive) {
      return;
    }

    this.isLive = false;
    if (this.onTrigger) {
      this.onTrigger(this.id, this.assetAmount, debug);
    }
    this.emit('trigger', this.assetAmount);
  }
}

module.exports = DoubleStop;
