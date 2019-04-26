// Sàn binance
const axios = require('axios');
const base_url = "https://api.binance.com";
const api = "/api/v1/depth";
const limit = 500;

const Exchange = function (asset, currency) {
    this.asset = asset;
    this.currency = currency;
    this.pair = `${asset}${currency}`;
}

/**
 * @param {string} actions - "long" or "short",
 * @param {Number} amount - Số lượng Currency or Asset
 */
Exchange.prototype.getPrice = function (action, amount) {
    return new Promise((resolve, reject) => {
        let reqData = {
            symbol: this.pair,
            limit
        }

        axios.get(base_url + api, {
            params: reqData
        })
            .then(function (response) {
                if (action === 'long') {
                    resolve(caclBuyPrice(response.data.asks, amount));
                } else if (action === 'short') {
                    resolve(caclSellPrice(response.data.bids, amount));
                }
            })
            .catch(function (error) {
                reject(error);
            })
    })
}

/**
 * 
 * @param {Array} orders - array bids
 * @param {Number} amount - Currency
 */
const caclBuyPrice = (orders, amount) => {
    let amountBought = 0;
    let ordersBought = []; // {price, asset}
    for (let i = 0; i < orders.length; i++) {
        let curCurrency = orders[i][0] * orders[i][1];
        if (curCurrency >= (amount - amountBought)) {
            // push {price, asset}
            ordersBought.push([orders[i][0], (amount - amountBought) / orders[i][0]]);
            amountBought = amount;
            break;
        } else {
            ordersBought.push(orders[i]);
            // push {price, asset}
            amountBought += orders[i][1] * orders[i][0];
        }
    }

    let assetBought = 0;
    for (let i = 0; i < ordersBought.length; i++) {
        assetBought += parseFloat(ordersBought[i][1]);
    }
    return amount / assetBought;
}

/**
 * 
 * @param {Array} orders - array bids
 * @param {Number} amount - asset
 */
const caclSellPrice = (orders, amount) => {
    let amountBought = 0;
    let ordersBought = []; // {price, asset}
    for (let i = 0; i < orders.length; i++) {
        if (orders[i][1] >= (amount - amountBought)) {
            // push {price, asset}
            ordersBought.push([orders[i][0], (amount - amountBought)]);
            amountBought = amount;
            break;
        } else {
            // push {price, asset}
            ordersBought.push(orders[i]);
            amountBought += parseFloat(orders[i][1]);
        }
    }

    let currencyBought = 0;
    for (let i = 0; i < ordersBought.length; i++) {
        currencyBought += parseFloat(ordersBought[i][0]) * parseFloat(ordersBought[i][1]);
    }
    return currencyBought / amountBought;
}

module.exports = Exchange;