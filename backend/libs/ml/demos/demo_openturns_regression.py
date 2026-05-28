"""Demo: scalar regression with OpenTURNS linear model.

Run with:
    uv run python -m libs.ml.demos.demo_openturns_regression
"""

import math

from libs.ml import FeatureVectorInput, OpenTurnsRegressor, RegressionPrediction

TRAIN_X = [1.0, 2.0, 3.0, 4.0, 5.0]
TRAIN_Y = [4.0, 7.0, 10.0, 13.0, 16.0]  # y = 3x + 1
TEST_X = [6.0, 7.0, 8.0]
TEST_Y = [19.0, 22.0, 25.0]


def _rmse(predictions: list[RegressionPrediction], targets: list[float]) -> float:
    return math.sqrt(sum((p.value - t) ** 2 for p, t in zip(predictions, targets, strict=True)) / len(targets))


def run_demo() -> dict[str, object]:
    regressor = OpenTurnsRegressor()
    regressor.fit([FeatureVectorInput(vector_value=[x]) for x in TRAIN_X], TRAIN_Y)
    predictions = regressor.regress([FeatureVectorInput(vector_value=[x]) for x in TEST_X])

    return {
        "rmse": round(_rmse(predictions, TEST_Y), 6),
        "predictions": [round(item.value, 2) for item in predictions],
        "expected": TEST_Y,
    }


if __name__ == "__main__":
    try:
        result = run_demo()
    except ImportError as error:
        print(f"OpenTURNS is not installed: {error}")
    else:
        print(f"\nopenturns regressor (rmse={result['rmse']}):")
        for predicted, expected in zip(result["predictions"], result["expected"], strict=True):
            print(f"  predicted={predicted:>8.2f}  expected={expected}")
