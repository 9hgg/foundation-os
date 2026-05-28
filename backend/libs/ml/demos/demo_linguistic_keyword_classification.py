"""Demo: linguistic (stemming-based) keyword classification.

Unlike KeywordClassifier which does exact substring matching, LinguisticKeywordClassifier
stems both keywords and input text so morphological variants match transparently.

Run with:
    uv run python -m libs.ml.demos.demo_linguistic_keyword_classification
"""

from libs.ml import LinguisticKeywordTextClassifier, TextInput

RULES = {
    "corrosion": ["corrosion", "oxydation", "rouille", "rouiller"],
    "fuite": ["fuite", "fuir", "écoulement", "suintement"],
    "vibration": ["vibration", "vibrer", "tremblement", "bruit"],
    "surchauffe": ["surchauffe", "chauffe", "température", "chaleur"],
}

SAMPLES = [
    "Présence de corrosion sur les ancrages",
    "Fuites détectées au niveau des joints",
    "Bruits et vibrations anormaux sur le moteur",
    "Température excessive des paliers",
    "Oxydation des structures environnantes",
    "Aucune anomalie observée",
]

EXPECTED = ["corrosion", "fuite", "vibration", "surchauffe", "corrosion", "__unknown__"]


def run_demo() -> list[dict[str, object]]:
    classifier = LinguisticKeywordTextClassifier(rules=RULES, language="french")
    predictions = classifier.classify([TextInput(text_value=sample) for sample in SAMPLES])
    return [
        {
            "sample": sample,
            "label": pred.label,
            "expected": expected,
            "ok": pred.label == expected,
        }
        for sample, pred, expected in zip(SAMPLES, predictions, EXPECTED, strict=True)
    ]


if __name__ == "__main__":
    results = run_demo()
    correct = sum(r["ok"] for r in results)
    for r in results:
        mark = "✓" if r["ok"] else "✗"
        print(f"  {mark} [{r['label']:12}] {r['sample']}")
    print(f"\naccuracy: {correct}/{len(results)}")
