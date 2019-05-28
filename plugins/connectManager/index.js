const log = require('../../core/log');
var moment = require('moment');
var fs = require('fs');
var _ = require('lodash');
var util = require('../../core/util');
var config = util.getConfig();
let watch = config.watch;
var connectManagerConfig = config.connectManager;
let baseApi = connectManagerConfig.baseApi;
let axios = require('axios');
let socket = require('./socket');

let initApi = baseApi + connectManagerConfig.init,
  reconnectApi = baseApi + connectManagerConfig.reconnect,
  triggerApi = baseApi + connectManagerConfig.trigger,
  tradeApi = baseApi + connectManagerConfig.trade,
  portfolioApi = baseApi + connectManagerConfig.portfolio;

const saveId = (id) => {
  fs.writeFileSync('./save_info/' + '/idOfManager.json', JSON.stringify({ id }));
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

const connectSocket = (id) => {
  // Connect socket
  socket.connect(baseApi, {
    name: "Gekko", 
    id
  })
}

var Actor = function () {
  this.price = false;
  let localId = loadId();
  axios.post(initApi, { config, asset: watch.asset, currency: watch.currency, id: localId })
    .then(res => {
      this.id = localId ? localId : res.data.id;
      saveId(this.id);
      log.info(this.id);
      connectSocket(this.id);
    })
    .catch(err => {
      if (err.response) {
        log.warn(err.response.data);
      }
      log.warn(err);
      this.id = localId ? localId : `canot_get_id_${(new Date()).getTime()}_${Math.floor(Math.random() * 1000)}`;
      saveId(this.id);
      connectSocket(this.id);
    })

  _.bindAll(this);
}

Actor.prototype.processPortfolioChange = function (portfolio) {
  if (this.id) {
    axios.put(portfolioApi, {
      "id": this.id,
      "asset": watch.asset,
      "currency": watch.currency,
      "portfolio": {
        ...portfolio,
        price: this.price
      }
    })
      .then(res => {

      })
      .catch(err => {
        if (err.response) {
          log.warn(err.response.data);
        }
        log.warn(err);
      })
  }
};

Actor.prototype.processTradeCompleted = function (trade) {
  // 
  if (this.id) {
    axios.post(tradeApi, {
      "id": this.id,
      "asset": watch.asset,
      "currency": watch.currency,
      "trade": trade
    })
      .then(res => {

      })
      .catch(err => {
        if (err.response) {
          log.warn(err.response.data);
        }
        log.warn(err);
      })
  }

}

Actor.prototype.processTriggerCreated = function (trigger) {
  // console.log('processTriggerCreated change PM', trigger);
  if (this.id) {
    axios.post(triggerApi, {
      "id": this.id,
      "asset": watch.asset,
      "currency": watch.currency,
      "trigger": trigger
    })
      .then(res => {

      })
      .catch(err => {
        if (err.response) {
          log.warn(err.response.data);
        }
        log.warn(err);
      })
  }

}

Actor.prototype.processTriggerUpdated = function (trigger) {
  // console.log('processTriggerUpdated change PM', trigger);
  if (this.id) {
    axios.put(triggerApi, {
      "id": this.id,
      "asset": watch.asset,
      "currency": watch.currency,
      "trigger": trigger,
      "trigger_id": trigger.id
    })
      .then(res => {

      })
      .catch(err => {
        if (err.response) {
          log.warn(err.response.data);
        }
        log.warn(err);
      })
  }
}

Actor.prototype.processTriggerFired = function (trigger) {
  // console.log('processTriggerFired change PM', trigger);
  this.processTriggerUpdated(trigger);
}

Actor.prototype.processTriggerAborted = function (trigger) {
  // console.log('processTriggerAborted change PM', trigger);
  this.processTriggerUpdated(trigger);
}

Actor.prototype.processTriggerWasRestore = function (triggers) {
  // console.log('processTriggerWasRestore change PM', triggers);
}

Actor.prototype.processCandle = function (candle, done) {
  this.price = candle.close;
  done();
}

module.exports = Actor;
