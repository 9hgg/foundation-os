from libs.ml.processing.json import StructuredJsonVectorizer


def test_structured_json_vectorizer_detects_typed_fields() -> None:
    vectorizer = StructuredJsonVectorizer()
    records = [
        {
            "age": 27,
            "is_active": True,
            "segment": "retail",
            "message": "Need help with invoice details and setup.",
            "created_at": "2026-05-01T12:30:00",
            "profile": {"country": "FR"},
        },
        {
            "age": 41,
            "is_active": False,
            "segment": "enterprise",
            "message": "Please explain premium security package options.",
            "created_at": "2026-05-03T08:10:00",
            "profile": {"country": "US"},
        },
    ]

    features = vectorizer.fit_transform(records)

    assert features.shape[0] == len(records)
    assert vectorizer.field_types_["age"] == "numerical"
    assert vectorizer.field_types_["is_active"] == "boolean"
    assert vectorizer.field_types_["created_at"] == "datetime"
    assert vectorizer.field_types_["segment"] == "categorical"
    assert vectorizer.field_types_["message"] == "text"
    assert vectorizer.field_types_["profile.country"] == "categorical"


def test_structured_json_vectorizer_keeps_train_inference_feature_mapping() -> None:
    vectorizer = StructuredJsonVectorizer()
    train_records = [
        {
            "age": 20,
            "is_active": True,
            "segment": "retail",
            "message": "Need quick support for billing issue.",
            "created_at": "2026-05-01T12:30:00",
            "profile": {"country": "FR"},
        },
        {
            "age": 60,
            "is_active": False,
            "segment": "enterprise",
            "message": "Looking for annual contract pricing details.",
            "created_at": "2026-05-04T09:00:00",
            "profile": {"country": "US"},
        },
    ]

    train_features = vectorizer.fit_transform(train_records)
    inference_features = vectorizer.transform(
        [
            {
                "age": 31,
                "is_active": True,
                "segment": "unknown_segment",
                "message": "New user asking onboarding question.",
                "created_at": "2026-05-06T14:50:00",
                "profile": {"country": "DE"},
            },
            {
                "age": 45,
                "is_active": False,
                "message": "Potential security alert with login failures.",
                "created_at": "2026-05-09T11:22:00",
                "profile": {"country": "FR"},
            },
        ]
    )

    assert train_features.shape[1] == inference_features.shape[1]
    assert inference_features.shape[0] == 2
