const { spawn } = require('child_process');

const configName = process.env.CONFIG_NAME;
const mode = process.env.MODE;

if(!configName) {
    console.log('Canot get CONFIG_NAME from ENV');
    return;
}

console.log(`Run gekko with config ${configName}`)

let instance = null;

if(mode === 'realtime') {
    instance = spawn('node', ['gekko', '-c', configName]);
} else {
    instance = spawn('node', ['auto-backtest.js', configName]);
}

// Ở đây không được dùng log vì ở trong gekko đã lưu log vào file r, ở đây lại dùng log thì bị duplicate
instance.stdout.on('data', (data) => {
    console.log(`${data}`);
});

instance.stderr.on('data', (data) => {
    console.log(`${data}`);
});

instance.on('close', (code) => {
    console.log(`child process exited with code ${code}`);
});