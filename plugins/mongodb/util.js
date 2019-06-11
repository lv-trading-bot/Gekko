var config = require('../../core/util.js').getConfig();

var watch = config.watch;

watch = {
  exchange: watch.exchange.toLowerCase(),
  currency: watch.currency.toUpperCase(),
  asset: watch.asset.toUpperCase()
}

var settings = {
  exchange: watch.exchange,
  pair: [watch.currency, watch.asset],
  historyCollection: `${watch.exchange}_${watch.asset}_${watch.currency}`,
  // adviceCollection: `${exchangeLowerCase}_advices`
};

module.exports = {
  settings
};
