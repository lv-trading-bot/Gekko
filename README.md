# Gekko

## Các việc cần làm trước khi chạy
- Xóa nội dung thư mục `save_info` (không xóa file .gitignore) nếu chạy mới
- Xóa nội dung thư mục `logs` (không xóa file .gitignore) nếu chạy mới

## Các biến môi trường cần cung cấp trước khi chạy
- `LIVE_TRADE_MANAGER_BASE_API`: Địa chỉ của live manager
- `AUTHENTICATION_TOKEN`: Token để gọi api

## Nếu chạy gekko thông qua file `runGekkoWithConfigFromENV.js` thì bổ sung thêm biến môi trường
- MODE: `realtime` || `backtest`
- CONFIG_NAME: tên của config file

## Chạy paper trading
- Sửa file `tin-config-paper-trading.js`
    - Sửa candle size
    - Sửa strategy
- `node gekko -c tin-config-paper-trading.js`

## Chạy live trading
- Sửa file `tin-config-live-trading.js`
    - Sửa candle size
    - Sửa strategy
- `node gekko -c tin-config-live-trading.js`
