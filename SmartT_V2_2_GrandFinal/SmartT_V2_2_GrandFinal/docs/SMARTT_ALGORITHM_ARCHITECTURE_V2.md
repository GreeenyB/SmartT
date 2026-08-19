# SmartT Algorithm Architecture V2
## Explainable Hybrid Fuel Intelligence Engine

> **Mục tiêu tài liệu**  
> Tài liệu này xác định kiến trúc thuật toán mục tiêu cho SmartT sau khi tích hợp cảm biến siêu âm, CAN/OBD, MPU6050 và backend phân tích nâng cao. Nó **không đồng nhất “đã có trong code” với “định hướng sẽ triển khai”**. Mọi thành phần đều được gắn trạng thái để tránh overclaim khi viết báo cáo hoặc phản biện.
>
> **Triết lý cốt lõi**  
> SmartT không cố biến mọi thứ thành AI. Phần nào có quy luật vật lý rõ ràng thì dùng mô hình vật lý; phần nào cần memory/state thì dùng state machine; phần nào cần phát hiện thay đổi thì dùng thống kê; phần nào khó đặt ngưỡng cố định thì dùng machine learning. Quyết định cuối cùng luôn phải giải thích được.

---

# 0. Trạng thái triển khai

Ký hiệu dùng xuyên suốt tài liệu:

- **[CURRENT]**: đã tồn tại trong logic/source hiện tại.
- **[NEXT]**: nên triển khai ngay trong bản Grand Final.
- **[ADVANCED]**: nâng cấp mạnh sau khi pipeline cơ bản đã ổn.
- **[OPTIONAL]**: chỉ bật khi có dữ liệu hoặc phần cứng tương ứng.

## 0.1. Những gì đã có

Logic hiện tại đã có một nền tảng tốt:

```text
sensor acquisition
→ calibration
→ median filtering
→ EMA filtering
→ fuel rate
→ stability / sloshing features
→ vehicle context
→ finite-state event detection
→ candidate / confirmation / hysteresis
→ confidence score
→ telemetry
→ local backend + SQLite + dashboard
```

Các event/state hiện có gồm:

```text
NORMAL
OFF_SETTLING
PARKED_MONITORING
SLOSHING
DROP_CANDIDATE
THEFT_ALERT
REFUEL_CANDIDATE
SENSOR_FAULT
```

Đây là **deterministic rule-based engine**, chưa phải machine learning.

## 0.2. Những gì V2 sẽ bổ sung

```text
Ultrasonic fuel measurement
CAN/OBD vehicle context
MPU6050 motion / tilt context
Sensor quality scoring
Nonlinear tank calibration
Mode-aware adaptive filtering
Multi-scale feature extraction
Change-point detection
Expected fuel-consumption model
Residual / mass-balance reasoning
Vehicle-specific anomaly detection
Explainable evidence fusion
Incident lifecycle + reliable delivery
Model drift / personalization
```

---

# 1. Kiến trúc tổng thể đề xuất

```text
                       ┌──────────────────────────────┐
                       │       VEHICLE / SENSOR       │
                       │                              │
                       │ Ultrasonic fuel level        │
                       │ CAN/OBD telemetry            │
                       │ MPU6050 acceleration/tilt    │
                       │ GPS / ignition               │
                       │ Optional direct flow meter   │
                       └──────────────┬───────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 1. ACQUISITION & DATA QUALITY                                      │
│ timestamp • freshness • range check • missing data • sensor health │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. PHYSICAL NORMALIZATION                                           │
│ ultrasonic distance → fuel height → volume                          │
│ CAN raw values → physical units                                     │
│ IMU raw values → acceleration / tilt / motion energy                │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. SIGNAL CONDITIONING                                              │
│ spike rejection → median/Hampel → adaptive Kalman/EMA              │
│ synchronization → resampling → quality-weighted fusion             │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. FEATURE ENGINE                                                   │
│ Δfuel • rate • acceleration • variance • slope • oscillation        │
│ motion • tilt • RPM • speed • ignition • expected consumption       │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. CONTEXT ENGINE                                                   │
│ parked • moving • idle • rough road • turning • tilted • refueling │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
             ┌──────────────────┼───────────────────┐
             ▼                  ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌────────────────────────┐
│ Physics / Rules  │ │ Statistics       │ │ Machine Learning       │
│ mass balance     │ │ change-point     │ │ normal-behavior model  │
│ hard constraints │ │ residual trends  │ │ anomaly score          │
└────────┬─────────┘ └────────┬─────────┘ └───────────┬────────────┘
         └─────────────────────┼───────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 6. EXPLAINABLE EVIDENCE FUSION                                     │
│ rule evidence + statistical evidence + ML evidence + sensor quality │
└───────────────────────────────┬─────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 7. EVENT ENGINE                                                     │
│ candidate → confirmed → active → resolved                           │
│ normal / slosh / refuel / theft / leak / sensor fault              │
└───────────────────────────────┬─────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 8. EXPLAINABLE OUTPUT                                               │
│ event • confidence • reasons • evidence • trace • incident_id       │
└───────────────────────────────┬─────────────────────────────────────┘
                                ▼
                    Backend / Dashboard / Alert
```

---

# 2. Nguyên tắc thiết kế quan trọng

## 2.1. Không để một cảm biến quyết định tất cả

Fuel theft không được kết luận chỉ vì:

```text
fuel_level < threshold
```

Mà phải là:

```text
fuel loss
+ persistence
+ vehicle context
+ motion context
+ sloshing likelihood
+ expected consumption
+ sensor quality
+ statistical anomaly
+ optional ML anomaly
```

## 2.2. ML không được quyền phá các ràng buộc vật lý

Ví dụ:

```text
ML anomaly = 0.95
GPS/CAN xác nhận xe đang chạy
fuel đang dao động mạnh theo IMU
```

Không nên nhảy thẳng sang `THEFT_ALERT`.

ML chỉ là **một nguồn evidence**, không phải “oracle”.

## 2.3. Mọi event quan trọng phải trả lời được “Why?”

Ví dụ output:

```json
{
  "event": "SUSPICIOUS_FUEL_LOSS",
  "confidence": 94,
  "why": [
    "Fuel decreased 8.7 L from parked baseline",
    "Vehicle stationary for 184 s",
    "Ignition OFF",
    "Low motion energy",
    "Low sloshing probability",
    "Expected consumption 0.2 L",
    "Unexplained loss 8.5 L",
    "ML anomaly score 0.91"
  ]
}
```

Đây là điểm tạo ra khác biệt: **Explainable Fuel Intelligence**, không chỉ anomaly detection.

---

# 3. Data contract thống nhất

Backend nên chuẩn hóa tất cả nguồn về cùng một telemetry frame.

```json
{
  "schema_version": 2,
  "device_id": "smartt-esp32-001",
  "vehicle_id": "TRUCK_01",
  "boot_id": "20260819-A7F2",
  "sample_seq": 123456,
  "device_uptime_ms": 456789,

  "fuel": {
    "source": "ULTRASONIC",
    "distance_mm_raw": 371,
    "height_mm": 429,
    "volume_l_raw": 91.8,
    "volume_l_filtered": 92.4,
    "percent_filtered": 51.3,
    "rate_lps": -0.04,
    "quality": 0.94
  },

  "vehicle": {
    "ignition": false,
    "speed_kmh": 0.0,
    "rpm": 0,
    "engine_load_pct": 0.0,
    "fuel_rate_lph": null
  },

  "motion": {
    "ax": 0.02,
    "ay": -0.01,
    "az": 0.99,
    "roll_deg": 0.8,
    "pitch_deg": -0.3,
    "motion_energy": 0.04
  },

  "context": {
    "mode": "PARKED_STABLE",
    "slosh_probability": 0.07
  }
}
```

Không bắt buộc gửi tất cả field ngay từ phiên bản đầu. Schema phải cho phép `null`.

---

# 4. Pipeline cảm biến siêu âm

## 4.1. Vai trò

Cảm biến siêu âm trở thành một nguồn trực tiếp cho:

```text
distance
→ fuel height
→ tank volume
→ filtered fuel volume
→ fuel rate
→ event analysis
```

Với prototype hiện tại, cảm biến siêu âm nên được xem là một **fuel-level source có thể thay thế**, không hard-code toàn bộ backend vào một model sensor duy nhất.

Interface nên là:

```text
FuelLevelSource
├── ULTRASONIC
├── ANALOG_SENDER
├── CAN_REPORTED
└── FUTURE_EXTERNAL_TANK_SENSOR
```

## 4.2. Kiểm tra frame

**[NEXT]**

Mỗi frame phải được kiểm tra:

```text
frame valid?
distance in physical range?
timestamp fresh?
distance jump physically plausible?
sensor timeout?
repeated identical frame too long?
```

Không cho một frame lỗi đi trực tiếp vào event engine.

## 4.3. Đổi khoảng cách thành chiều cao nhiên liệu

Nếu sensor đặt trên đỉnh bồn demo:

```text
fuel_height = tank_internal_height - measured_distance - installation_offset
```

Clamp:

```text
0 <= fuel_height <= tank_internal_height
```

`installation_offset` phải được calibration thực tế vì mặt sensor có dead-zone và vị trí cơ khí không trùng hoàn toàn với mốc zero của tank.

## 4.4. Đổi chiều cao thành thể tích

Không nên dùng:

```text
volume = height_percent × tank_capacity
```

cho mọi bình.

Đề xuất:

**[NEXT] Piecewise Linear Tank Calibration**

```text
height_mm → volume_liters
```

Ví dụ:

| Height | Volume |
|---:|---:|
| 0 mm | 0 L |
| 80 mm | 12 L |
| 160 mm | 29 L |
| 240 mm | 49 L |
| 320 mm | 72 L |
| 400 mm | 100 L |

Backend nội suy tuyến tính giữa hai điểm gần nhất.

Ưu điểm:

- phù hợp bình không vuông;
- dễ calibration;
- giải thích được;
- không cần ML cho hình học tank.

## 4.5. Ultrasonic Quality Score

**[NEXT]**

Mỗi sample nên có:

```text
Q_sensor ∈ [0,1]
```

Ví dụ:

```text
Q_sensor =
  freshness_score
× range_validity
× spike_consistency
× echo_consistency
× installation_health
```

Một frame có quality thấp không bị bỏ hoàn toàn; nó được **giảm trọng số** trong filter/fusion.

## 4.6. Spike rejection

Trước Kalman/EMA nên có một lớp loại spike.

Khuyến nghị:

```text
Hampel filter
hoặc
median 5 samples
```

Hampel phù hợp hơn khi muốn phát hiện outlier theo median absolute deviation:

```text
MAD = median(|x_i - median(x)|)
```

Nếu sample lệch quá nhiều MAD thì coi là outlier.

Prototype đơn giản có thể tiếp tục median-5.

---

# 5. Mode-Aware Adaptive Kalman Filter

Đây là một nâng cấp rất đáng làm vì nó vừa có chiều sâu kỹ thuật vừa liên kết trực tiếp với Sensor Fusion.

## 5.1. Mục tiêu

Kalman không chỉ “làm mượt”.

Nó phải ước lượng:

```text
true fuel volume
true fuel change rate
```

từ measurement bị nhiễu.

State:

```text
x_t = [V_t, dV_t/dt]^T
```

Measurement:

```text
z_t = V_ultrasonic
```

Prediction cơ bản:

```text
V_t = V_(t-1) + rate_(t-1) * dt
```

Nếu CAN có estimated fuel consumption:

```text
V_predicted =
V_previous
- estimated_consumption
+ detected_refuel_input
```

## 5.2. Điểm khác biệt: R và Q thay đổi theo context

Kalman thường dùng noise cố định.

SmartT nên dùng:

**Mode-Aware Adaptive Kalman**

### Xe parked, IMU ổn định

```text
measurement noise R ↓
→ tin fuel sensor nhiều hơn
```

### Xe rung / rough road / turning

```text
R ↑
→ tin ultrasonic measurement ít hơn
```

### Refuel candidate

```text
process noise Q ↑
→ cho phép true fuel level thay đổi nhanh
```

### Normal engine consumption

```text
Q thấp-vừa
→ ưu tiên đường giảm chậm, liên tục
```

### Sensor quality thấp

```text
R ↑ theo 1 / Q_sensor
```

Ví dụ:

```text
R_t = R_base
      × (1 + k1 * motion_energy)
      × (1 + k2 * slosh_score)
      × (1 + k3 * (1 - sensor_quality))
```

Đây là sensor fusion theo nghĩa thực sự: **motion không nhất thiết trực tiếp đo nhiên liệu; nó điều chỉnh mức độ SmartT tin vào measurement nhiên liệu.**

---

# 6. MPU6050 Motion Intelligence

## 6.1. Không dùng MPU chỉ để “biết xe rung”

MPU nên sinh ra feature hữu ích:

```text
acceleration magnitude
jerk
roll
pitch
tilt magnitude
short-term vibration RMS
motion energy
directional change
```

## 6.2. Motion Energy

Ví dụ:

```text
a_dyn = sqrt(ax² + ay² + az²) - 1g
motion_energy = RMS(a_dyn, window)
```

## 6.3. Sloshing prior

Nếu:

```text
motion_energy cao
AND fuel oscillation tăng
```

thì prior cho sloshing tăng.

Nếu:

```text
motion_energy thấp
AND vehicle stationary
AND fuel giảm một chiều
```

thì khả năng fuel-loss event tăng.

## 6.4. Tilt compensation

Khi tank nghiêng:

```text
same volume ≠ same measured height
```

Ở prototype có thể chỉ dùng tilt để **giảm confidence** hoặc tăng measurement noise.

Về sau nếu có tank geometry:

```text
volume = f(height, roll, pitch)
```

---

# 7. CAN / OBD Vehicle Context

## 7.1. Các signal hữu ích

Tuỳ xe hỗ trợ:

```text
vehicle speed
engine RPM
engine load
throttle
coolant temperature
fuel rate
fuel level reported by ECU
ignition / engine state
odometer / distance
```

Không được giả định mọi xe đều có mọi PID.

## 7.2. CAN quality

Mỗi signal cũng cần:

```text
freshness
availability
plausibility
source confidence
```

## 7.3. ConsumptionSource abstraction

```text
FuelConsumptionSource =
    CAN_ESTIMATED
  | FLOW_MEASURED
  | MODEL_ESTIMATED
  | UNKNOWN
```

Nếu sau này có hai flow meter supply/return:

```text
consumption_measured = Q_supply - Q_return
```

Còn hiện tại nếu lấy từ CAN:

```text
consumption_estimated = integrate(CAN_fuel_rate)
```

Hai khái niệm phải được phân biệt rõ.

---

# 8. Đồng bộ thời gian và resampling

Các sensor không gửi data cùng tần số.

Backend cần:

```text
canonical interval = 250 ms / 500 ms / 1 s
```

Tuỳ mode.

Mỗi frame được align theo timestamp.

Quy tắc:

```text
fresh sample → use
short missing gap → hold/interpolate cautiously
long gap → mark unavailable
```

Không nên interpolate event-sensitive data qua khoảng mất dữ liệu dài.

---

# 9. Multi-Scale Feature Engine

Một điểm yếu của rule đơn giản là chỉ nhìn một window.

V2 nên tính feature ở nhiều scale:

```text
2.5 s
10 s
30 s
2 min
5 min
```

## 9.1. Fuel features

```text
level
delta
slope
EMA slope
cumulative drop
range
variance
MAD
mean abs step
direction changes
monotonicity
recovery ratio
oscillation energy
```

## 9.2. Motion features

```text
motion RMS
jerk
roll/pitch variance
stationary duration
rough-road score
```

## 9.3. Vehicle features

```text
speed mean/max
RPM mean
idle duration
engine state
distance traveled
fuel rate
engine load
```

## 9.4. Cross-sensor features

Đây là nhóm đặc trưng quan trọng nhất:

```text
fuel oscillation × motion energy
fuel drop × stationary duration
fuel drop × ignition OFF
fuel rate residual
measured drop - expected consumption
ultrasonic disagreement with CAN fuel level
```

Machine learning nên học từ **cross-sensor relationships**, không chỉ raw fuel.

---

# 10. Context Engine

Trước khi detect event, SmartT nên biết xe đang ở mode gì.

Context:

```text
PARKED_STABLE
PARKED_UNSTABLE
ENGINE_IDLE
MOVING_SMOOTH
MOVING_ROUGH
TURNING/BRAKING
TILTED
REFUEL_CONTEXT
UNKNOWN
```

Context được suy ra từ:

```text
ignition
speed
RPM
MPU
GPS
fuel behavior
```

Ví dụ:

```text
ignition OFF
speed = 0
motion_energy thấp
for > 10 s
→ PARKED_STABLE
```

Event thresholds và filter parameters được chọn theo context.

---

# 11. Expected Fuel Consumption Model

Đây là một trong những nâng cấp quan trọng nhất vì nó chuyển câu hỏi từ:

> “Fuel có giảm không?”

sang:

> “Fuel giảm này có được hoạt động của xe giải thích hay không?”

## 11.1. Trường hợp CAN có fuel-rate

```text
expected_consumption =
∫ fuel_rate_lph dt
```

## 11.2. Không có fuel-rate

**[ADVANCED]**

Dùng regression:

```text
input:
RPM
speed
engine load
throttle
idle state
acceleration
road context

output:
expected fuel consumption
```

Model phù hợp:

```text
Gradient Boosted Trees
Random Forest
small neural network (chỉ khi data đủ)
```

Ở giai đoạn đầu, ưu tiên Gradient Boosted Trees vì:

- data tabular;
- không cần dataset khổng lồ;
- explainable hơn deep learning;
- inference nhanh;
- feature importance rõ.

## 11.3. Personalized model

Mỗi vehicle có baseline riêng:

```text
vehicle model
+ fleet/global fallback
```

Nếu xe mới chưa đủ data:

```text
use global model
→ gradually personalize
```

---

# 12. Fuel Residual / Mass-Balance Engine

Đây là một hướng khác biệt rất logic.

Định nghĩa:

```text
ΔV_tank = observed tank change
C_engine = expected engine consumption
R = unexplained fuel change
```

Theo dấu:

```text
unexplained_loss =
observed_fuel_drop - expected_consumption
```

Ví dụ:

```text
tank giảm:              8.7 L
engine consumption:     0.4 L
--------------------------------
unexplained loss:       8.3 L
```

Nếu xe parked + engine off:

```text
expected_consumption ≈ 0
```

nên unexplained loss gần bằng tank drop.

Nếu xe đang chạy:

```text
tank drop 5 L
expected consumption 4.7 L
residual 0.3 L
→ normal
```

Đây là cách tách **fuel consumption** khỏi **fuel disappearance**.

---

# 13. Innovation / Residual Gating

Không nên alert theo một residual đơn lẻ.

Cần:

```text
residual magnitude
residual duration
residual direction
sensor quality
vehicle context
```

Ví dụ:

```text
if residual_loss > threshold
AND persists > T
AND quality > Q_min
→ residual anomaly evidence
```

Có thể chuẩn hoá:

```text
innovation_z =
(measured - predicted)
/
sqrt(prediction_variance + measurement_variance)
```

Nếu `|innovation_z|` lớn liên tục thì model và measurement đang bất đồng đáng kể.

---

# 14. Change-Point Detection

Một vụ rút nhiên liệu chậm có thể không vượt `rate <= -0.55 %/s`.

Do đó cần detect **thay đổi regime**.

## 14.1. CUSUM

**[NEXT]**

Đơn giản, nhẹ, rất phù hợp.

```text
S_t = max(0, S_(t-1) + residual_t - drift)
```

Nếu:

```text
S_t > threshold
```

→ change-point candidate.

Ưu điểm:

- bắt drift nhỏ nhưng kéo dài;
- không cần ML;
- explainable;
- chạy được cả edge/backend.

## 14.2. Page-Hinkley

Có thể dùng cho mean shift dài hạn.

## 14.3. Bayesian Online Change Point Detection

**[OPTIONAL / RESEARCH]**

Rất hay về học thuật nhưng chưa cần cho Grand Final nếu CUSUM đã đủ.

Không nên nhồi thuật toán chỉ để có keyword.

---

# 15. Sloshing Intelligence V2

Hiện SmartT đã suy ra sloshing từ waveform fuel.

V2 nên dùng 3 nguồn:

```text
Fuel oscillation
+ MPU motion
+ Vehicle motion
```

## 15.1. Deterministic Slosh Score

Ví dụ:

```text
S_fuel   = normalized oscillation score
S_motion = normalized IMU energy
S_drive  = turning/braking/rough-road evidence
```

```text
slosh_score =
0.50*S_fuel
+0.30*S_motion
+0.20*S_drive
```

Weights chỉ là khởi tạo, cần tune theo test.

## 15.2. Slosh probability model

Sau khi có dataset:

```text
P(sloshing | features)
```

Model phù hợp:

```text
Logistic Regression
Gradient Boosted Trees
```

Không cần CNN/LSTM nếu input chủ yếu là engineered time-window features.

---

# 16. Machine Learning Architecture

## 16.1. ML nên giải quyết bài toán nào?

Không nên bắt đầu bằng:

```text
theft classifier
```

vì dataset theft thật sẽ ít.

Khuyến nghị:

### ML-A — Normal Behavior Anomaly Detection

Học:

```text
“xe này bình thường trông như thế nào?”
```

Sau đó detect:

```text
“điều gì đang khác thường?”
```

### ML-B — Expected Consumption Regression

Dự đoán fuel consumption theo context vận hành.

### ML-C — Sloshing Probability

Phân loại sloshing dựa trên multi-sensor features.

Ba model này có ý nghĩa rõ ràng và bổ trợ nhau.

---

# 17. ML-A — Vehicle-Specific Anomaly Detection

## 17.1. Feature input

```text
fuel_rate
fuel_delta_10s
fuel_delta_60s
cumulative_drop
monotonicity
fuel_variance
slosh_score
motion_energy
roll/pitch variance
speed
RPM
engine_load
ignition
expected_consumption
fuel_residual
sensor_quality
context_mode
```

## 17.2. Model giai đoạn đầu

Khuyến nghị:

**Isolation Forest**

Lý do:

- học chủ yếu từ normal data;
- không cần theft labels lớn;
- phù hợp tabular features;
- inference nhanh;
- dễ triển khai backend.

Output:

```text
ml_anomaly_score ∈ [0,1]
```

## 17.3. Không dùng raw score trực tiếp làm confidence

Phải calibration:

```text
raw anomaly score
→ percentile / calibrated anomaly probability
```

Ví dụ:

```text
0.95 percentile anomaly
```

có ý nghĩa hơn một con số raw không chuẩn hoá.

## 17.4. Global + per-vehicle model

```text
if vehicle_samples < N_min:
    use global fleet model
else:
    blend(global_model, vehicle_model)
```

Ví dụ:

```text
score =
(1-w)*global_score
+ w*vehicle_score
```

`w` tăng dần khi dữ liệu của xe đủ nhiều.

---

# 18. ML-B — Expected Consumption Regression

Input:

```text
RPM
speed
engine load
throttle
idle duration
acceleration
temperature if useful
vehicle profile
```

Output:

```text
expected_liters_per_second
```

Khuyến nghị:

```text
LightGBM / XGBoost / HistGradientBoosting
```

Nếu muốn tối giản dependency:

```text
sklearn HistGradientBoostingRegressor
```

Metrics:

```text
MAE liters/hour
MAPE
error by operating mode
```

Quan trọng hơn accuracy toàn cục là error trong:

```text
idle
low-speed
urban
highway
```

---

# 19. ML-C — Sloshing Probability

Input:

```text
fuel_range
fuel_variance
direction_changes
sustained_change
motion_energy
jerk
roll/pitch variation
speed
acceleration
braking/turning indicators
```

Output:

```text
P_slosh
```

Một Logistic Regression đủ tốt cho baseline vì dễ giải thích.

Sau đó có thể nâng sang Gradient Boosted Trees nếu nonlinear relationship đáng kể.

---

# 20. Những model KHÔNG nên ưu tiên lúc đầu

## LSTM / Transformer

Không phải không tốt, nhưng không hợp giai đoạn đầu vì:

- data sequence có nhãn chưa đủ;
- tuning phức tạp;
- explainability thấp hơn;
- khó chứng minh lợi ích so với feature-based model;
- dễ tạo cảm giác “AI for AI's sake”.

## Autoencoder

Có thể nghiên cứu sau nhưng Isolation Forest dễ triển khai và phản biện hơn.

## Deep neural network

Chỉ nên dùng khi dataset thực sự chứng minh model nhẹ không đủ.

---

# 21. Explainable Evidence Fusion

Đây là phần trung tâm của SmartT V2.

Không dùng:

```text
final_confidence = ML_score
```

Mà:

```text
E_rule
E_residual
E_change_point
E_context
E_slosh
E_ml
E_quality
```

## 21.1. Evidence vector

Ví dụ:

```json
{
  "fuel_drop_l": 8.7,
  "drop_duration_s": 42,
  "stationary_duration_s": 184,
  "ignition_off": true,
  "slosh_probability": 0.07,
  "sensor_quality": 0.94,
  "expected_consumption_l": 0.2,
  "unexplained_loss_l": 8.5,
  "change_point_score": 0.88,
  "ml_anomaly_score": 0.91
}
```

## 21.2. Hard gates

Một số điều kiện có thể dùng để chặn event:

```text
sensor_quality extremely low → no high-confidence theft
vehicle confirmed moving → suppress parked theft
sensor fault → sensor fault has priority
```

## 21.3. Soft evidence

Ví dụ:

```text
large unexplained loss       +++
stationary                    ++
ignition off                  ++
low slosh                     ++
strong change-point           ++
high ML anomaly               +
low sensor quality            --
GPS/CAN contradictory         --
```

## 21.4. Confidence decomposition

Thay vì chỉ output 92:

```json
{
  "confidence": 92,
  "components": {
    "physical_evidence": 0.96,
    "context_consistency": 0.93,
    "signal_quality": 0.94,
    "statistical_evidence": 0.89,
    "ml_evidence": 0.91
  }
}
```

Confidence cuối có thể dùng weighted geometric mean hoặc calibrated logistic function.

Weighted geometric mean có ưu điểm: một thành phần rất yếu sẽ kéo confidence xuống rõ hơn.

Ví dụ:

```text
C =
Q^wq
× P_physics^wp
× P_context^wc
× P_stats^ws
× P_ml^wm
```

Sau đó scale 0–100.

Weights phải tune bằng validation, không tuyên bố là optimal từ đầu.

---

# 22. Explainable Event Detection V2

## 22.1. Event taxonomy

```text
NORMAL
SLOSHING
REFUEL
EXPECTED_CONSUMPTION
SUSPICIOUS_FUEL_LOSS
POSSIBLE_LEAK
FUEL_THEFT_ANOMALY
SENSOR_FAULT
DATA_QUALITY_WARNING
```

## 22.2. Candidate → confirmed → resolved

Mọi incident nên có lifecycle:

```text
CANDIDATE
CONFIRMED
ACTIVE
RESOLVED
CANCELLED
```

Ví dụ:

```text
DROP_CANDIDATE
→ FUEL_LOSS_CONFIRMED
→ THEFT_ANOMALY_ACTIVE
→ RESOLVED
```

## 22.3. Leak vs theft

Không nên gọi mọi unexplained loss là theft.

Ví dụ:

```text
vehicle stationary
engine off
sudden large drop
→ theft-like

vehicle running
slow persistent unexplained loss
no refuel
no slosh
→ leak / abnormal consumption candidate
```

Backend nên dùng tên trung tính trước:

```text
SUSPICIOUS_FUEL_LOSS
```

rồi mới nâng severity khi evidence đủ mạnh.

---

# 23. Event rules đề xuất

## 23.1. Refuel

Evidence:

```text
fuel rises significantly
change-point upward
sustained increase
not pure oscillation
sensor quality acceptable
```

## 23.2. Sloshing

Evidence:

```text
oscillatory fuel waveform
high direction changes
high motion energy
fuel returns near baseline
no persistent residual
```

## 23.3. Suspicious parked loss

```text
parked
ignition off
persistent negative fuel change
low slosh
high quality
expected consumption ~ 0
change-point downward
```

## 23.4. Fuel theft anomaly

Upgrade from suspicious loss when:

```text
loss magnitude high
AND event persists
AND context highly consistent
AND no recovery
AND no plausible consumption
AND no sensor fault
```

ML anomaly nên tăng confidence, không phải điều kiện bắt buộc.

## 23.5. Sensor fault

Có thể detect:

```text
timeout
out-of-range
impossible jumps
stuck value
disagreement across sensors
noise floor abnormal
```

---

# 24. Sensor Stuck Detection V2

Logic cũ coi tín hiệu phẳng hợp lệ là stable.

V2 nên phân biệt:

```text
truly stable tank
vs
sensor stuck
```

Evidence stuck:

```text
distance exactly unchanged too long
while vehicle motion changes
AND CAN fuel consumption accumulates
AND expected tank level should change
```

Ví dụ:

```text
engine consumes estimated 6 L
ultrasonic reports exactly same value for 2 h
→ sensor plausibility fault
```

Đây là một ví dụ mạnh của cross-sensor diagnostics.

---

# 25. Cross-Sensor Plausibility Engine

Các sensor phải có khả năng kiểm tra chéo nhau.

## 25.1. Ultrasonic vs CAN fuel level

Nếu cả hai có:

```text
residual = ultrasonic_percent - ECU_fuel_percent
```

Theo dõi drift.

## 25.2. Fuel drop vs engine consumption

```text
observed drop ≈ expected consumption
→ plausible
```

## 25.3. Slosh vs motion

```text
high fuel oscillation + high motion
→ plausible slosh
```

```text
high fuel oscillation + zero motion for long time
→ suspicious sensor noise
```

---

# 26. Adaptive Baseline

Baseline không nên chỉ là một con số parked fuel.

V2:

```text
baseline_value
baseline_variance
baseline_quality
baseline_timestamp
baseline_context
```

Update khi:

```text
stable
high sensor quality
low motion
no active event
no refuel candidate
```

Dùng robust update:

```text
baseline_new =
(1-beta)*baseline_old
+ beta*filtered_fuel
```

Không cập nhật baseline nếu đang có sustained drop.

---

# 27. Personalized Thresholds

Fixed threshold demo như 5% có thể không phù hợp mọi tank.

V2:

```text
threshold = max(
    absolute_min_liters,
    k_sigma * normal_noise_sigma,
    relative_percent_threshold
)
```

Ví dụ:

```text
drop threshold =
max(2.0 L, 4 × parked_noise_std, 1.5% tank capacity)
```

Sau pilot, mỗi xe có profile riêng:

```text
vehicle_noise_profile
vehicle_slosh_profile
tank_geometry_profile
consumption_profile
```

---

# 28. Dynamic Thresholding

Threshold phụ thuộc context:

```text
PARKED_STABLE:
    sensitive threshold

MOVING_ROUGH:
    conservative threshold

SENSOR_QUALITY_LOW:
    higher threshold

HIGH_CONFIDENCE_CONTEXT:
    lower detection threshold but require persistence
```

Điều này tốt hơn một ngưỡng chung cho mọi tình huống.

---

# 29. Backend ML Training Pipeline

```text
Raw telemetry
→ quality filtering
→ time alignment
→ feature generation
→ event segmentation
→ label/review
→ train
→ validation
→ calibration
→ model registry
→ inference
→ monitoring
```

## 29.1. Dataset split

Không random split từng row vì sẽ leakage.

Nên split:

```text
by time
and/or
by vehicle
```

Ví dụ:

```text
train: weeks 1-3
validation: week 4
test: future week 5
```

## 29.2. Event-centered dataset

Lưu trace:

```text
60 s before event
event duration
60 s after event
```

Giúp debug và training.

## 29.3. Label

Label nên có:

```text
NORMAL
SLOSH
REFUEL
KNOWN_CONSUMPTION
SIMULATED_THEFT
UNKNOWN_ANOMALY
SENSOR_FAULT
```

Không ép mọi anomaly chưa rõ thành theft.

---

# 30. Model Drift

Vehicle behavior thay đổi theo:

```text
load
route
driver
fuel type
sensor aging
mechanical maintenance
season / temperature
```

Backend nên monitor:

```text
feature distribution drift
prediction error drift
anomaly rate drift
sensor quality drift
```

Nếu drift lớn:

```text
fallback more strongly to deterministic engine
flag model for retraining
```

---

# 31. Human-in-the-Loop Feedback

Một tính năng SaaS rất đáng giá:

Dashboard cho operator:

```text
Confirm event
Dismiss false alarm
Mark as refuel
Mark as maintenance
Unknown
```

Feedback trở thành label cho model.

Nhưng model update phải theo batch/review; không học online mù quáng từ một click.

---

# 32. Explainability cho ML

Nếu dùng tree model:

```text
SHAP
feature contributions
```

Ví dụ:

```text
+0.21 unexplained_loss
+0.17 stationary_duration
+0.13 ignition_off
+0.09 change_point
-0.04 slosh_probability
```

Dashboard không nhất thiết hiển thị SHAP kỹ thuật.

Có thể chuyển thành câu:

```text
Primary reasons:
1. Unexplained fuel loss is unusually high.
2. Vehicle remained stationary.
3. Motion pattern does not support sloshing.
```

---

# 33. Reliable Event Delivery

Đây là phần bắt buộc trước khi khoe backend thông minh.

## 33.1. Telemetry vs Incident

Tách:

```text
telemetry sample
event candidate update
confirmed incident
```

## 33.2. Event identity

```text
boot_id
event_seq
incident_id
```

Unique key:

```text
(device_id, boot_id, event_seq)
```

## 33.3. Queue + ACK

Confirmed event:

```text
ESP32 queue
→ POST
→ server ACK
→ remove from queue
```

Không để event quan trọng chỉ tồn tại 250 ms rồi mất.

## 33.4. Idempotent ingest

Server nhận lại cùng event:

```text
do not duplicate
```

---

# 34. Timestamp đúng nghĩa

Payload nên có:

```text
event_time_edge
server_received_at
device_uptime_ms
boot_id
sample_seq
```

Nếu không có RTC:

```text
GPS UTC when available
or
server sync + monotonic uptime
```

---

# 35. Backend Storage Schema V2

## telemetry

```text
id
device_id
vehicle_id
timestamp
raw sensor fields
normalized fields
feature fields
quality fields
context
model_version
```

## incidents

```text
incident_id
vehicle_id
event_type
start_time
confirm_time
end_time
severity
confidence
evidence_json
model_version
rule_version
status
operator_feedback
```

## model_runs

```text
model_version
training_period
feature_schema_version
metrics
created_at
```

## calibration_profiles

```text
vehicle_id
tank_profile_id
height_volume_lut
sensor_offset
noise_profile
updated_at
```

---

# 36. Versioning

Mọi decision phải truy ngược được:

```text
rule_version
feature_schema_version
model_version
calibration_version
```

Nếu dashboard hỏi:

> “Vì sao ngày 12/09 hệ thống báo theft?”

ta phải tái tạo được logic lúc đó.

---

# 37. Backend API đề xuất

```text
POST /api/v2/telemetry
POST /api/v2/events
GET  /api/v2/vehicles/{id}/latest
GET  /api/v2/vehicles/{id}/history
GET  /api/v2/vehicles/{id}/incidents
GET  /api/v2/incidents/{id}
POST /api/v2/incidents/{id}/feedback
GET  /api/v2/model/status
```

---

# 38. Edge vs Backend: phân công thuật toán

## Edge ESP32

Phải chạy được khi mất mạng:

```text
sensor acquisition
frame validation
basic calibration
median / basic filtering
basic motion features
hard sensor fault
core deterministic FSM
emergency theft/refuel candidate
local event queue
```

## Backend

Chạy phần nặng và học thích nghi:

```text
advanced adaptive Kalman
multi-scale features
expected consumption model
change-point analysis
vehicle-specific anomaly ML
model calibration
fleet/global learning
cross-vehicle analytics
SHAP/explainability
drift detection
incident aggregation
```

## Hybrid

Một số phần có thể chạy ở cả hai:

```text
Kalman
change-point
context
slosh score
```

Grand Final nên ưu tiên reliability: edge vẫn hoạt động nếu backend mất kết nối.

---

# 39. Final Decision Fusion

Pseudocode:

```text
INPUT:
    sensor measurements
    CAN context
    IMU context
    GPS / ignition
    model outputs

quality = compute_sensor_quality()

fuel = filter_and_estimate_true_fuel()

context = infer_vehicle_context()

expected_consumption =
    estimate_engine_consumption(context, CAN)

residual =
    observed_fuel_change - expected_consumption

cp_score =
    change_point_detector(residual)

slosh_prob =
    estimate_sloshing(fuel_features, motion_features)

ml_score =
    anomaly_model(features)

rule_evidence =
    deterministic_rules(
        fuel,
        context,
        residual,
        slosh_prob,
        quality
    )

evidence =
    fuse(
        rule_evidence,
        cp_score,
        ml_score,
        quality
    )

event =
    update_incident_state_machine(evidence)

OUTPUT:
    event_type
    confidence
    evidence
    why
```

---

# 40. Ví dụ end-to-end

## Case A — Xe chạy qua đường xấu

```text
fuel oscillation: high
motion energy: high
speed: 38 km/h
ignition: ON
sustained fuel loss: low
residual: low
```

Kết quả:

```text
SLOSHING
confidence: high
no theft alert
```

Why:

```text
Fuel fluctuation coincides with strong vehicle motion
No sustained unexplained fuel loss
```

## Case B — Xe đỗ, bị rút nhiên liệu

```text
ignition: OFF
speed: 0
motion energy: low
fuel drop: 8.7 L
expected consumption: 0.2 L
unexplained loss: 8.5 L
change-point: strong
ML anomaly: 0.91
sensor quality: 0.94
```

Kết quả:

```text
FUEL_THEFT_ANOMALY
confidence: 94
```

Why:

```text
Large persistent unexplained fuel loss
Vehicle stationary
Engine off
Low sloshing probability
Strong statistical change
High anomaly score
```

## Case C — Refuel

```text
fuel rises 22 L
change-point upward
sustained increase
low motion
stabilizes after fill
```

Kết quả:

```text
REFUEL
```

## Case D — Sensor lỗi

```text
ultrasonic value frozen
engine consumption accumulates
CAN indicates vehicle driven 120 km
sensor reports exactly same distance
```

Kết quả:

```text
SENSOR_FAULT / SENSOR_STUCK
```

---

# 41. Điểm khác biệt kỹ thuật của SmartT

Không nên mô tả “khác biệt” chỉ bằng câu “có AI”.

Các điểm có cơ sở mạnh hơn:

## 41.1. Context-Aware Sensor Trust

SmartT thay đổi mức độ tin vào fuel sensor theo:

```text
motion
slosh
sensor quality
vehicle mode
```

## 41.2. Explainable Hybrid Intelligence

```text
physics
+ statistics
+ ML
+ state machine
```

thay vì black-box classifier.

## 41.3. Fuel Residual Intelligence

```text
observed fuel loss
-
expected consumption
=
unexplained fuel loss
```

## 41.4. Vehicle-Specific Normal Behavior

Mỗi xe có baseline và anomaly model riêng.

## 41.5. Cross-Sensor Self-Diagnostics

Sensor kiểm tra chéo lẫn nhau để phát hiện:

```text
stuck sensor
drift
impossible behavior
disagreement
```

## 41.6. Explainable Event Evidence

Mỗi incident lưu:

```text
what happened
why it was classified
which sensors supported it
how confident the system is
```

Đây là “technology moat” hợp lý hơn việc chỉ nói “proprietary AI”.

---

# 42. Grand Final implementation priority

Không nên cố code tất cả cùng lúc.

## P0 — Reliability trước

1. Tích hợp ultrasonic thành `FuelLevelSource`.
2. Sensor frame validation.
3. Tank calibration.
4. Event queue + ACK.
5. Incident ID + dedupe.
6. Timestamp / boot ID / sequence.
7. Fix live backend mode.

## P1 — Sensor Fusion thật sự

1. MPU6050 motion features.
2. CAN/OBD context.
3. Context engine.
4. Sensor quality.
5. Mode-aware filter.
6. Cross-sensor sloshing.

## P2 — Statistical Intelligence

1. Multi-window features.
2. CUSUM change-point.
3. Expected consumption from CAN.
4. Residual / unexplained loss.
5. Dynamic thresholding.

## P3 — Machine Learning

1. Collect normal dataset.
2. Isolation Forest anomaly model.
3. Slosh probability model.
4. Expected consumption regression.
5. Model versioning.
6. Explainability.
7. Human feedback loop.

---

# 43. Minimum V2 đủ mạnh cho BKI

Nếu thời gian hạn chế, bản rất mạnh nhưng vẫn khả thi là:

```text
Ultrasonic
+ CAN
+ MPU6050
        ↓
quality validation
        ↓
median / adaptive Kalman
        ↓
multi-scale features
        ↓
context engine
        ↓
slosh score
        ↓
expected consumption
        ↓
fuel residual
        ↓
CUSUM change detection
        ↓
explainable FSM
        ↓
confidence + reasons
        ↓
dashboard
```

Machine learning có thể thêm **Isolation Forest backend-side** sau khi pipeline này ổn.

Ngay cả chưa có ML, kiến trúc trên đã có chiều sâu kỹ thuật cao và không mang cảm giác “AI gắn nhãn”.

---

# 44. V2 + ML hoàn chỉnh

```text
                               ┌────────────────┐
                               │  Global Model  │
                               └───────┬────────┘
                                       │
                                       ▼
Ultrasonic ─┐                    Vehicle Model
CAN/OBD ────┼→ Sensor Fusion → Feature Engine ─────────────┐
MPU6050 ────┤                                              │
GPS ────────┘                                              ▼
                                                    ML Anomaly Score
                                                          │
                ┌─────────────────────────────────────────┤
                │                                         │
                ▼                                         ▼
        Physics/Residual Engine                  Change-Point Engine
                │                                         │
                └────────────────────┬────────────────────┘
                                     ▼
                         Explainable Evidence Fusion
                                     │
                                     ▼
                              Incident FSM
                                     │
                                     ▼
                    confidence + reasons + trace
                                     │
                                     ▼
                         Dashboard / Alert / API
```

---

# 45. KPI kỹ thuật nên đo

## Measurement

```text
fuel MAE
fuel RMSE
tank calibration error
sensor dropout rate
```

## Event detection

```text
precision
recall
false alarms / vehicle-day
detection delay
missed-event rate
```

## Sloshing

```text
slosh false-positive suppression
slosh classification accuracy
```

## ML

```text
anomaly precision at top-k
AUROC / AUPRC where labels exist
model drift
per-vehicle false-positive rate
```

## System

```text
event delivery success
duplicate incident rate
end-to-end latency
backend availability
```

Với prototype, **false alarms per vehicle-day** là metric dễ giải thích với giám khảo.

---

# 46. Những claim không nên nói khi chưa đo

Không nên nói:

```text
“eliminates false alarms”
“100% accurate”
“AI detects theft perfectly”
“Kalman guarantees correct fuel level”
```

Nên nói:

```text
“designed to reduce false alarms”
“uses contextual evidence to distinguish sloshing from persistent fuel loss”
“combines deterministic and learning-based evidence”
“provides explainable confidence”
```

---

# 47. Nguyên tắc để code V2 sạch

Mỗi module nên có responsibility rõ.

Gợi ý:

```text
edge/
  FuelSource/
  UltrasonicSource/
  CanContext/
  ImuContext/
  SensorHealth/
  BasicFilter/
  EventDetector/
  EventQueue/

backend/
  ingestion/
  normalization/
  calibration/
  feature_engine/
  context_engine/
  filtering/
  consumption_model/
  residual_engine/
  change_point/
  anomaly_ml/
  evidence_fusion/
  incident_engine/
  explainability/
  model_registry/
  storage/
```

Không để:

```text
app.py
```

chứa tất cả logic.

---

# 48. Interface gợi ý

## FuelObservation

```text
timestamp
raw_value
fuel_height_mm
fuel_liters
fuel_percent
quality
source
```

## ContextSnapshot

```text
ignition
speed
rpm
motion_energy
roll
pitch
vehicle_mode
```

## IntelligenceSnapshot

```text
filtered_fuel
fuel_rate
expected_consumption
unexplained_loss
slosh_probability
change_point_score
ml_anomaly_score
sensor_quality
```

## IncidentDecision

```text
incident_id
event_type
state
confidence
severity
reasons[]
evidence{}
```

---

# 49. Tóm tắt chiến lược thuật toán

SmartT V2 nên được hiểu theo 5 tầng trí tuệ:

### Tầng 1 — Clean the signal

```text
validation
calibration
filtering
```

### Tầng 2 — Understand the context

```text
vehicle motion
engine state
tank motion
sensor quality
```

### Tầng 3 — Predict what should happen

```text
expected fuel level
expected consumption
normal behavior
```

### Tầng 4 — Detect what does not fit

```text
residual
change-point
anomaly ML
```

### Tầng 5 — Explain what happened

```text
event state
confidence
evidence
why
```

---

# 50. Câu mô tả kỹ thuật ngắn gọn

> SmartT does not classify fuel events from a single sensor threshold. The system first validates and calibrates fuel measurements, then combines them with vehicle and motion context to estimate the true fuel state. A context-aware filter suppresses motion-induced disturbances, while expected-consumption and residual models identify fuel changes that cannot be explained by normal vehicle operation. Statistical change detection and vehicle-specific anomaly models provide additional evidence. A deterministic event engine then fuses these signals into refueling, sloshing, abnormal-loss, theft, or sensor-fault incidents, each accompanied by a confidence score and explicit supporting reasons.

---

# 51. Kết luận

Hướng mạnh nhất cho SmartT không phải:

```text
Sensor → AI → Alert
```

mà là:

```text
Sensor
→ Quality
→ Physics
→ Context
→ Adaptive Estimation
→ Expected Behavior
→ Residual
→ Statistics
→ Machine Learning
→ Explainable Evidence Fusion
→ Incident Decision
```

Điểm “xịn” không nằm ở số lượng thuật toán, mà ở việc **mỗi thuật toán có một nhiệm vụ rõ ràng và hỗ trợ lẫn nhau**.

Nếu triển khai đúng, SmartT sẽ có ba lợi thế kỹ thuật rất rõ:

1. **Robustness:** giảm phụ thuộc vào một cảm biến hoặc một threshold.
2. **Adaptability:** học baseline và behavior riêng theo từng xe.
3. **Explainability:** mỗi cảnh báo đều có bằng chứng vật lý, thống kê và ngữ cảnh đi kèm.

Đó là hướng hợp lý để phát triển từ prototype rule-based hiện tại thành một **Explainable Hybrid Fuel Intelligence Engine** thực sự.
