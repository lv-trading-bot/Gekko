const async = require('async');
var _ = require('lodash');
var util = require('../../core/util.js');
var log = require(`${util.dirs().core}log`);

var handle = require('./handle');

module.exports = done => {
    this.db = handle;

    let markets = [];
    async.waterfall([
        (cb) => {
            handle.getCollectionNames(cb)
        },
        (collections, cb) => {
            async.each(collections, (collectionName, cb) => {
                let [exchange, asset, currency] = collectionName.split("_");
                markets.push({
                    exchange: exchange,
                    currency: currency,
                    asset: asset
                });
                cb();
            }, () => {
                cb(null, markets)
            })
        }
    ], done)
}