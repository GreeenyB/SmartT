"""One window-preparation implementation for training, benchmark and server shadow mode."""
from __future__ import annotations
import csv
from pathlib import Path
import numpy as np
from ml.config import FORBIDDEN_FEATURE_FIELDS, ROLLING_STRIDE_SECONDS, STEADY_OVERLAP_RATIO, WINDOW_SECONDS

FEATURE_NAMES = ["window_duration_s","sample_count","sample_coverage","net_fuel_change_pct","mean_rate_pct_per_s","median_rate_pct_per_s","min_rate_pct_per_s","max_rate_pct_per_s","fuel_range_pct","fuel_std_pct","fuel_variance_pct2","fuel_mad_pct","linear_slope_pct_per_s","monotonicity","direction_changes","negative_step_ratio","positive_step_ratio","recovery_ratio","max_drawdown_pct","max_runup_pct","raw_filtered_rmse_pct","raw_filtered_mean_abs_pct","ignition_on_ratio","ignition_transitions","gps_speed_mean_kmh","gps_speed_max_kmh","gps_speed_std_kmh","gps_available_ratio","gps_data_fresh_ratio","gps_speed_fresh_ratio","gps_stationary_ratio","gps_moving_ratio","sensor_valid_ratio","raw_missing_ratio"]
assert not set(FEATURE_NAMES) & FORBIDDEN_FEATURE_FIELDS

def _f(row, key, default=0.0):
    try:
        value=row.get(key,default); return float(value) if value not in (None,"") else default
    except (ValueError,TypeError): return default

def group_rows(rows):
    out={}
    for row in rows: out.setdefault(str(row["experiment_id"]),[]).append(row)
    for values in out.values(): values.sort(key=lambda r:_f(r,"timestamp_s"))
    return out

def resample_window(rows, period_s=.25):
    """Shared interpolation; raw observation missingness is deliberately retained."""
    if len(rows)<2: return list(rows)
    source=np.array([_f(r,"timestamp_s") for r in rows]); target=np.arange(source[0],source[-1]+period_s*.5,period_s)
    nearest=np.clip(np.searchsorted(source,target,side="right")-1,0,len(rows)-1); result=[]
    interpolated={k:np.interp(target,source,[_f(r,k) for r in rows]) for k in ("filtered_fuel_percent","gps_speed_kmh")}
    for i,t in enumerate(target):
        source_row=rows[int(nearest[i])]; row={"timestamp_s":float(t-target[0]),"raw_fuel_percent":source_row.get("raw_fuel_percent","")}
        row.update({k:float(v[i]) for k,v in interpolated.items()})
        for k in ("ignition","gps_available","gps_data_fresh","gps_speed_fresh","gps_stationary","gps_moving","sensor_valid"):
            row[k]=source_row.get(k,source_row.get("gps_fresh",0) if k in {"gps_data_fresh","gps_speed_fresh"} else 0)
        result.append(row)
    return result

def feature_vector(rows, expected_period_s=.25):
    if len(rows)<3: raise ValueError("A feature window needs at least three samples")
    time=np.array([_f(r,"timestamp_s") for r in rows]); fuel=np.array([_f(r,"filtered_fuel_percent") for r in rows]); dt=np.maximum(np.diff(time),expected_period_s); steps=np.diff(fuel); rates=steps/dt
    raw_missing=np.array([r.get("raw_fuel_percent","") in (None,"") for r in rows]); raw=np.array([_f(r,"raw_fuel_percent",fuel[i]) for i,r in enumerate(rows)])
    duration=max(expected_period_s,float(time[-1]-time[0])); total=float(np.abs(steps).sum()); nz=np.sign(np.where(abs(steps)>=.04,steps,0)); nz=nz[nz!=0]
    def series(name,legacy=None): return np.array([_f(r,name,_f(r,legacy,0) if legacy else 0) for r in rows])
    ignition=series("ignition"); speed=series("gps_speed_kmh"); available=series("gps_available"); data_fresh=series("gps_data_fresh","gps_fresh"); speed_fresh=series("gps_speed_fresh","gps_fresh"); stationary=series("gps_stationary"); moving=series("gps_moving"); valid=series("sensor_valid", "sensor_healthy")
    return dict(zip(FEATURE_NAMES,[duration,float(len(rows)),min(1.,len(rows)/(duration/expected_period_s+1)),float(fuel[-1]-fuel[0]),float(rates.mean()),float(np.median(rates)),float(rates.min()),float(rates.max()),float(np.ptp(fuel)),float(fuel.std()),float(fuel.var()),float(np.median(abs(fuel-np.median(fuel)))),float(np.polyfit(time-time[0],fuel,1)[0]),abs(float(fuel[-1]-fuel[0]))/max(total,1e-9),float(np.sum(nz[1:]!=nz[:-1])) if len(nz)>1 else 0.,float(np.mean(steps<-.04)),float(np.mean(steps>.04)),max(0.,total-abs(float(fuel[-1]-fuel[0])))/max(total,1e-9),float(np.max(np.maximum.accumulate(fuel)-fuel)),float(np.max(fuel-np.minimum.accumulate(fuel))),float(np.sqrt(np.mean((raw-fuel)**2))),float(np.mean(abs(raw-fuel))),float(ignition.mean()),float(np.sum(np.diff(ignition)!=0)),float(speed.mean()),float(speed.max()),float(speed.std()),float(available.mean()),float(data_fresh.mean()),float(speed_fresh.mean()),float(stationary.mean()),float(moving.mean()),float(valid.mean()),float(raw_missing.mean())]))

def rolling_windows(rows, window_seconds=WINDOW_SECONDS, stride_seconds=ROLLING_STRIDE_SECONDS):
    for eid,values in group_rows(rows).items():
        times=np.array([_f(r,"timestamp_s") for r in values]); next_end=times[0]+window_seconds; start_index=0
        for end_index,end in enumerate(times):
            if end+1e-9<next_end: continue
            while start_index < end_index and times[start_index] < end-window_seconds-1e-9: start_index += 1
            selected=values[start_index:end_index+1]
            if len(selected)>=3: yield eid,selected,float(end)
            next_end+=stride_seconds

def window_truth(selected):
    labels=[str(r.get("current_behavior",r.get("ground_truth_label","NORMAL"))) for r in selected]; values,counts=np.unique(labels,return_counts=True); i=int(np.argmax(counts)); ratio=float(counts[i]/len(labels)); return str(values[i]),ratio,"STEADY" if ratio>=STEADY_OVERLAP_RATIO else "TRANSITION"

def extract_windows(rows,window_seconds=WINDOW_SECONDS):
    out=[]
    for eid,selected,end in rolling_windows(rows,window_seconds):
        first=selected[0]; label,overlap,kind=window_truth(selected)
        if label=="FAULT": continue
        out.append({"experiment_id":eid,"window_id":f"{eid}-{end:.3f}","vehicle_id":str(first["vehicle_id"]),"ground_truth_label":label,"scenario_label":str(first.get("scenario_label",first.get("ground_truth_label"))),"ground_truth_subtype":str(first["ground_truth_subtype"]),"window_start_s":_f(selected[0],"timestamp_s"),"window_end_s":end,"window_kind":kind,"behavior_overlap":overlap,**feature_vector(resample_window(selected,_f(first,"sample_period_s",.25)),_f(first,"sample_period_s",.25))})
    return out

def write_feature_csv(rows,path:Path):
    if not rows: raise ValueError("No feature rows to write")
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open("w",newline="",encoding="utf-8") as h:
        w=csv.DictWriter(h,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
