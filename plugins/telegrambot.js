const log = require('../core/log');
const moment = require('moment');
const _ = require('lodash');
const config = require('../core/util').getConfig();
const telegrambot = config.telegrambot;
const emitTrades = telegrambot.emitTrades;
const utc = moment.utc;
const fs = require('fs');
const telegram = require("node-telegram-bot-api");

const Actor = function() {
  _.bindAll(this);

  this.advice = null;
  this.adviceTime = utc();

  this.price = 'Dont know yet :(';
  this.priceTime = utc();

  this.commands = {
    '/start': 'emitStart',
    '/advice': 'emitAdvice',
    '/subscribe': 'emitSubscribe',
    '/unsubscribe': 'emitUnSubscribe',
    '/price': 'emitPrice',
    '/help': 'emitHelp'
  };
  if (telegrambot.donate) {
    this.commands['/donate'] = 'emitDonate';
  }
  this.rawCommands = _.keys(this.commands);
  this.chatId = null;
  this.subscribers = [];
  if(!_.isEmpty(telegrambot.defaultSubcribes)) {
    this.subscribers = this.subscribers.concat(telegrambot.defaultSubcribes);
  }
  this.bot = new telegram(telegrambot.token, { polling: true });
  this.bot.onText(/(.+)/, this.verifyQuestion);

  this.name = "unknown_yet";
  setTimeout(() => {
    let id = "unknown";
    try {
      id = JSON.parse((fs.readFileSync('./save_info/' + '/idOfManager.json'))).id;      
    } catch (error) {
      log.error(error);
    }
    this.name = `${config.watch.asset}_${config.watch.currency}_${id}`;
  }, 60*1000);
};

Actor.prototype.processCandle = function(candle, done) {
  this.price = candle.close;
  this.priceTime = candle.start;

  done();
};

Actor.prototype.processAdvice = function(advice) {
  if (advice.recommendation === 'soft') return;
  this.advice = advice.recommendation;
  this.adviceTime = utc();
  this.advicePrice = this.price;
  this.subscribers.forEach(this.emitAdvice, this);
};

if(emitTrades) {
  Actor.prototype.processTradeInitiated = function (tradeInitiated) {
    var message = 'Trade initiated. ID: ' + tradeInitiated.id +
    '\nAction: ' + tradeInitiated.action + '\nPortfolio: ' +
    JSON.stringify(tradeInitiated.portfolio) + '\nBalance: ' + tradeInitiated.balance;
    for (let i = 0; i < this.subscribers.length; i++) {
      this.bot.sendMessage(this.subscribers[i], this.name + "\n" + message);
    }
  }
  
  Actor.prototype.processTradeCancelled = function (tradeCancelled) {
    var message = 'Trade cancelled. ID: ' + tradeCancelled.id;
    for (let i = 0; i < this.subscribers.length; i++) {
      this.bot.sendMessage(this.subscribers[i], this.name + "\n" + message);
    }
  }
  
  Actor.prototype.processTradeAborted = function (tradeAborted) {
    var message = 'Trade aborted. ID: ' + tradeAborted.id +
    '\nNot creating order! Reason: ' + tradeAborted.reason;
    for (let i = 0; i < this.subscribers.length; i++) {
      this.bot.sendMessage(this.subscribers[i], this.name + "\n" + message);
    }
  }
  
  Actor.prototype.processTradeErrored = function (tradeErrored) {
    var message = 'Trade errored. ID: ' + tradeErrored.id +
    '\nReason: ' + tradeErrored.reason;
    for (let i = 0; i < this.subscribers.length; i++) {
      this.bot.sendMessage(this.subscribers[i], this.name + "\n" + message);
    }
  }
  
  Actor.prototype.processTradeCompleted = function (tradeCompleted) {
    var message = 'Trade completed. ID: ' + tradeCompleted.id + 
    '\nAction: ' + tradeCompleted.action +
    '\nPrice: ' + tradeCompleted.price +
    '\nAmount: ' + tradeCompleted.amount +
    '\nCost: ' + tradeCompleted.cost +
    '\nPortfolio: ' + JSON.stringify(tradeCompleted.portfolio) +
    '\nBalance: ' + tradeCompleted.balance +
    '\nFee percent: ' + tradeCompleted.feePercent +
    '\nEffective price: ' + tradeCompleted.effectivePrice;
    for (let i = 0; i < this.subscribers.length; i++) {
      this.bot.sendMessage(this.subscribers[i], this.name + "\n" + message);
    } 
  }
}

Actor.prototype.processTriggerFired = function(trigger) {
  this.subscribers.forEach(chatId => {
    this.emitTrigger(chatId, "Trigger Fired", trigger);
  })
}

Actor.prototype.processTriggerCreated = function(trigger) {
  this.subscribers.forEach(chatId => {
    this.emitTrigger(chatId, "Trigger Created", trigger);
  })
}

Actor.prototype.processTriggerUpdated = function(trigger) {
  this.subscribers.forEach(chatId => {
    this.emitTrigger(chatId, "Trigger Update", trigger);
  })
}

Actor.prototype.verifyQuestion = function(msg, text) {
  this.chatId = msg.chat.id;
  if (text[1].toLowerCase() in this.commands) {
    this[this.commands[text[1].toLowerCase()]]();
  } else {
    this.emitHelp();
  }
};

Actor.prototype.emitStart = function() {
  this.bot.sendMessage(this.chatId, this.name + "\n" + 'Hello! How can I help you?');
};

Actor.prototype.emitSubscribe = function() {
  if (this.subscribers.indexOf(this.chatId) === -1) {
    this.subscribers.push(this.chatId);
    this.bot.sendMessage(this.chatId, this.name + "\n" + `Success! Got ${this.subscribers.length} subscribers.`);
  } else {
    this.bot.sendMessage(this.chatId, this.name + "\n" + "You are already subscribed.");
  }
};

Actor.prototype.emitUnSubscribe = function() {
  if (this.subscribers.indexOf(this.chatId) > -1) {
    this.subscribers.splice(this.subscribers.indexOf(this.chatId), 1);
    this.bot.sendMessage(this.chatId, this.name + "\n" + "Success!");
  } else {
    this.bot.sendMessage(this.chatId, this.name + "\n" + "You are not subscribed.");
  }
};

Actor.prototype.emitAdvice = function(chatId) {
  let message = [
    'Advice for ',
    config.watch.exchange,
    ' ',
    config.watch.currency,
    '/',
    config.watch.asset,
    ' using ',
    config.tradingAdvisor.method,
    ' at ',
    config.tradingAdvisor.candleSize,
    ' minute candles, is:\n',
  ].join('');
  if (this.advice) {
    message += this.advice +
      ' ' +
      config.watch.asset +
      ' ' +
      this.advicePrice +
      ' (' +
      this.adviceTime.fromNow() +
      ')';
  } else {
    message += 'None'
  }

  if (chatId) {
    this.bot.sendMessage(chatId, this.name + "\n" + message);
  } else {
    this.bot.sendMessage(this.chatId, this.name + "\n" + message);
  }
};

// sent price over to the last chat
Actor.prototype.emitPrice = function() {
  const message = [
    'Current price at ',
    config.watch.exchange,
    ' ',
    config.watch.currency,
    '/',
    config.watch.asset,
    ' is ',
    this.price,
    ' ',
    config.watch.currency,
    ' (from ',
    this.priceTime.fromNow(),
    ')'
  ].join('');
  this.bot.sendMessage(this.chatId, this.name + "\n" + message);
};

Actor.prototype.emitDonate = function() {
  this.bot.sendMessage(this.chatId, this.name + "\n" + telegrambot.donate);
};

Actor.prototype.emitHelp = function() {
  let message = _.reduce(
    this.rawCommands,
    function(message, command) {
      return message + ' ' + command + ',';
    },
    'Possible commands are:'
  );
  message = message.substr(0, _.size(message) - 1) + '.';
  this.bot.sendMessage(this.chatId, this.name + "\n" + message);
};

Actor.prototype.logError = function(message) {
  log.error('Telegram ERROR:', message);
};

Actor.prototype.emitTrigger = function(chatId, reason, trigger) {
  let message = [
    reason,
    '\n',
    JSON.stringify(trigger, null, 2)
  ].join('');

  if (chatId) {
    this.bot.sendMessage(chatId, this.name + "\n" + message);
  } else {
    this.bot.sendMessage(this.chatId, this.name + "\n" + message);
  }
}

module.exports = Actor;
