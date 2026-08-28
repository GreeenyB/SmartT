"""Interactive physical recorder: Enter marks start/end; Ctrl-C stops."""
from __future__ import annotations
import argparse,csv,json,select,sys,time
from datetime import datetime,timezone
from pathlib import Path
from urllib.request import urlopen
from ml.data.schema import SCHEMA_VERSION,normalize_row

FIELDS=list(normalize_row({"experiment_id":"x","timestamp_s":0,"scenario_label":"NORMAL","phase":"EVENT"}))
def pick(p,*names,default=""):
 for n in names:
  if p.get(n) not in (None,""): return p[n]
 return default
def flatten(payload,args,started,phase,start,end):
 raw=payload.get("raw_json",payload)
 if isinstance(raw,str):
  try: raw=json.loads(raw)
  except json.JSONDecodeError: raw=payload
 now=time.monotonic()-started
 current=args.label if phase=="EVENT" else "NORMAL"
 return normalize_row({"schema_version":SCHEMA_VERSION,"timestamp_iso":pick(payload,"created_at",default=datetime.now(timezone.utc).isoformat()),"timestamp_s":now,"experiment_id":args.experiment_id,"vehicle_id":pick(raw,"vehicle_id","vehicleId",default=args.vehicle_id),"fuel_raw_adc_a0":pick(raw,"fuel_raw_adc_a0"),"fuel_raw_adc_a1":pick(raw,"fuel_raw_adc_a1"),"fuel_volts_a0":pick(raw,"fuel_volts_a0"),"fuel_volts_a1":pick(raw,"fuel_volts_a1"),"raw_fuel_percent":pick(raw,"fuel_percent_raw"),"filtered_fuel_percent":pick(raw,"fuel_percent_filtered","fuel_percent",default=pick(payload,"fuel_percent")),"fuel_rate_percent_per_sec":pick(raw,"fuel_rate_percent_per_sec"),"ignition":pick(raw,"ignition","ignitionOn"),"gps_speed_kmh":pick(raw,"gps_speed_kmh","speed_kmh"),"gps_available":pick(raw,"gps_fix","gpsFix"),"gps_data_fresh":pick(raw,"gps_data_fresh","gpsDataFresh"),"gps_speed_fresh":pick(raw,"gps_speed_fresh","gpsSpeedFresh"),"gps_stationary":pick(raw,"gps_stationary"),"gps_moving":pick(raw,"gps_moving"),"sensor_valid":pick(raw,"sensor_healthy","sensorHealthy",default=1),"behavior_start_s":start if start is not None else -1,"behavior_end_s":end if end is not None else -1,"scenario_label":args.label,"current_behavior":current,"phase":phase,"ground_truth_subtype":args.subtype,"notes":args.notes})
def main():
 p=argparse.ArgumentParser();p.add_argument("--experiment-id",required=True);p.add_argument("--label",required=True,choices=("NORMAL","SLOSHING","REFUEL","DRAIN","FAULT"));p.add_argument("--subtype",required=True);p.add_argument("--vehicle-id",default="TRUCK_01");p.add_argument("--notes",default="");p.add_argument("--url",default="http://localhost:8000/api/latest");p.add_argument("--interval",type=float,default=.5);p.add_argument("--output",type=Path);args=p.parse_args();output=args.output or Path(__file__).parent/f"{args.experiment_id}.csv"
 if output.exists(): raise SystemExit(f"refusing to overwrite {output}")
 output.parent.mkdir(parents=True,exist_ok=True);started=time.monotonic();phase="EVENT" if args.label=="NORMAL" else "BASELINE";behavior_start=None;behavior_end=None;rows=[];seen=None
 print("Recording. Press Enter for BEHAVIOR START, Enter again for BEHAVIOR END; Ctrl-C stops.")
 try:
  while True:
   if select.select([sys.stdin],[],[],0)[0]:
    sys.stdin.readline()
    if behavior_start is None: behavior_start=time.monotonic()-started;phase="EVENT";print("BEHAVIOR START marked")
    elif behavior_end is None: behavior_end=time.monotonic()-started;phase="RECOVERY";print("BEHAVIOR END marked")
   with urlopen(args.url,timeout=2) as response: payload=json.load(response)
   identity=(payload.get("id"),payload.get("created_at"))
   if payload and identity!=seen: rows.append(flatten(payload,args,started,phase,behavior_start,behavior_end));seen=identity
   time.sleep(max(.1,args.interval))
 except KeyboardInterrupt: pass
 complete=args.label=="NORMAL" or (behavior_start is not None and behavior_end is not None and behavior_end>behavior_start)
 with output.open("x",newline="") as h:
  w=csv.DictWriter(h,fieldnames=FIELDS);w.writeheader();w.writerows(rows)
 duration=time.monotonic()-started;missing=sum(r["raw_fuel_percent"] in (None,"") for r in rows)/max(1,len(rows));print(json.dumps({"file":str(output),"complete":complete,"rows":len(rows),"duration_s":round(duration,2),"baseline_s":behavior_start,"event_s":None if not complete else behavior_end-behavior_start,"recovery_s":None if behavior_end is None else duration-behavior_end,"missing_raw_ratio":missing,"gps_speed_fresh_ratio":sum(int(r["gps_speed_fresh"]) for r in rows)/max(1,len(rows)),"sensor_healthy_ratio":sum(int(r["sensor_valid"]) for r in rows)/max(1,len(rows)),"marker_valid":complete},indent=2))
 if not complete: print("INCOMPLETE: do not use this file for training.")
if __name__=="__main__": main()
