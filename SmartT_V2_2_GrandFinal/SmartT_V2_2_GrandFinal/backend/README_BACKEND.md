# SmartT V2.2 Backend + Explainable ML Evidence

## 1. Chạy ngay, không cần ML

Backend HTTP + SQLite dùng Python standard library. Nếu chưa cài scikit-learn hoặc chưa có model, hệ thống **vẫn hoạt động** bằng edge deterministic/statistical engine.

```bash
python app.py
```

Endpoint ingest:

```text
http://<laptop-ip>:8000/api/v2/ingest
```

Các API chính:

```text
GET  /api/v2/health
GET  /api/v2/latest
GET  /api/v2/history
GET  /api/v2/incidents
POST /api/v2/ingest
POST /api/v2/model/reload
POST /api/v2/incidents/feedback
```

## 2. Bật Machine Learning

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# Linux/macOS
source .venv/bin/activate
pip install -r requirements.txt
```

ML chỉ là **evidence**, không được tự bypass các hard gate về sensor quality, sloshing, stationary/ignition và mass balance.

### Model A — Global + Vehicle-Specific Isolation Forest

Học high-quality `NORMAL` telemetry để phát hiện hành vi khác thường. Nếu một xe có đủ dữ liệu, backend blend:

```text
35% fleet/global score + 65% vehicle-specific score
```

Điều này phù hợp với SmartT hơn một `theft/not-theft classifier` vì dữ liệu trộm thật rất hiếm.

### Model B — Expected Consumption Regression

`HistGradientBoostingRegressor` dự đoán expected fuel-rate từ speed/RPM/load/motion. Model chỉ train khi có target đã xác thực:

- `target_consumption_lph` do dataset cung cấp; hoặc
- OBD PID `0x5E` fuel-rate thực sự có trên telemetry.

Backend tích phân rate theo thời gian rồi tính:

```text
observed tank drop - expected consumption = unexplained fuel loss
```

Nếu không có validated target thì model **không được train**.

### Model C — Optional Sloshing Probability

Logistic Regression chỉ train khi dataset có field `label_sloshing` được curate/human-review. Không tự lấy output rule-based làm ground truth để tránh model học lại bias của chính rule engine.

## 3. Train

Mọi ingest được append vào:

```text
data/telemetry.jsonl
```

Train:

```bash
python train_models.py data/telemetry.jsonl
```

Sau đó reload không cần restart server:

```text
POST /api/v2/model/reload
```

## 4. Human-in-the-loop

Operator có thể gắn feedback cho incident:

```json
{
  "device_id": "STM32-...",
  "event_seq": 12,
  "feedback": "CONFIRMED"
}
```

Giá trị hợp lệ:

```text
CONFIRMED
FALSE_ALARM
REFUEL
MAINTENANCE
UNKNOWN
```

Các nhãn này nên được review trước khi đưa vào pipeline training sau này.

## 5. Vì sao ML nằm ở backend?

STM32 giữ deterministic edge core để vẫn phát hiện/refuse false positives khi mất Wi-Fi. Backend có storage, lịch sử, model registry và khả năng retrain nên hợp lý hơn cho learning-based evidence. Đây là kiến trúc hybrid, không phải black-box AI.
