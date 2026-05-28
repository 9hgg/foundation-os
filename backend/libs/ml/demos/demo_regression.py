"""Demo: scalar regression with linear and polynomial regressors.

Run with:
    uv run python -m libs.ml.demos.demo_regression
"""

import math

from libs.ml import (
    FeatureVectorInput,
    LinearFeatureVectorRegressor,
    PolynomialFeatureVectorRegressor,
    RegressionPrediction,
)

# y = 3x + 1
LINEAR_TRAIN_X = [1.0, 2.0, 3.0, 4.0, 5.0]
LINEAR_TRAIN_Y = [4.0, 7.0, 10.0, 13.0, 16.0]
LINEAR_TEST_X = [6.0, 7.0, 8.0]
LINEAR_TEST_Y = [19.0, 22.0, 25.0]

# y = x²
POLY_TRAIN_X = [1.0, 2.0, 3.0, 4.0, 5.0]
POLY_TRAIN_Y = [1.0, 4.0, 9.0, 16.0, 25.0]
POLY_TEST_X = [6.0, 7.0, 8.0]
POLY_TEST_Y = [36.0, 49.0, 64.0]


def _rmse(predictions: list[RegressionPrediction], targets: list[float]) -> float:
    return math.sqrt(sum((p.value - t) ** 2 for p, t in zip(predictions, targets, strict=True)) / len(targets))


def run_demo() -> dict[str, object]:
    linear = LinearFeatureVectorRegressor()
    linear.fit(
        [FeatureVectorInput(vector_value=[x]) for x in LINEAR_TRAIN_X],
        LINEAR_TRAIN_Y,
    )
    linear_preds = linear.regress([FeatureVectorInput(vector_value=[x]) for x in LINEAR_TEST_X])
    linear_rmse = _rmse(linear_preds, LINEAR_TEST_Y)

    poly = PolynomialFeatureVectorRegressor(degree=2)
    poly.fit([FeatureVectorInput(vector_value=[x]) for x in POLY_TRAIN_X], POLY_TRAIN_Y)
    poly_preds = poly.regress([FeatureVectorInput(vector_value=[x]) for x in POLY_TEST_X])
    poly_rmse = _rmse(poly_preds, POLY_TEST_Y)

    return {
        "linear": {
            "rmse": round(linear_rmse, 6),
            "predictions": [round(p.value, 2) for p in linear_preds],
            "expected": LINEAR_TEST_Y,
        },
        "polynomial": {
            "degree": 2,
            "rmse": round(poly_rmse, 6),
            "predictions": [round(p.value, 2) for p in poly_preds],
            "expected": POLY_TEST_Y,
        },
    }


if __name__ == "__main__":
    results = run_demo()
    for name, info in results.items():
        print(f"\n{name} regressor (rmse={info['rmse']}):")
        for pred, expected in zip(info["predictions"], info["expected"], strict=True):
            print(f"  predicted={pred:>8.2f}  expected={expected}")
