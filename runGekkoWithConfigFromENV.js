const { spawn } = require('child_process');
const log = require('./core/log');

const configName = process.env.CONFIG_NAME;
const mode = process.env.MODE;

if(!configName) {
    log.error("Canot get CONFIG_NAME from ENV");
}

log.info(`Run gekko with config ${configName}`)

let instance = null;

if(mode === 'realtime') {
    instance = spawn('node', ['gekko', '-c', configName]);
} else {
    instance = spawn('node', ['gekko', '-b', '-c', configName]);
}

// Ở đây không được dùng log vì ở trong gekko đã lưu log vào file r, ở đây lại dùng log thì bị duplicate
instance.stdout.on('data', (data) => {
    console.log(`${data}`);
});

instance.stderr.on('data', (data) => {
    console.log(`${data}`);
});

instance.on('close', (code) => {
    log.info(`child process exited with code ${code}`);
});