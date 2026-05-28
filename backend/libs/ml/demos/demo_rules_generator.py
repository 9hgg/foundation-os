"""Rule induction pipeline — generic text-classification helper.

Given a list of (text, label) pairs this module:
  1. Builds a stem → original-word vocabulary map
  2. Runs chi2 motif analysis (unigrams + bigrams, stemmed) per class
  3. Displays top motifs per class with scores and corpus snippets
  4. Induces a LinguisticKeywordTextClassifier from the top motifs
  5. Evaluates it: confusion matrix, per-class metrics, misclassified examples

Entry points
────────────
  run_rule_induction(texts, labels, ...)  — full pipeline, returns classifier + rules
  main()                                  — example run on the EDF Diesel BPE dataset
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from rich import box
from rich.console import Console
from rich.table import Table
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.feature_selection import chi2
from sklearn.metrics import classification_report, confusion_matrix

from pydantic import BaseModel

from libs.ml.llm.client import LLMClient, LLMMessage
from libs.ml.llm.structured import StructuredCompletionError, structured_completion
from libs.ml.methods.linguistic_keyword_classifier import LinguisticKeywordTextClassifier
from libs.ml.models import TextInput
from libs.ml.processing.text.basic import extract_text_tokens, tokenize_and_stem_text

console = Console()


# ─── Config defaults ──────────────────────────────────────────────────────────

MIN_DF = 2
TOP_K_DISPLAY = 20          # terms shown per class in the chi2 table
MAX_TERMS_PER_CLASS = 500   # ceiling for rule candidates collected from corpus
MIN_DISCRIMINATIVITY = 3.0  # chi2(cls) / max(chi2(others)) threshold to become a rule
P_VALUE_THRESHOLD = 0.05
EXAMPLE_SNIPPETS = 2
LANGUAGE = "french"


# ─── Step 1: Stem → word map ──────────────────────────────────────────────────

def build_stem_word_map(texts: list[str], language: str = LANGUAGE) -> dict[str, Counter]:
    """For every stem (unigram or bigram), count its original-word occurrences."""
    stem_to_words: dict[str, Counter] = defaultdict(Counter)
    for text in texts:
        orig = extract_text_tokens(text)
        stems = tokenize_and_stem_text(text, language=language)
        if len(orig) != len(stems):
            msg = f"Token/stem length mismatch for text: {text[:60]!r}"
            raise ValueError(msg)
        for o, s in zip(orig, stems):
            stem_to_words[s][o] += 1
        for i in range(len(stems) - 1):
            stem_to_words[f"{stems[i]} {stems[i + 1]}"][f"{orig[i]} {orig[i + 1]}"] += 1
        for i in range(len(stems) - 2):
            stem_to_words[f"{stems[i]} {stems[i + 1]} {stems[i + 2]}"][f"{orig[i]} {orig[i + 1]} {orig[i + 2]}"] += 1
    return dict(stem_to_words)


def _best_word(stem: str, stem_map: dict[str, Counter]) -> str:
    counts = stem_map.get(stem)
    return counts.most_common(1)[0][0] if counts else stem


# ─── Step 2: Chi2 analysis ────────────────────────────────────────────────────

@dataclass
class TermStats:
    stem: str
    best_word: str
    chi2_score: float
    p_value: float
    discriminativity: float  # chi2_for_class / max(chi2_for_other_classes + ε)
    doc_freq: int
    total_docs: int
    snippets: list[str] = field(default_factory=list)


def _make_analyzer(language: str):
    def analyzer(text: str) -> list[str]:
        tokens = list(tokenize_and_stem_text(text, language=language))
        features = list(tokens)
        for i in range(len(tokens) - 1):
            features.append(f"{tokens[i]} {tokens[i + 1]}")
        for i in range(len(tokens) - 2):
            features.append(f"{tokens[i]} {tokens[i + 1]} {tokens[i + 2]}")
        return features
    return analyzer


def _compute_all_chi2(
    X: Any,
    labels: list[str],
    classes: list[str],
) -> tuple[dict[str, np.ndarray], dict[str, np.ndarray]]:
    all_scores: dict[str, np.ndarray] = {}
    all_pvals: dict[str, np.ndarray] = {}
    n_samples = len(labels)
    for cls in classes:
        y_binary = np.array([1 if lbl == cls else 0 for lbl in labels])
        scores, pvals = chi2(X, y_binary)
        all_scores[cls] = scores
        all_pvals[cls] = pvals
        n_pos = int(y_binary.sum())
        console.print(f"   [{cls}]  {n_pos}/{n_samples} positive")
    return all_scores, all_pvals


def _compute_discriminativity(
    all_scores: dict[str, np.ndarray],
    classes: list[str],
) -> dict[str, np.ndarray]:
    """discrim[cls][i] = chi2(cls, i) / max_{other cls}(chi2(other_cls, i) + ε)."""
    epsilon = 1e-6
    stacked = np.stack([all_scores[cls] for cls in classes])
    discrim: dict[str, np.ndarray] = {}
    for j, cls in enumerate(classes):
        other_max = np.max(np.delete(stacked, j, axis=0), axis=0)
        discrim[cls] = all_scores[cls] / (other_max + epsilon)
    return discrim


def _detect_corpus_stopwords(
    feature_names: np.ndarray,
    all_scores: dict[str, np.ndarray],
    all_pvals: dict[str, np.ndarray],
    discrim: dict[str, np.ndarray],
    classes: list[str],
    p_threshold: float,
    threshold: float,
) -> set[str]:
    stacked_scores = np.stack([all_scores[cls] for cls in classes])
    any_significant = np.any(
        np.stack([all_pvals[cls] for cls in classes]) <= p_threshold, axis=0
    )
    max_discrim_ratio = np.max(np.stack([discrim[cls] for cls in classes]), axis=0)
    mask = any_significant & (max_discrim_ratio < threshold)
    stopwords = set(feature_names[mask].tolist())

    if stopwords:
        max_scores = np.max(stacked_scores, axis=0)
        top = sorted(stopwords, key=lambda s: float(max_scores[np.where(feature_names == s)[0][0]]), reverse=True)
        console.print(
            f"\n   [dim]Auto-ignored corpus stopwords "
            f"(discriminativity < {threshold} for all classes): {len(stopwords)} terms[/dim]"
        )
        console.print(f"   [dim]Examples: {', '.join(top[:20])}[/dim]")
    return stopwords


def _build_snippet_index(
    texts: list[str],
    labels: list[str],
    analyzer: Any,
) -> dict[str, list[tuple[str, str]]]:
    index: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for text, label in zip(texts, labels):
        seen: set[str] = set()
        for stem in analyzer(text):
            if stem not in seen:
                seen.add(stem)
                index[stem].append((text[:200], label))
    return index


def chi2_analysis(
    texts: list[str],
    labels: list[str],
    stem_map: dict[str, Counter],
    *,
    language: str = LANGUAGE,
    min_df: int = MIN_DF,
    top_k: int = MAX_TERMS_PER_CLASS,
    p_threshold: float = P_VALUE_THRESHOLD,
    n_snippets: int = EXAMPLE_SNIPPETS,
    corpus_stopword_discriminativity: float = 1.5,
) -> dict[str, list[TermStats]]:
    """Compute per-class chi2 scores, auto-detect corpus stopwords, rank by discriminativity.

    Discriminativity for term t in class c = chi2(t, c) / max_{c' ≠ c}(chi2(t, c') + ε).
    Terms with discriminativity >> 1 are class-specific; near 1 means shared across
    classes — auto-excluded as corpus stopwords.
    """
    analyzer = _make_analyzer(language)

    console.print("\n[bold cyan]── Vectorizing corpus[/bold cyan]")
    vectorizer = CountVectorizer(analyzer=analyzer, binary=True, min_df=min_df)
    X = vectorizer.fit_transform(texts)
    feature_names = np.array(vectorizer.get_feature_names_out())
    doc_freqs = np.asarray(X.sum(axis=0)).flatten()
    n_samples, n_features = X.shape
    console.print(
        f"   Samples: {n_samples}  |  Vocabulary: {n_features} stems  "
        f"(min_df={min_df}, unigrams+bigrams+trigrams, language={language!r})"
    )

    classes = sorted(set(labels))
    console.print(f"   Classes: {classes}")

    console.print("\n   Computing chi2 for all classes...")
    all_scores, all_pvals = _compute_all_chi2(X, labels, classes)
    discrim = _compute_discriminativity(all_scores, classes)
    corpus_stopwords = _detect_corpus_stopwords(
        feature_names, all_scores, all_pvals, discrim, classes,
        p_threshold, corpus_stopword_discriminativity,
    )
    snippet_index = _build_snippet_index(texts, labels, analyzer)

    results: dict[str, list[TermStats]] = {}
    for cls in classes:
        n_pos = int(sum(1 for lbl in labels if lbl == cls))
        significant_idx = np.where(
            (all_pvals[cls] <= p_threshold)
            & np.array([fn not in corpus_stopwords for fn in feature_names])
        )[0]

        if not significant_idx.size:
            console.print(f"\n   [red]No discriminative terms for {cls!r}[/red]")
            results[cls] = []
            continue

        sorted_idx = significant_idx[np.argsort(discrim[cls][significant_idx])[::-1]]
        terms: list[TermStats] = []
        for idx in sorted_idx:
            stem = feature_names[idx]
            snippets = [s for s, lbl in snippet_index.get(stem, []) if lbl == cls][:n_snippets]
            terms.append(TermStats(
                stem=stem,
                best_word=_best_word(stem, stem_map),
                chi2_score=float(all_scores[cls][idx]),
                p_value=float(all_pvals[cls][idx]),
                discriminativity=float(discrim[cls][idx]),
                doc_freq=int(doc_freqs[idx]),
                total_docs=n_samples,
                snippets=snippets,
            ))
            if len(terms) >= top_k:
                break

        console.print(
            f"\n   Class [bold yellow]{cls!r}[/bold yellow]  "
            f"({n_pos}/{n_samples} positive)  →  {len(terms)} discriminative terms"
        )
        results[cls] = terms

    return results


# ─── Display ──────────────────────────────────────────────────────────────────

def print_chi2_table(cls: str, terms: list[TermStats]) -> None:
    table = Table(
        title=f"Class [bold]{cls}[/bold] — Top chi2 motifs",
        box=box.ROUNDED,
        show_lines=True,
        min_width=100,
    )
    table.add_column("#", style="dim", width=3)
    table.add_column("Stem", style="cyan", no_wrap=True)
    table.add_column("Best word", style="green", no_wrap=True)
    table.add_column("χ²", justify="right", style="yellow")
    table.add_column("discrim.", justify="right", style="bold green")
    table.add_column("p-val", justify="right", style="magenta")
    table.add_column("freq", justify="right")
    table.add_column("Corpus snippets", overflow="fold", max_width=60)

    for i, t in enumerate(terms, 1):
        pct = t.doc_freq / t.total_docs * 100
        snippets_text = "\n".join(
            f"· {s[:100]}{'…' if len(s) > 100 else ''}" for s in t.snippets
        ) or "—"
        table.add_row(
            str(i), t.stem, t.best_word,
            f"{t.chi2_score:.2f}", f"{t.discriminativity:.1f}x",
            f"{t.p_value:.2e}",
            f"{t.doc_freq} ({pct:.1f}%)", snippets_text,
        )

    console.print(table)


def print_rules(rules: dict[str, list[str]]) -> None:
    table = Table(title="Induced rules", box=box.ROUNDED, show_lines=True)
    table.add_column("Class", style="bold cyan", no_wrap=True)
    table.add_column("n", justify="right", style="dim")
    table.add_column("Keywords", overflow="fold")
    for cls, keywords in sorted(rules.items()):
        kw_text = ", ".join(f"[green]{kw}[/green]" for kw in keywords)
        table.add_row(cls, str(len(keywords)), kw_text)
    console.print(table)


# ─── Evaluation ───────────────────────────────────────────────────────────────

def evaluate(
    classifier: LinguisticKeywordTextClassifier,
    texts: list[str],
    true_labels: list[str],
) -> None:
    inputs = [TextInput(text_value=t) for t in texts]
    predictions = classifier.classify(inputs)
    pred_labels = [p.label_id for p in predictions]
    classes = sorted(set(true_labels) | set(pred_labels))

    console.print("\n[bold cyan]── Classification report[/bold cyan]")
    console.print(classification_report(true_labels, pred_labels, labels=classes, zero_division=0))

    # Confusion matrix
    matrix = confusion_matrix(true_labels, pred_labels, labels=classes)
    cm_table = Table(title="Confusion matrix", box=box.SIMPLE_HEAVY)
    cm_table.add_column("true \\ pred", style="dim")
    for cls in classes:
        cm_table.add_column(cls, justify="right")
    for i, true_cls in enumerate(classes):
        row_sum = matrix[i].sum()
        cm_table.add_row(
            true_cls,
            *[f"{matrix[i][j] / row_sum * 100:.1f}%" if row_sum else "—" for j in range(len(classes))],
        )
    console.print(cm_table)

    # Misclassifications
    wrong = [
        (texts[i], true_labels[i], pred_labels[i], predictions[i].metadata or {})
        for i in range(len(texts))
        if pred_labels[i] != true_labels[i]
    ]
    total = len(texts)
    console.print(
        f"\n[bold cyan]── Misclassifications: {len(wrong)}/{total} "
        f"({len(wrong) / total * 100:.1f}%)[/bold cyan]"
    )
    for text, true, pred, meta in wrong[:20]:
        matched = meta.get("matched_keywords", [])
        console.print(
            f"  true=[cyan]{true}[/cyan]  pred=[red]{pred}[/red]  matched={matched}"
        )
        console.print(f"  [dim]{text[:200]}{'…' if len(text) > 200 else ''}[/dim]\n")

    # Keyword hit distribution per class
    console.print("[bold cyan]── Keyword hit distribution per class[/bold cyan]")
    hit_counts: dict[str, Counter] = defaultdict(Counter)
    for true, pred_obj in zip(true_labels, predictions):
        n_hits = len((pred_obj.metadata or {}).get("matched_keywords", []))
        hit_counts[true][n_hits] += 1

    hit_table = Table(box=box.ROUNDED)
    hit_table.add_column("Class", style="cyan")
    hit_table.add_column("0 hits", justify="right")
    hit_table.add_column("1 hit", justify="right")
    hit_table.add_column("2+ hits", justify="right")
    for cls in sorted(hit_counts):
        c = hit_counts[cls]
        n = sum(c.values())
        two_plus = sum(v for k, v in c.items() if k >= 2)
        hit_table.add_row(
            cls,
            f"{c[0]} ({c[0] / n * 100:.0f}%)",
            f"{c[1]} ({c[1] / n * 100:.0f}%)",
            f"{two_plus} ({two_plus / n * 100:.0f}%)",
        )
    console.print(hit_table)


# ─── LLM refinement ──────────────────────────────────────────────────────────

class _KeywordSuggestions(BaseModel):
    keywords: list[str]
    reasoning: str | None = None


def _collect_mistakes(
    classifier: LinguisticKeywordTextClassifier,
    texts: list[str],
    labels: list[str],
) -> dict[str, list[tuple[str, str]]]:
    """Return {true_label: [(text, predicted_label), ...]} for misclassified samples."""
    inputs = [TextInput(text_value=t) for t in texts]
    predictions = classifier.classify(inputs)
    mistakes: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for text, true, pred in zip(texts, labels, predictions):
        if pred.label_id != true:
            mistakes[true].append((text, pred.label_id or "?"))
    return dict(mistakes)


def _llm_suggest_keywords(
    client: LLMClient,
    cls: str,
    current_keywords: list[str],
    mistakes: list[tuple[str, str]],
    max_samples: int = 10,
) -> list[str]:
    samples_text = "\n\n".join(
        f"[predicted as {pred}]\n{text[:400]}"
        for text, pred in mistakes[:max_samples]
    )
    prompt = "\n".join([
        "You are helping build keyword rules for a text classifier.",
        "",
        f"Class to improve: {cls!r}",
        f"Current keywords for this class: {current_keywords}",
        "",
        f"The following samples SHOULD be classified as {cls!r} but were misclassified:",
        "",
        samples_text,
        "",
        "Suggest 5-10 new keywords or short phrases (in the same language as the samples)",
        "that would match these samples and help distinguish them from other classes.",
        f"Focus on terms that appear in the samples above and are specific to {cls!r}.",
        "Return only terms that would NOT match typical samples from other classes.",
    ])
    messages = [LLMMessage(role="user", content=prompt)]
    try:
        result = structured_completion(client, messages, _KeywordSuggestions, temperature=0.0)
    except StructuredCompletionError:
        console.print(f"   [red]LLM call failed for class {cls!r}[/red]")
        return []
    else:
        if result.reasoning:
            console.print(f"   [dim]LLM reasoning: {result.reasoning[:200]}[/dim]")
        return result.keywords


def refine_rules_with_llm(
    classifier: LinguisticKeywordTextClassifier,
    rules: dict[str, list[str]],
    texts: list[str],
    labels: list[str],
    *,
    client: LLMClient,
    default_label: str,
    language: str = LANGUAGE,
    n_rounds: int = 2,
    max_samples_per_class: int = 10,
) -> tuple[LinguisticKeywordTextClassifier, dict[str, list[str]]]:
    """Iteratively refine rules using LLM suggestions on misclassified samples.

    Each round:
      1. Classify all samples with the current classifier
      2. For each class that has misclassifications, ask the LLM for new keywords
      3. Add the suggested keywords to the rules and rebuild the classifier
      4. Re-evaluate and log the improvement
    """
    rules = {cls: list(kws) for cls, kws in rules.items()}  # defensive copy

    for round_idx in range(1, n_rounds + 1):
        console.print(f"\n[bold blue]Refinement round {round_idx}/{n_rounds}[/bold blue]")

        mistakes = _collect_mistakes(classifier, texts, labels)
        total_wrong = sum(len(v) for v in mistakes.values())
        total = len(texts)
        console.print(f"   Misclassifications before this round: {total_wrong}/{total} ({total_wrong / total * 100:.1f}%)")

        if not mistakes:
            console.print("   [green]No misclassifications — stopping refinement early[/green]")
            break

        # Per-class mistake breakdown
        for true_cls, samples in sorted(mistakes.items()):
            pred_counts = Counter(pred for _, pred in samples)
            console.print(
                f"   Class [cyan]{true_cls}[/cyan]: {len(samples)} wrong  "
                + "  ".join(f"→{pred}({n})" for pred, n in pred_counts.most_common())
            )

        # Ask LLM for new keywords for each class with mistakes
        any_new = False
        for true_cls, samples in sorted(mistakes.items()):
            console.print(f"\n   [bold yellow]Asking LLM for keywords for {true_cls!r}[/bold yellow]  ({len(samples)} mistakes)")
            current = rules.get(true_cls, [])
            suggested = _llm_suggest_keywords(client, true_cls, current, samples, max_samples_per_class)
            if suggested:
                console.print(f"   LLM suggested: {suggested}")
                new_keywords = [kw for kw in suggested if kw not in current]
                rules[true_cls] = current + new_keywords
                console.print(f"   Added {len(new_keywords)} new keywords → total: {len(rules[true_cls])}")
                any_new = True
            else:
                console.print("   [dim]No new keywords suggested[/dim]")

        if any_new:
            classifier = LinguisticKeywordTextClassifier(
                rules=rules, language=language, default_label=default_label,
            )
        else:
            console.print("   [dim]No new keywords in this round[/dim]")

        console.print(f"\n[bold cyan]── Round {round_idx} evaluation[/bold cyan]")
        evaluate(classifier, texts, labels)

        if not any_new:
            break

    console.rule("[bold cyan]Final state after refinement[/bold cyan]")
    evaluate(classifier, texts, labels)
    print_rules(rules)

    return classifier, rules


# ─── Full pipeline ────────────────────────────────────────────────────────────

def run_rule_induction(
    texts: list[str],
    labels: list[str],
    *,
    default_label: str,
    language: str = LANGUAGE,
    min_df: int = MIN_DF,
    top_k_display: int = TOP_K_DISPLAY,
    min_discriminativity: float = MIN_DISCRIMINATIVITY,
    p_threshold: float = P_VALUE_THRESHOLD,
    run_eval: bool = True,
) -> tuple[LinguisticKeywordTextClassifier, dict[str, list[str]]]:
    """Run the full rule induction pipeline and return (classifier, rules).

    Args:
        texts:                One string per sample (pre-extracted, any language).
        labels:               Corresponding class labels.
        default_label:        Label assigned when no rule matches (the "fallback" class).
        language:             Snowball stemmer language.
        min_df:               Minimum document frequency for a stem to be considered.
        top_k_display:        How many top terms to show per class in the chi2 table.
        min_discriminativity: chi2(cls)/max(chi2(others)) threshold — all terms above
                              this become rules (no arbitrary count cap).
        p_threshold:          Chi2 p-value significance cutoff.
        run_eval:             Whether to run evaluation after building the classifier.
    """
    console.print("\n[bold blue]Step 2 — Building stem→word vocabulary map[/bold blue]")
    stem_map = build_stem_word_map(texts, language=language)
    console.print(f"   {len(stem_map)} unique stems (unigrams+bigrams+trigrams)")

    console.print("\n[bold blue]Step 3 — Chi2 motif analysis[/bold blue]")
    chi2_results = chi2_analysis(
        texts, labels, stem_map,
        language=language, min_df=min_df,
        top_k=MAX_TERMS_PER_CLASS,  # collect everything; display is capped separately
        p_threshold=p_threshold,
    )

    console.print(f"\n[bold blue]Step 4 — Top {top_k_display} motifs per class (by discriminativity)[/bold blue]")
    for cls, terms in sorted(chi2_results.items()):
        if terms:
            print_chi2_table(cls, terms[:top_k_display])
        else:
            console.print(f"\n[red]No significant terms for class {cls!r}[/red]")

    console.print(f"\n[bold blue]Step 5 — Induced rules (discriminativity ≥ {min_discriminativity})[/bold blue]")
    rules: dict[str, list[str]] = {
        cls: [t.best_word for t in terms if t.discriminativity >= min_discriminativity]
        for cls, terms in chi2_results.items()
        if terms
    }
    for cls, terms in sorted(chi2_results.items()):
        n_rules = len(rules.get(cls, []))
        n_candidates = len(terms)
        console.print(
            f"   [cyan]{cls}[/cyan]: {n_rules}/{n_candidates} terms pass "
            f"discriminativity ≥ {min_discriminativity}"
        )
    print_rules(rules)
    console.print(
        f"\n   default_label=[cyan]{default_label!r}[/cyan]  "
        f"(samples matching no rule)  |  "
        f"Total keywords: {sum(len(v) for v in rules.values())}"
    )

    console.print("\n[bold blue]Step 6 — Instantiating LinguisticKeywordTextClassifier[/bold blue]")
    classifier = LinguisticKeywordTextClassifier(
        rules=rules, language=language, default_label=default_label,
    )
    total_stems = sum(len(v) for v in classifier._stemmed_rules.values())
    console.print(f"   Stemmed rule vocabulary: {total_stems} stems")

    if run_eval:
        console.print("\n[bold blue]Step 7 — Evaluation on full dataset[/bold blue]")
        evaluate(classifier, texts, labels)

    return classifier, rules


# ─── EDF example entry point ──────────────────────────────────────────────────

def _edf_texts_and_labels() -> tuple[list[str], list[str], str]:
    """Load EDF Diesel BPE Fd dataset and return (texts, labels, default_label)."""
    from libs.ml.demos.demo_benchmark import _make_edf_diesel_bpe_fd_dataset

    _TEXT_FIELDS = ["RF", "Résumé 1", "Résumé 2"]

    def _to_text(sample: Any) -> str:
        raw = sample.input.json_value
        data = raw if isinstance(raw, dict) else json.loads(raw)
        parts = [str(data.get(f) or "").strip() for f in _TEXT_FIELDS]
        return " ".join(p for p in parts if p)

    dataset = _make_edf_diesel_bpe_fd_dataset()
    labeled = dataset.labeled_samples()
    texts = [_to_text(s) for s in labeled]
    labels = [s.target.label_id for s in labeled]
    return texts, labels, "<fd>0.0"


def _print_dataset_summary(texts: list[str], labels: list[str]) -> None:
    label_counts = Counter(labels)
    total = len(texts)

    dist_table = Table(title="Class distribution", box=box.ROUNDED)
    dist_table.add_column("Class", style="cyan")
    dist_table.add_column("n", justify="right")
    dist_table.add_column("%", justify="right")
    dist_table.add_column("First example", overflow="fold", max_width=80)
    for cls in sorted(label_counts):
        first_idx = next(i for i, lbl in enumerate(labels) if lbl == cls)
        sample = texts[first_idx].strip().replace("\n", " ")
        dist_table.add_row(
            cls,
            str(label_counts[cls]),
            f"{label_counts[cls] / total * 100:.1f}%",
            f"{sample[:120]}{'…' if len(sample) > 120 else ''}",
        )
    console.print(dist_table)


def _build_llm_client() -> LLMClient:
    import os
    from libs.ml.llm import OpenAILLMClient
    return OpenAILLMClient(
        model=os.getenv("OPENAI_MODEL", "gpt-5.4-nano").strip(),
        api_key_env="OPENAI_API_KEY",
    )


def main(*, skip_llm: bool = False, n_refinement_rounds: int = 2) -> None:
    console.rule("[bold green]Rule Induction Demo — EDF Diesel BPE Fd[/bold green]")

    console.print("\n[bold blue]Step 1 — Loading dataset[/bold blue]")
    texts, labels, default_label = _edf_texts_and_labels()
    console.print(f"   {len(texts)} labeled samples")
    _print_dataset_summary(texts, labels)

    classifier, rules = run_rule_induction(texts, labels, default_label=default_label)

    if not skip_llm:
        console.rule("[bold green]LLM refinement[/bold green]")
        client = _build_llm_client()
        console.print(f"   Client: {client.__class__.__name__}  model={getattr(client, 'model', '?')!r}")
        refine_rules_with_llm(
            classifier, rules, texts, labels,
            client=client,
            default_label=default_label,
            n_rounds=n_refinement_rounds,
        )
    else:
        console.print("\n[dim]LLM refinement skipped (--skip-llm)[/dim]")

    console.rule("[bold green]Done[/bold green]")


if __name__ == "__main__":
    import sys
    main(skip_llm="--skip-llm" in sys.argv)
