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

let AUTHENTICAION_TOKEN = process.env.AUTHENTICAION_TOKEN;

axios.defaults.headers.common['Authorization'] = AUTHENTICAION_TOKEN;

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

const connectSocket = (id, asset, currency) => {
  // Connect socket
  let containerName = process.env.E_IGNITER;
  socket.connect(baseApi, {
    name: "Gekko", 
    id,
    asset,
    currency,
    containerName
  }, id)
}

var Actor = function () {
  this.price = false;
  let localId = loadId();
  this.isNew = !localId;
  axios.post(initApi, { config, asset: watch.asset, currency: watch.currency, id: localId })
    .then(res => {
      this.id = localId ? localId : res.data.id;
      saveId(this.id);
      log.info(this.id);
      connectSocket(this.id, watch.asset, watch.currency);
    })
    .catch(err => {
      if (err.response) {
        log.warn(err.response.data);
      }
      log.warn(err);
      this.id = localId ? localId : `canot_get_id_${(new Date()).getTime()}_${Math.floor(Math.random() * 1000)}`;
      saveId(this.id);
      connectSocket(this.id, watch.asset, watch.currency);
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
        price: this.price,
        last_update: moment().utc()
      },
      "is_new": this.isNew
    })
      .then(res => {

      })
      .catch(err => {
        if (err.response) {
          log.warn(err.response.data);
        }
        log.warn(err);
      })
    this.isNew = false;
  }
  this.lastPortfolio = portfolio;
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
  if(this.lastPortfolio) {
    this.processPortfolioChange(this.lastPortfolio);
  }
  done();
}

module.exports = Actor;
