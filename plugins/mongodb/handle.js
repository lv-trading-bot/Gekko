var mongojs = require('mongojs');
var mongoUtil = require('./util');

var util = require('../../core/util.js');
var config = util.getConfig();
var dirs = util.dirs();

// verify the correct dependencies are installed
var pluginHelper = require(`${dirs.core}pluginUtil`);
var pluginMock = {
  slug: 'mongodb adapter',
  dependencies: config.mongodb.dependencies
}

// exit if plugin couldn't be loaded
var cannotLoad = pluginHelper.cannotLoad(pluginMock);
if (cannotLoad) {
  util.die(cannotLoad);
}

var mode = util.gekkoMode();

var collections = [
  mongoUtil.settings.historyCollection,
  // mongoUtil.settings.adviceCollection
]

var connection = mongojs(config.mongodb.connectionString);
var collection = connection.collection(mongoUtil.settings.historyCollection);


if (mode === 'backtest') {
  collection.count({}, (err, count) => {
    if (err) util.die(err);
    if (count === 0) {
      util.die(`History table for ${mongoUtil.settings.historyCollection} is empty.`);
    }
  })
}

// if(mongoUtil.settings.exchange) {
//     collection.createIndex({start: 1, pair: 1}, {unique: true}); // create unique index on "time" and "pair"
// }
module.exports = connection;
