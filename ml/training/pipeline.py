"""Reproducible grouped, rolling SmartT shadow benchmark."""
from __future__ import annotations
import argparse,csv,json,platform,statistics,time
from collections import Counter,defaultdict
from pathlib import Path
import joblib,numpy as np,sklearn
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import IsolationForest,RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import average_precision_score,f1_score,roc_auc_score
from ml.config import *
from ml.evaluation.metrics import classification_metrics
from ml.features.window_features import FEATURE_NAMES,extract_windows,feature_vector,group_rows,resample_window,rolling_windows,window_truth,write_feature_csv
from ml.simulation.generator import SyntheticConfig,generate,write_csv

def group_split(rows,seed=SEED):
    by=defaultdict(set)
    for r in rows:
        # Scenario strata preserve grouped split membership even when rolling
        # windows correctly have NORMAL baseline/recovery behavior.
        scenario=str(r.get("scenario_label",r["ground_truth_label"]))
        if scenario in TARGET_CLASSES: by[scenario].add(str(r["experiment_id"]))
    rng=np.random.default_rng(seed); out={"train":[],"validation":[],"test":[]}
    for label in TARGET_CLASSES:
        ids=sorted(by[label]);rng.shuffle(ids);a=int(.7*len(ids));b=a+int(.15*len(ids));out["train"]+=ids[:a];out["validation"]+=ids[a:b];out["test"]+=ids[b:]
    sets={k:set(v) for k,v in out.items()};assert not(sets["train"]&sets["validation"] or sets["train"]&sets["test"] or sets["validation"]&sets["test"])
    return {k:sorted(v) for k,v in out.items()}

def matrix(rows,ids):
    selected=[r for r in rows if str(r["experiment_id"]) in ids and r["window_kind"]=="STEADY"]
    return np.array([[float(r[n]) for n in FEATURE_NAMES] for r in selected]),np.array([r["ground_truth_label"] for r in selected],dtype=object)

def choose_abstain(model,x,y):
    p=model.predict_proba(x); confidence=p.max(1); pred=model.classes_[p.argmax(1)]
    # Validation-only: highest macro F1 subject to retaining 70% evaluated windows.
    choices=[0.,.45,.55,.65,.75,.85]; best=0.
    for t in choices:
        kept=confidence>=t
        if kept.mean()>=.70 and f1_score(y[kept],pred[kept],labels=TARGET_CLASSES,average="macro",zero_division=0)>=best: best=t
    return best

def rolling(model,anomaly,rows,ids,abstain):
    records=[]
    for eid,selected,end in rolling_windows([r for r in rows if str(r["experiment_id"]) in ids]):
        first=selected[0]; vector=feature_vector(resample_window(selected,float(first["sample_period_s"])),float(first["sample_period_s"])); x=np.array([[vector[n] for n in FEATURE_NAMES]]);p=model.predict_proba(x)[0];raw=str(model.classes_[p.argmax()]);maxp=float(p.max());drain=float(p[list(model.classes_).index("DRAIN")]); current,overlap,kind=window_truth(selected)
        records.append({"experiment_id":eid,"window_end_s":end,"scenario_label":first["scenario_label"],"current_behavior":current,"subtype":first["ground_truth_subtype"],"window_kind":kind,"predicted_class":raw if maxp>=abstain else "UNKNOWN","raw_prediction":raw,"max_probability":maxp,"drain_probability":drain,"abstain":int(maxp<abstain),"anomaly_score":float(-anomaly.score_samples(x)[0])})
    return records

def rolling_summary(records,rows):
    grouped=defaultdict(list)
    for r in records: grouped[r["experiment_id"]].append(r)
    truth={eid:vals[0] for eid,vals in group_rows(rows).items()}; delays=[];dtotal=miss=0; benign=[]
    for eid,rec in grouped.items():
        source=truth[eid]; scenario=str(source["scenario_label"]); drains=[r for r in rec if r["raw_prediction"]=="DRAIN"]
        if scenario=="DRAIN":
            dtotal+=1; onset=float(source["behavior_start_s"]); active=[r for r in drains if onset<=float(r["window_end_s"])<=float(source["behavior_end_s"])]
            if active: delays.append(float(active[0]["window_end_s"])-onset)
            else: miss+=1
        else:
            runs=[];run=0
            for r in rec:
                if r["raw_prediction"]=="DRAIN": run+=1
                elif run:runs.append(run);run=0
            if run:runs.append(run)
            benign.append({"has_transient":bool(drains),"windows":len(drains),"episodes":len(runs),"longest":max(runs,default=0)})
    return {"drain_experiments":dtotal,"recognized_during_active":dtotal-miss,"miss_rate":miss/max(1,dtotal),"median_delay_s":float(np.median(delays)) if delays else None,"p90_delay_s":float(np.quantile(delays,.9)) if delays else None,"benign_experiments":len(benign),"benign_with_transient_drain_fraction":float(np.mean([x["has_transient"] for x in benign])) if benign else 0.,"transient_drain_windows":sum(x["windows"] for x in benign),"false_drain_episodes":sum(x["episodes"] for x in benign),"longest_consecutive_drain_windows":max([x["longest"] for x in benign],default=0)}

def run(experiments_per_class=120,fault_experiments=16):
    rows=generate(SyntheticConfig(experiments_per_class=experiments_per_class,fault_experiments=fault_experiments));write_csv(rows,SYNTHETIC_DATA_PATH); features=extract_windows(rows);write_feature_csv(features,FEATURE_DATA_PATH); split=group_split(features);SPLITS_PATH.write_text(json.dumps({"seed":SEED,"method":"grouped experiments; rolling windows generated after split",**split},indent=2))
    trainx,trainy=matrix(features,set(split["train"]));valx,valy=matrix(features,set(split["validation"]));testx,testy=matrix(features,set(split["test"]))
    models={"Dummy":DummyClassifier(strategy="most_frequent"),"Logistic Regression":make_pipeline(StandardScaler(),LogisticRegression(max_iter=2000,random_state=SEED)),"Decision Tree depth=3":DecisionTreeClassifier(max_depth=3,random_state=SEED),"Random Forest":RandomForestClassifier(n_estimators=160,max_depth=10,min_samples_leaf=2,class_weight="balanced_subsample",random_state=SEED,n_jobs=1)}
    comparison=[]; fitted={}
    for name,m in models.items():
        m.fit(trainx,trainy);fitted[name]=m; comparison.append({"model":name,"validation_macro_f1":f1_score(valy,m.predict(valx),labels=TARGET_CLASSES,average="macro",zero_division=0),"test_macro_f1":f1_score(testy,m.predict(testx),labels=TARGET_CLASSES,average="macro",zero_division=0)})
    rf=fitted["Random Forest"]; abstain=choose_abstain(rf,valx,valy); anomaly=IsolationForest(n_estimators=200,random_state=SEED,n_jobs=1).fit(trainx[trainy!="DRAIN"])
    rec=rolling(rf,anomaly,rows,set(split["test"]),abstain); ROLLING_PREDICTIONS_PATH.parent.mkdir(parents=True,exist_ok=True)
    with ROLLING_PREDICTIONS_PATH.open("w",newline="") as f: w=csv.DictWriter(f,fieldnames=list(rec[0]));w.writeheader();w.writerows(rec)
    summary=rolling_summary(rec,rows); steady=classification_metrics(testy,rf.predict(testx)); transition=[r for r in rec if r["window_kind"]=="TRANSITION"]
    # Policy truth explicitly suppresses ignition-on and moving drain; C++ host tests are authority gate.
    experiments=group_rows(rows); policy=[]
    for eid in split["test"]:
        first=experiments[eid][0]; eligible=first["scenario_label"]=="DRAIN" and not int(first["ignition"]) and not int(first["gps_moving"]); policy.append({"experiment_id":eid,"theft_alert_expected":int(eligible),"implementation":"production EventDetector.cpp host invariant suite"})
    with ALERT_POLICY_PATH.open("w",newline="") as f:w=csv.DictWriter(f,fieldnames=list(policy[0]));w.writeheader();w.writerows(policy)
    with MODEL_COMPARISON_PATH.open("w",newline="") as f:w=csv.DictWriter(f,fieldnames=list(comparison[0]));w.writeheader();w.writerows(comparison)
    p=rf.predict_proba(testx); scores=-anomaly.score_samples(testx); binary=(testy=="DRAIN").astype(int); anomaly_metrics={"roc_auc":float(roc_auc_score(binary,scores)),"pr_auc":float(average_precision_score(binary,scores)),"benign_false_positive_rate_at_90pct_score":float(np.mean(scores[testy!="DRAIN"]>=np.quantile(scores,.9)))}
    bundle={"classifier":rf,"anomaly_model":anomaly,"feature_names":FEATURE_NAMES,"window_seconds":WINDOW_SECONDS,"min_coverage":MIN_WINDOW_COVERAGE,"abstain_threshold":abstain,"model_version":f"smartt-rolling-synthetic-{SEED}","training_status":"EXPERIMENTAL_SYNTHETIC_SHADOW_ONLY"};MODEL_PATH.parent.mkdir(parents=True,exist_ok=True);joblib.dump(bundle,MODEL_PATH,compress=3)
    result={"dataset":{"rows":len(rows),"experiments":len(experiments),"feature_windows":len(features),"split_counts":{k:len(v) for k,v in split.items()}},"steady":steady,"transition_window_count":len(transition),"model_comparison":comparison,"rolling":summary,"anomaly":anomaly_metrics,"abstain_threshold":abstain,"environment":{"python":platform.python_version(),"numpy":np.__version__,"scikit_learn":sklearn.__version__,"joblib":joblib.__version__}}
    METRICS_PATH.write_text(json.dumps(result,indent=2));METADATA_PATH.write_text(json.dumps({**bundle,"classifier":"serialized separately","anomaly_model":"serialized separately"},default=str,indent=2));REPORT_PATH.write_text(render_report(result))
    return result

def render_report(r):
    return f'''# SmartT ML Evaluation\n\n## Executive conclusion\n\n**Synthetic-only, shadow-only evidence.** Behavior classification and theft-alert policy are separate. The production C++ detector remains alert authority; ML cannot create or change an alert.\n\n## Dataset and split discipline\n\n{r["dataset"]}. Rows from an experiment are in exactly one grouped split. Candidate windows are generated by continuous fixed-stride querying; onset is only used afterward for labels/delay. Steady windows require >=80% one behavior; transition windows ({r["transition_window_count"]}) are reported separately.\n\n## Simple model comparison\n\n{r["model_comparison"]}\n\n## Steady-window benchmark\n\n{r["steady"]}\n\n## Continuous rolling/live benchmark\n\n{r["rolling"]}\n\n## Deterministic C++ alert-policy benchmark\n\nActual production `EventDetector.cpp` is host-compiled and invariant-tested. Alert-policy truth is binary: only ignition-OFF, non-moving DRAIN is eligible. Its policy score is not included in behavior macro-F1.\n\n## Anomaly detector\n\n{r["anomaly"]}. It is an unusual-behavior score, not theft evidence.\n\n## Runtime/offline parity\n\nBoth use `resample_window`, preserve raw missingness, require a full {WINDOW_SECONDS}s window and {MIN_WINDOW_COVERAGE:.0%} coverage, and distinguish GPS data freshness from speed freshness.\n\n## What ML is allowed to do today\n\nRaw behavior probabilities, UNKNOWN abstention (validation-selected threshold `{r["abstain_threshold"]}`), anomaly score, and shadow logging only.\n\n## Physical readiness / remaining validation\n\nPhysical baseline/event/recovery collection is required before any alert authority, calibration claim, field false-alert claim, or deep-learning investigation. There is no evidence that a CNN solves a remaining temporal confusion beyond engineered features.\n\n## Reproduction\n\n`./.venv/bin/python -m unittest discover -s ml/tests -v`\n\n`./.venv/bin/python -m ml.training.pipeline`\n\nEnvironment: {r["environment"]}.\n'''

if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--experiments-per-class",type=int,default=120);p.add_argument("--fault-experiments",type=int,default=16);a=p.parse_args();print(json.dumps(run(a.experiments_per_class,a.fault_experiments),indent=2))
