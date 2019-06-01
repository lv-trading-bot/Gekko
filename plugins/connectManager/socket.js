const io = require('socket.io-client');
const log = require('../../core/log');

const type = 'system';

let socket;

// let random_id = `${(new Date()).getTime()}_${Math.random()}`;

const connect = (url, info, id) => {
    socket = io.connect(url);

    socket.on("connect", () => {
        log.info('Connect to live trading manager successfully!');
      socket.emit("onConnect", type, id, info);
    })

    socket.on('connect_error', function() {
        log.warn('Cannot connect socket to ', url);
    });
  
    // socket.on(chanel, (data) => {
    //     handler(data);
    // })
}

const disconnect = () => {
    if(socket) {
        socket.disconnect();
        socket = null;
    }
}

module.exports = {
    connect,
    disconnect
}