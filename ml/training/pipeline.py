"""Reproducible, group-safe SmartT shadow benchmark.

This module intentionally keeps model selection on training/validation only. The
test split is used once for the final static, rolling, C++ policy, and stress
reports; stress experiments are never included in training.
"""
from __future__ import annotations

import argparse
import csv
import json
import platform
import statistics
import subprocess
from collections import defaultdict
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import sklearn
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, f1_score, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

from ml.config import *
from ml.evaluation.metrics import classification_metrics
from ml.features.window_features import (
    FEATURE_NAMES, extract_windows, feature_vector, group_rows, resample_window,
    rolling_windows, window_truth, write_feature_csv,
)
from ml.simulation.generator import SyntheticConfig, generate, generate_stress, write_csv


REPO_DIR = ML_DIR.parent


def group_split(rows: list[dict[str, Any]], seed: int = SEED) -> dict[str, list[str]]:
    by: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        scenario = str(row.get("scenario_label", row["ground_truth_label"]))
        if scenario in TARGET_CLASSES:
            by[scenario].add(str(row["experiment_id"]))
    rng = np.random.default_rng(seed)
    result = {"train": [], "validation": [], "test": []}
    for label in TARGET_CLASSES:
        identifiers = sorted(by[label])
        rng.shuffle(identifiers)
        train_end = int(.7 * len(identifiers))
        validation_end = train_end + int(.15 * len(identifiers))
        result["train"] += identifiers[:train_end]
        result["validation"] += identifiers[train_end:validation_end]
        result["test"] += identifiers[validation_end:]
    sets = {name: set(ids) for name, ids in result.items()}
    assert not (sets["train"] & sets["validation"] or sets["train"] & sets["test"] or sets["validation"] & sets["test"])
    return {name: sorted(ids) for name, ids in result.items()}


def matrix(rows: list[dict[str, Any]], identifiers: set[str]) -> tuple[np.ndarray, np.ndarray]:
    selected = [row for row in rows if str(row["experiment_id"]) in identifiers and row["window_kind"] != "TRANSITION"]
    return (
        np.asarray([[float(row[name]) for name in FEATURE_NAMES] for row in selected], dtype=np.float64),
        np.asarray([str(row["ground_truth_label"]) for row in selected], dtype=object),
    )


def models(seed: int) -> dict[str, Any]:
    return {
        "Dummy": DummyClassifier(strategy="most_frequent"),
        "Logistic Regression": make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000, random_state=seed)),
        "Decision Tree depth=3": DecisionTreeClassifier(max_depth=3, min_samples_leaf=3, random_state=seed),
        "Random Forest": RandomForestClassifier(
            n_estimators=160, max_depth=10, min_samples_leaf=2, class_weight="balanced_subsample", random_state=seed, n_jobs=1
        ),
    }


def deployed_predictions(model: Any, x: np.ndarray, threshold: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    probabilities = model.predict_proba(x)
    classes = np.asarray([str(value) for value in model.classes_], dtype=object)
    raw = classes[probabilities.argmax(axis=1)]
    confidence = probabilities.max(axis=1)
    deployed = np.where(confidence >= threshold, raw, "UNKNOWN")
    return raw, deployed, probabilities


def decision_quality(y: np.ndarray, prediction: np.ndarray) -> dict[str, Any]:
    output = classification_metrics(y, prediction)
    breakdown: dict[str, dict[str, int]] = {}
    for label in TARGET_CLASSES:
        selected = prediction[y == label]
        breakdown[label] = {
            "correct": int(np.sum(selected == label)),
            "wrong": int(np.sum((selected != label) & (selected != "UNKNOWN"))),
            "unknown": int(np.sum(selected == "UNKNOWN")),
        }
    non_abstained = prediction != "UNKNOWN"
    output.update({
        "decision_breakdown": breakdown,
        "abstention_rate": float(1.0 - non_abstained.mean()) if len(prediction) else 0.0,
        "selective_accuracy": float(np.mean(prediction[non_abstained] == y[non_abstained])) if np.any(non_abstained) else None,
    })
    return output


def choose_abstain(model: Any, x: np.ndarray, y: np.ndarray) -> tuple[float, dict[str, Any]]:
    """Choose on validation only, with distinct score and threshold state."""
    choices = (0.0, .45, .55, .65, .75, .85)
    best_score = float("-inf")
    best_threshold = 0.0
    best_metrics: dict[str, Any] = {}
    for threshold in choices:
        _, deployed, _ = deployed_predictions(model, x, threshold)
        metrics = decision_quality(y, deployed)
        constraints = (
            metrics["drain_recall"] >= .70
            and metrics["false_theft_rate"] <= .05
            and metrics["abstention_rate"] <= .40
        )
        # Constraint failures are still comparable, but cannot beat a feasible
        # threshold merely by abstaining from difficult samples.
        score = float(metrics["macro_f1"]) - (0.25 if not constraints else 0.0)
        if score > best_score + 1e-12 or (abs(score - best_score) <= 1e-12 and threshold < best_threshold):
            best_score, best_threshold, best_metrics = score, threshold, metrics
    best_metrics["selection_score"] = best_score
    best_metrics["constraints_met"] = (
        best_metrics["drain_recall"] >= .70 and best_metrics["false_theft_rate"] <= .05 and best_metrics["abstention_rate"] <= .40
    )
    return best_threshold, best_metrics


def choose_window(rows: list[dict[str, Any]], split: dict[str, list[str]], seed: int) -> tuple[float, list[dict[str, Any]]]:
    results: list[dict[str, Any]] = []
    for seconds in WINDOW_CANDIDATES_SECONDS:
        features = extract_windows(rows, seconds)
        train_x, train_y = matrix(features, set(split["train"]))
        val_x, val_y = matrix(features, set(split["validation"]))
        model = models(seed)["Logistic Regression"]
        model.fit(train_x, train_y)
        raw = model.predict(val_x)
        results.append({"window_seconds": seconds, "validation_macro_f1": float(f1_score(val_y, raw, labels=TARGET_CLASSES, average="macro", zero_division=0))})
    # Fixed tie-break to the shorter live reaction window; final test is untouched.
    winner = max(results, key=lambda item: (item["validation_macro_f1"], -item["window_seconds"]))
    return float(winner["window_seconds"]), results


def rolling(model: Any, anomaly: Any, rows: list[dict[str, Any]], identifiers: set[str],
            threshold: float, window_seconds: float) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for experiment_id, selected, end in rolling_windows([row for row in rows if str(row["experiment_id"]) in identifiers], window_seconds):
        first = selected[0]
        prepared = resample_window(selected, float(first["sample_period_s"]), window_start_s=end-window_seconds, window_end_s=end)
        vector = feature_vector(prepared, float(first["sample_period_s"]))
        x = np.asarray([[vector[name] for name in FEATURE_NAMES]], dtype=np.float64)
        probability = model.predict_proba(x)[0]
        classes = [str(value) for value in model.classes_]
        raw = classes[int(np.argmax(probability))]
        maximum = float(np.max(probability))
        prediction = raw if maximum >= threshold else "UNKNOWN"
        current, overlap, kind, role = window_truth(selected)
        records.append({
            "experiment_id": experiment_id, "window_end_s": end, "scenario_label": first["scenario_label"],
            "current_behavior": current, "subtype": first["ground_truth_subtype"], "window_kind": kind,
            "window_role": role, "behavior_overlap": overlap, "predicted_class": prediction,
            "raw_prediction": raw, "max_probability": maximum,
            "drain_probability": float(probability[classes.index("DRAIN")]), "abstain": int(prediction == "UNKNOWN"),
            "sample_coverage": vector["sample_coverage"], "raw_missing_ratio": vector["raw_missing_ratio"],
            "anomaly_score": float(-anomaly.score_samples(x)[0]),
        })
    return records


def rolling_summary(records: list[dict[str, Any]], rows: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in records:
        grouped[str(row["experiment_id"])].append(row)
    source = {identifier: values[0] for identifier, values in group_rows(rows).items()}
    delays: list[float] = []
    drains = misses = 0
    benign: list[dict[str, int | bool]] = []
    all_truth: list[str] = []
    all_deployed: list[str] = []
    all_raw: list[str] = []
    for identifier, prediction_rows in grouped.items():
        truth = source[identifier]
        all_truth += [str(row["current_behavior"]) for row in prediction_rows]
        all_deployed += [str(row["predicted_class"]) for row in prediction_rows]
        all_raw += [str(row["raw_prediction"]) for row in prediction_rows]
        if str(truth["scenario_label"]) == "DRAIN":
            drains += 1
            onset, end = float(truth["behavior_start_s"]), float(truth["behavior_end_s"])
            active = [row for row in prediction_rows if onset <= float(row["window_end_s"]) <= end and row["predicted_class"] == "DRAIN"]
            if active:
                delays.append(float(active[0]["window_end_s"]) - onset)
            else:
                misses += 1
        else:
            drain_rows = [row for row in prediction_rows if row["predicted_class"] == "DRAIN"]
            runs: list[int] = []
            run = 0
            for row in prediction_rows:
                if row["predicted_class"] == "DRAIN":
                    run += 1
                elif run:
                    runs.append(run)
                    run = 0
            if run:
                runs.append(run)
            benign.append({"has_transient": bool(drain_rows), "windows": len(drain_rows), "episodes": len(runs), "longest": max(runs, default=0)})
    deployed = decision_quality(np.asarray(all_truth, dtype=object), np.asarray(all_deployed, dtype=object))
    raw = classification_metrics(all_truth, all_raw)
    return {
        "raw_classifier_quality_all_windows": raw,
        "deployed_shadow_quality_all_windows": deployed,
        "drain_experiments": drains, "recognized_during_active": drains - misses,
        "miss_rate": misses / max(1, drains), "median_delay_s": float(np.median(delays)) if delays else None,
        "p90_delay_s": float(np.quantile(delays, .9)) if delays else None,
        "benign_experiments": len(benign),
        "benign_false_drain_experiment_rate": float(np.mean([item["has_transient"] for item in benign])) if benign else 0.0,
        "transient_drain_windows": int(sum(int(item["windows"]) for item in benign)),
        "false_drain_episodes": int(sum(int(item["episodes"]) for item in benign)),
        "longest_consecutive_drain_windows": int(max([int(item["longest"]) for item in benign], default=0)),
    }


def run_cpp_policy(csv_path: Path, identifiers: set[str], *, write_report: bool = True) -> tuple[list[dict[str, str]], dict[str, Any]]:
    binary = Path("/tmp/smartt_firmware_policy_benchmark")
    command = ["g++", "-std=c++17", "-Iml/tests/arduino_stub", "-ISmartT_Core_Demo", "SmartT_Core_Demo/EventDetector.cpp", "ml/tests/firmware_policy_benchmark.cpp", "-o", str(binary)]
    subprocess.run(command, cwd=REPO_DIR, check=True, capture_output=True, text=True)
    output = subprocess.run([str(binary), str(csv_path)], cwd=REPO_DIR, check=True, capture_output=True, text=True).stdout
    parsed = list(csv.DictReader(output.splitlines()))
    selected = [row for row in parsed if row["experiment_id"] in identifiers]
    if write_report:
        with ALERT_POLICY_PATH.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(parsed[0]))
            writer.writeheader()
            writer.writerows(selected)
    eligible = [row for row in selected if row["theft_alert_expected"] == "1"]
    ineligible = [row for row in selected if row["theft_alert_expected"] != "1"]
    detected = [row for row in eligible if row["actual_alert"] == "1"]
    false = [row for row in ineligible if row["actual_alert"] == "1"]
    delays = [float(row["detection_delay_s"]) for row in detected if float(row["detection_delay_s"]) >= 0]
    return selected, {
        "implementation": "actual production SmartT_Core_Demo/EventDetector.cpp host harness",
        "experiments": len(selected), "eligible_alert_experiments": len(eligible), "detected_eligible_alerts": len(detected),
        "theft_alert_recall": len(detected) / max(1, len(eligible)), "missed_eligible_alert_rate": 1 - len(detected) / max(1, len(eligible)),
        "false_alerts": len(false), "false_alert_rate_noneligible": len(false) / max(1, len(ineligible)),
        "median_detection_delay_s": float(np.median(delays)) if delays else None,
        "p90_detection_delay_s": float(np.quantile(delays, .9)) if delays else None,
        "invariant_violations": len([row for row in ineligible if row["actual_alert"] == "1" and row["experiment_id"].startswith("DRAIN")]),
    }


def summarize_seed_runs(seed_runs: list[dict[str, Any]]) -> dict[str, Any]:
    fields = ("macro_f1", "drain_recall", "false_theft_rate", "abstention_rate", "selective_accuracy")
    summary: dict[str, Any] = {"seeds": [run["seed"] for run in seed_runs]}
    for field in fields:
        values = [float(run["metrics"].get(field) or 0.0) for run in seed_runs]
        summary[field] = {"mean": float(statistics.mean(values)), "std": float(statistics.pstdev(values)), "best_seed": seed_runs[int(np.argmax(values))]["seed"], "worst_seed": seed_runs[int(np.argmin(values))]["seed"]}
    return summary


def summarize_seed_metric(seed_runs: list[dict[str, Any]], field: str) -> dict[str, Any]:
    values = [float(run["metrics"].get(field) or 0.0) for run in seed_runs]
    return {"mean": float(statistics.mean(values)), "std": float(statistics.pstdev(values)),
            "best_seed": seed_runs[int(np.argmax(values))]["seed"], "worst_seed": seed_runs[int(np.argmin(values))]["seed"]}


def render_report(result: dict[str, Any]) -> str:
    return f"""# SmartT ML Evaluation

## Executive conclusion

**Synthetic-only, shadow-only evidence.** The selected `{result['selected_model']}` is a behavior classifier, not a theft-alert authority. Validation selected the model/window/abstention policy before the final test evaluation; production `EventDetector.cpp` remains the sole alert authority.

## What is predicted

Behavior classes are `NORMAL`, `SLOSHING`, `REFUEL`, and `DRAIN`; live low-confidence decisions may be `UNKNOWN`. A DRAIN with ignition ON or fresh GPS motion can still be a correct behavior classification while SmartT correctly suppresses a parked-theft alert.

## Dataset, timing, and split discipline

{result['dataset']}. Feature cadence is the actual LocalServerClient telemetry cadence: 500 ms. The selected {result['selected_window_seconds']} s window has {result['runtime_contract']['expected_samples']} expected inclusive samples and requires {result['runtime_contract']['minimum_samples']} ({result['runtime_contract']['min_coverage']:.0%}) valid samples. A first prediction needs the entire wall-clock window; nominal minimum is {result['selected_window_seconds']} seconds. Grouped experiment splits: {result['dataset']['split_counts']}.

Window definitions: `STEADY` has >=80% one behavior; `TRANSITION` is below that threshold; `PRE_EVENT`, `ACTIVE_EVENT`, and `RECOVERY` are explicit window roles. Supervised metrics use non-transition steady/active windows; rolling metrics query every chronological window.

## Validation-only choices

Window candidates: {result['window_selection']}. Model selection: {result['model_selection']}. Abstention threshold `{result['abstain_threshold']}` was selected on validation with DRAIN recall, benign false-DRAIN, and abstention constraints.

## Simple model comparison

{result['model_comparison']}

## Static behavior benchmark (final grouped test)

Raw classifier: {result['steady_raw']}

Deployed shadow decisions: {result['steady_deployed']}

Transition windows (reported separately): {result['transition']}

## Continuous rolling/live benchmark (all final-test windows)

{result['rolling']}

## Actual C++ deterministic theft-policy benchmark

{result['cpp_policy']}

`alert_policy_results.csv` is produced by host-compiling and executing `SmartT_Core_Demo/EventDetector.cpp`, not a Python rule rewrite. Its binary score is intentionally separate from behavior macro-F1.

## OOD/stress benchmark

{result['stress']}

The stress generator is never used for training. It includes mixed drain/slosh, downward-biased slosh, near-threshold and staged drain, slow noisy refuel, spikes, drift/offset, stale/missing GPS speed, packet loss/jitter, raw missingness, short events, boundary events, and noisy recovery. It is reported separately from in-distribution metrics.

## Multi-seed robustness

{result['multi_seed']}

C++ theft policy across the same seeds: {result['cpp_policy_multi_seed']}

## Anomaly detector

{result['anomaly']}. It is an unusual-behavior score, not theft evidence.

## Runtime/offline parity and data quality

Both paths call the same `resample_window` and `feature_vector` implementation. GPS motion features require GPS **speed** freshness; raw missingness and unobserved grid points remain in `raw_missing_ratio`. Normal jitter is accepted; a large packet gap lowers coverage and keeps live inference warming up rather than manufacturing a perfect window.

## Physical collection readiness

The recorder finalizes every row with identical markers, duration, and completion state; incomplete event files are saved separately and the canonical loader rejects them. The A1 potentiometer only supplies the main detector source when `SMARTT_USE_A1_BACKUP_AS_MAIN_FUEL=1`; otherwise use A0 and verify the emitted A0/A1 telemetry fields before recording.

## What ML is allowed to do today

Only raw probabilities, deployed `UNKNOWN`/behavior decisions, anomaly score, and shadow logging. It cannot create or modify deterministic alerts. No physical accuracy, calibration, tank slosh, vehicle false-alert, or cross-vehicle claim is made. There is no evidence here that CNN/LSTM/TinyML would solve a demonstrated remaining issue.

## Reproduction

`./.venv/bin/python -m unittest discover -s ml/tests -v`

`g++ -std=c++17 -Iml/tests/arduino_stub -ISmartT_Core_Demo SmartT_Core_Demo/EventDetector.cpp ml/tests/firmware_event_detector_test.cpp -o /tmp/smartt_event_detector_test && /tmp/smartt_event_detector_test`

`./.venv/bin/python -m ml.training.pipeline`

Environment: {result['environment']}.
"""


def run(experiments_per_class: int = 120, fault_experiments: int = 16) -> dict[str, Any]:
    rows = generate(SyntheticConfig(experiments_per_class=experiments_per_class, fault_experiments=fault_experiments, seed=SEED))
    write_csv(rows, SYNTHETIC_DATA_PATH)
    provisional = extract_windows(rows, WINDOW_SECONDS)
    split = group_split(provisional, SEED)
    selected_window, window_selection = choose_window(rows, split, SEED)
    features = extract_windows(rows, selected_window)
    write_feature_csv(features, FEATURE_DATA_PATH)
    SPLITS_PATH.write_text(json.dumps({"seed": SEED, "method": "stratified grouped experiments; window/model/threshold selected on train+validation only", "window_seconds": selected_window, **split}, indent=2))
    train_x, train_y = matrix(features, set(split["train"]))
    val_x, val_y = matrix(features, set(split["validation"]))
    test_x, test_y = matrix(features, set(split["test"]))

    comparison: list[dict[str, Any]] = []
    fitted: dict[str, Any] = {}
    thresholds: dict[str, float] = {}
    validation_decisions: dict[str, dict[str, Any]] = {}
    for name, model in models(SEED).items():
        model.fit(train_x, train_y)
        fitted[name] = model
        threshold, validation = choose_abstain(model, val_x, val_y)
        thresholds[name], validation_decisions[name] = threshold, validation
        raw_val, deployed_val, _ = deployed_predictions(model, val_x, threshold)
        raw_test, deployed_test, _ = deployed_predictions(model, test_x, threshold)
        comparison.append({
            "model": name, "abstain_threshold_validation": threshold,
            "validation_raw_macro_f1": float(f1_score(val_y, raw_val, labels=TARGET_CLASSES, average="macro", zero_division=0)),
            "validation_deployed_macro_f1": float(f1_score(val_y, deployed_val, labels=TARGET_CLASSES, average="macro", zero_division=0)),
            "test_raw_macro_f1": float(f1_score(test_y, raw_test, labels=TARGET_CLASSES, average="macro", zero_division=0)),
            "test_deployed_macro_f1": float(f1_score(test_y, deployed_test, labels=TARGET_CLASSES, average="macro", zero_division=0)),
        })
    # Simplicity wins when validation deployed Macro-F1 is within one point.
    best_validation = max(item["validation_deployed_macro_f1"] for item in comparison)
    order = list(models(SEED))
    selected_model = next(item["model"] for item in comparison if item["validation_deployed_macro_f1"] >= best_validation - .01)
    selected = fitted[selected_model]
    threshold = thresholds[selected_model]
    raw_test, deployed_test, _ = deployed_predictions(selected, test_x, threshold)

    anomaly = IsolationForest(n_estimators=200, random_state=SEED, n_jobs=1).fit(train_x[train_y != "DRAIN"])
    records = rolling(selected, anomaly, rows, set(split["test"]), threshold, selected_window)
    ROLLING_PREDICTIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with ROLLING_PREDICTIONS_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)
    rolling_result = rolling_summary(records, rows)
    transition = [row for row in records if row["window_kind"] == "TRANSITION"]
    transition_metrics = decision_quality(
        np.asarray([row["current_behavior"] for row in transition], dtype=object),
        np.asarray([row["predicted_class"] for row in transition], dtype=object),
    ) if transition else {"count": 0}
    _, cpp_policy = run_cpp_policy(SYNTHETIC_DATA_PATH, set(split["test"]))
    with MODEL_COMPARISON_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(comparison[0]))
        writer.writeheader()
        writer.writerows(comparison)
    scores = -anomaly.score_samples(test_x)
    binary = (test_y == "DRAIN").astype(int)
    anomaly_metrics = {"roc_auc": float(roc_auc_score(binary, scores)), "pr_auc": float(average_precision_score(binary, scores)), "benign_false_positive_rate_at_90pct_score": float(np.mean(scores[test_y != "DRAIN"] >= np.quantile(scores, .9)))}

    stress_rows = generate_stress(SyntheticConfig(experiments_per_class=max(20, experiments_per_class // 4), fault_experiments=0, seed=SEED + 99))
    stress_features = extract_windows(stress_rows, selected_window)
    stress_x, stress_y = matrix(stress_features, {str(row["experiment_id"]) for row in stress_features})
    stress_raw, stress_deployed, _ = deployed_predictions(selected, stress_x, threshold)
    stress = {"static_raw": classification_metrics(stress_y, stress_raw), "static_deployed": decision_quality(stress_y, stress_deployed)}

    seed_runs: list[dict[str, Any]] = []
    cpp_seed_runs: list[dict[str, Any]] = []
    for seed in BENCHMARK_SEEDS:
        if seed == SEED:
            seed_runs.append({"seed": seed, "metrics": decision_quality(test_y, deployed_test)})
            cpp_seed_runs.append({"seed": seed, "metrics": cpp_policy})
            continue
        seeded_rows = generate(SyntheticConfig(experiments_per_class=experiments_per_class, fault_experiments=fault_experiments, seed=seed))
        seeded_features = extract_windows(seeded_rows, selected_window)
        seeded_split = group_split(seeded_features, seed)
        sx, sy = matrix(seeded_features, set(seeded_split["train"]))
        vx, vy = matrix(seeded_features, set(seeded_split["validation"]))
        tx, ty = matrix(seeded_features, set(seeded_split["test"]))
        seeded_model = models(seed)[selected_model]
        seeded_model.fit(sx, sy)
        seeded_threshold, _ = choose_abstain(seeded_model, vx, vy)
        _, seeded_deployed, _ = deployed_predictions(seeded_model, tx, seeded_threshold)
        seed_runs.append({"seed": seed, "metrics": decision_quality(ty, seeded_deployed)})
        seed_csv = Path(f"/tmp/smartt_synthetic_{seed}.csv")
        write_csv(seeded_rows, seed_csv)
        _, seed_cpp = run_cpp_policy(seed_csv, set(seeded_split["test"]), write_report=False)
        cpp_seed_runs.append({"seed": seed, "metrics": seed_cpp})

    runtime_contract = {"telemetry_period_s": SAMPLE_PERIOD_SECONDS, "expected_samples": int(selected_window / SAMPLE_PERIOD_SECONDS) + 1, "min_coverage": MIN_WINDOW_COVERAGE, "minimum_samples": int(np.ceil((int(selected_window / SAMPLE_PERIOD_SECONDS) + 1) * MIN_WINDOW_COVERAGE))}
    bundle = {"classifier": selected, "anomaly_model": anomaly, "feature_names": FEATURE_NAMES, "window_seconds": selected_window, "sample_period_s": SAMPLE_PERIOD_SECONDS, "min_coverage": MIN_WINDOW_COVERAGE, "abstain_threshold": threshold, "model_version": f"smartt-server-cadence-synthetic-{SEED}", "training_status": "EXPERIMENTAL_SYNTHETIC_SHADOW_ONLY"}
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, MODEL_PATH, compress=3)
    result = {
        "dataset": {"rows": len(rows), "experiments": len(group_rows(rows)), "feature_windows": len(features), "split_counts": {name: len(ids) for name, ids in split.items()}},
        "runtime_contract": runtime_contract, "selected_window_seconds": selected_window, "window_selection": window_selection,
        "selected_model": selected_model, "model_selection": {"validation_scores": validation_decisions, "simple_model_tolerance": .01},
        "model_comparison": comparison, "steady_raw": classification_metrics(test_y, raw_test), "steady_deployed": decision_quality(test_y, deployed_test),
        "transition": transition_metrics, "rolling": rolling_result, "cpp_policy": cpp_policy, "anomaly": anomaly_metrics,
        "stress": stress, "multi_seed": summarize_seed_runs(seed_runs),
        "cpp_policy_multi_seed": {
            "theft_alert_recall": summarize_seed_metric(cpp_seed_runs, "theft_alert_recall"),
            "false_alert_rate_noneligible": summarize_seed_metric(cpp_seed_runs, "false_alert_rate_noneligible"),
        }, "abstain_threshold": threshold,
        "environment": {"python": platform.python_version(), "numpy": np.__version__, "scikit_learn": sklearn.__version__, "joblib": joblib.__version__},
    }
    METRICS_PATH.write_text(json.dumps(result, indent=2))
    METADATA_PATH.write_text(json.dumps({**bundle, "classifier": "serialized separately", "anomaly_model": "serialized separately"}, default=str, indent=2))
    FEATURE_SCHEMA_PATH.write_text(json.dumps({"feature_names": FEATURE_NAMES, "forbidden_inputs": sorted(FORBIDDEN_FEATURE_FIELDS), "window_seconds": selected_window, "sample_period_s": SAMPLE_PERIOD_SECONDS, "min_coverage": MIN_WINDOW_COVERAGE}, indent=2))
    REPORT_PATH.write_text(render_report(result))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--experiments-per-class", type=int, default=120)
    parser.add_argument("--fault-experiments", type=int, default=16)
    options = parser.parse_args()
    print(json.dumps(run(options.experiments_per_class, options.fault_experiments), indent=2))
