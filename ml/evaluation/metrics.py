from __future__ import annotations

from typing import Iterable

import numpy as np
from sklearn.metrics import classification_report, confusion_matrix, f1_score

from ml.config import TARGET_CLASSES


def classification_metrics(y_true: Iterable[str], y_pred: Iterable[str]) -> dict[str, object]:
    truth = list(y_true)
    predictions = list(y_pred)
    labels = list(TARGET_CLASSES)
    report = classification_report(truth, predictions, labels=labels, output_dict=True, zero_division=0)
    matrix = confusion_matrix(truth, predictions, labels=labels)
    drain_total = max(1, sum(value == "DRAIN" for value in truth))
    benign_total = max(1, sum(value != "DRAIN" for value in truth))
    false_theft = sum(actual != "DRAIN" and predicted == "DRAIN" for actual, predicted in zip(truth, predictions))
    missed_drain = sum(actual == "DRAIN" and predicted != "DRAIN" for actual, predicted in zip(truth, predictions))

    def confusion_rate(source: str) -> float:
        total = max(1, sum(actual == source for actual in truth))
        return sum(actual == source and predicted == "DRAIN" for actual, predicted in zip(truth, predictions)) / total

    return {
        "confusion_matrix": matrix.tolist(),
        "labels": labels,
        "per_class": {label: report[label] for label in labels},
        "macro_f1": float(f1_score(truth, predictions, labels=labels, average="macro", zero_division=0)),
        "drain_recall": 1.0 - missed_drain / drain_total,
        "missed_drain_rate": missed_drain / drain_total,
        "false_theft_rate": false_theft / benign_total,
        "normal_to_drain_rate": confusion_rate("NORMAL"),
        "sloshing_to_drain_rate": confusion_rate("SLOSHING"),
        "refuel_to_drain_rate": confusion_rate("REFUEL"),
        "count": len(truth),
    }


def multiclass_expected_calibration_error(probabilities: np.ndarray, truth_indices: np.ndarray,
                                          bins: int = 10) -> float:
    confidence = probabilities.max(axis=1)
    correct = probabilities.argmax(axis=1) == truth_indices
    result = 0.0
    boundaries = np.linspace(0.0, 1.0, bins + 1)
    for low, high in zip(boundaries[:-1], boundaries[1:]):
        selected = (confidence > low) & (confidence <= high)
        if np.any(selected):
            result += float(np.mean(selected)) * abs(float(np.mean(correct[selected])) - float(np.mean(confidence[selected])))
    return result
