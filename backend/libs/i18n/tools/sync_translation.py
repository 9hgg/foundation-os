from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import typer

from libs.db import context_db
from libs.i18n.models import Translation

app = typer.Typer(
    help="Sync translations between DB and a versioned JSON file.",
    no_args_is_help=True,
)

VALID_POLICIES = {"keep-db", "keep-json", "keep-both", "skip"}
DEFAULT_FILE = Path("libs/i18n/tools/translations.seed.json")


def _normalize_context(value: str | None) -> str:
    return value or ""


def _compute_hash(source_content: str, translation_context: str | None) -> str:
    if translation_context:
        payload = source_content + "{{" + translation_context + "}}"
    else:
        payload = source_content
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _key_from_dict(record: dict[str, Any]) -> tuple[str, str, str, str]:
    return (
        str(record.get("source_content") or ""),
        _normalize_context(record.get("translation_context")),
        str(record.get("language_target") or ""),
        str(record.get("translator") or "manual"),
    )


def _key_from_translation(record: Translation) -> tuple[str, str, str, str]:
    return (
        record.source_content,
        _normalize_context(record.translation_context),
        record.language_target,
        record.translator or "manual",
    )


def _serialize_translation(record: Translation) -> dict[str, Any]:
    return {
        "source_content": record.source_content,
        "translation_context": record.translation_context,
        "language_source": record.language_source,
        "language_target": record.language_target,
        "translated_content": record.translated_content,
        "translator": record.translator,
        "version": record.version,
    }


def _read_json_records(file_path: Path) -> list[dict[str, Any]]:
    if not file_path.exists():
        return []

    raw = json.loads(file_path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise typer.BadParameter(f"Expected a JSON list in {file_path}")

    normalized: list[dict[str, Any]] = []
    for idx, record in enumerate(raw):
        if not isinstance(record, dict):
            raise typer.BadParameter(f"Record #{idx + 1} in {file_path} is not an object")

        source_content = record.get("source_content")
        language_target = record.get("language_target")
        translated_content = record.get("translated_content")

        if not source_content or not language_target or translated_content is None:
            raise typer.BadParameter(
                f"Record #{idx + 1} in {file_path} must define source_content, language_target, translated_content"
            )

        normalized.append(
            {
                "source_content": str(source_content),
                "translation_context": record.get("translation_context"),
                "language_source": record.get("language_source"),
                "language_target": str(language_target),
                "translated_content": str(translated_content),
                "translator": str(record.get("translator") or "manual"),
                "version": str(record.get("version") or "manual-sync-v1"),
            }
        )

    return normalized


def _write_json_records(file_path: Path, records: list[dict[str, Any]]) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)

    # Stable output for git diffs.
    sorted_records = sorted(
        records,
        key=lambda r: (
            str(r.get("source_content") or ""),
            _normalize_context(r.get("translation_context")),
            str(r.get("language_target") or ""),
            str(r.get("translator") or ""),
            str(r.get("translated_content") or ""),
            str(r.get("version") or ""),
        ),
    )

    file_path.write_text(json.dumps(sorted_records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _find_json_conflicts(
    json_records: list[dict[str, Any]],
    db_record: Translation,
) -> tuple[list[int], list[int]]:
    same_content: list[int] = []
    conflicts: list[int] = []

    db_key = _key_from_translation(db_record)
    for idx, json_record in enumerate(json_records):
        if _key_from_dict(json_record) != db_key:
            continue

        if (json_record.get("translated_content") or "") == (db_record.translated_content or ""):
            same_content.append(idx)
        else:
            conflicts.append(idx)

    return same_content, conflicts


def _find_db_conflicts(
    db_records: list[Translation],
    json_record: dict[str, Any],
) -> tuple[list[Translation], list[Translation]]:
    same_content: list[Translation] = []
    conflicts: list[Translation] = []

    json_key = _key_from_dict(json_record)
    for db_record in db_records:
        if _key_from_translation(db_record) != json_key:
            continue

        if (db_record.translated_content or "") == (json_record.get("translated_content") or ""):
            same_content.append(db_record)
        else:
            conflicts.append(db_record)

    return same_content, conflicts


def _resolve_conflict(
    *,
    interactive: bool,
    policy: str,
    source_content: str,
    translation_context: str | None,
    language_target: str,
    translator: str,
    db_value: str | None,
    json_value: str | None,
) -> str:
    if not interactive:
        return policy

    typer.echo("\nConflict detected:")
    typer.echo(f"  source: {source_content}")
    typer.echo(f"  context: {translation_context}")
    typer.echo(f"  language_target: {language_target}")
    typer.echo(f"  translator: {translator}")
    typer.echo(f"  DB value  : {db_value}")
    typer.echo(f"  JSON value: {json_value}")

    answer = typer.prompt(
        "Choose resolution [1=keep DB, 2=keep JSON, 3=keep both, 4=skip]",
        default="3",
    ).strip()

    match answer:
        case "1":
            return "keep-db"
        case "2":
            return "keep-json"
        case "3":
            return "keep-both"
        case "4":
            return "skip"
        case _:
            typer.echo("Invalid choice, defaulting to keep both.")
            return "keep-both"


def _validate_policy(value: str) -> str:
    if value not in VALID_POLICIES:
        raise typer.BadParameter("conflict-policy must be one of: keep-db, keep-json, keep-both, skip")
    return value


@app.command("db-to-json")
def db_to_json(
    file_path: Path = typer.Option(DEFAULT_FILE, "--file", help="Destination JSON file."),
    interactive: bool = typer.Option(True, "--interactive/--no-interactive", help="Ask on each conflict."),
    conflict_policy: str = typer.Option(
        "keep-both",
        "--conflict-policy",
        help="Used when --no-interactive. One of: keep-db, keep-json, keep-both, skip.",
        callback=lambda value: _validate_policy(value),
    ),
) -> None:
    """Merge DB translations into a JSON file without dropping existing entries."""
    json_records = _read_json_records(file_path)

    added = 0
    replaced = 0
    skipped = 0

    with context_db() as db:
        db_records = db.query(Translation).all()

    for db_record in db_records:
        same_content, conflicts = _find_json_conflicts(json_records, db_record)

        if same_content:
            continue

        if not conflicts:
            json_records.append(_serialize_translation(db_record))
            added += 1
            continue

        decision = _resolve_conflict(
            interactive=interactive,
            policy=conflict_policy,
            source_content=db_record.source_content,
            translation_context=db_record.translation_context,
            language_target=db_record.language_target,
            translator=db_record.translator or "manual",
            db_value=db_record.translated_content,
            json_value=json_records[conflicts[0]].get("translated_content"),
        )

        if decision == "keep-db":
            json_records[conflicts[0]] = _serialize_translation(db_record)
            replaced += 1
        elif decision == "keep-json" or decision == "skip":
            skipped += 1
        elif decision == "keep-both":
            json_records.append(_serialize_translation(db_record))
            added += 1

    _write_json_records(file_path, json_records)
    typer.echo(
        f"db-to-json complete: {file_path} | added={added} replaced={replaced} skipped={skipped} total={len(json_records)}"
    )


@app.command("json-to-db")
def json_to_db(
    file_path: Path = typer.Option(DEFAULT_FILE, "--file", help="Source JSON file."),
    interactive: bool = typer.Option(True, "--interactive/--no-interactive", help="Ask on each conflict."),
    conflict_policy: str = typer.Option(
        "keep-both",
        "--conflict-policy",
        help="Used when --no-interactive. One of: keep-db, keep-json, keep-both, skip.",
        callback=lambda value: _validate_policy(value),
    ),
) -> None:
    """Merge JSON translations into DB without deleting records."""
    json_records = _read_json_records(file_path)

    created = 0
    updated = 0
    skipped = 0

    with context_db() as db:
        db_records = db.query(Translation).all()

        for json_record in json_records:
            same_content, conflicts = _find_db_conflicts(db_records, json_record)

            if same_content:
                continue

            if not conflicts:
                new_translation = Translation(
                    hash=_compute_hash(json_record["source_content"], json_record.get("translation_context")),
                    source_content=json_record["source_content"],
                    language_source=json_record.get("language_source"),
                    language_target=json_record["language_target"],
                    translated_content=json_record.get("translated_content"),
                    translator=json_record.get("translator") or "manual",
                    version=json_record.get("version") or "manual-sync-v1",
                    translation_context=json_record.get("translation_context"),
                )
                db.add(new_translation)
                db.flush()
                db_records.append(new_translation)
                created += 1
                continue

            decision = _resolve_conflict(
                interactive=interactive,
                policy=conflict_policy,
                source_content=json_record["source_content"],
                translation_context=json_record.get("translation_context"),
                language_target=json_record["language_target"],
                translator=json_record.get("translator") or "manual",
                db_value=conflicts[0].translated_content,
                json_value=json_record.get("translated_content"),
            )

            if decision == "keep-db" or decision == "skip":
                skipped += 1
                continue

            if decision == "keep-json":
                target = conflicts[0]
                target.translated_content = str(json_record.get("translated_content") or "")
                target.language_source = json_record.get("language_source")
                target.version = str(json_record.get("version") or target.version or "manual-sync-v1")
                target.hash = _compute_hash(target.source_content, target.translation_context)
                db.add(target)
                updated += 1
                continue

            if decision == "keep-both":
                new_translation = Translation(
                    hash=_compute_hash(json_record["source_content"], json_record.get("translation_context")),
                    source_content=json_record["source_content"],
                    language_source=json_record.get("language_source"),
                    language_target=json_record["language_target"],
                    translated_content=json_record.get("translated_content"),
                    translator=json_record.get("translator") or "manual",
                    version=json_record.get("version") or "manual-sync-v1",
                    translation_context=json_record.get("translation_context"),
                )
                db.add(new_translation)
                db.flush()
                db_records.append(new_translation)
                created += 1

        db.commit()

    typer.echo(f"json-to-db complete: created={created} updated={updated} skipped={skipped}")


if __name__ == "__main__":
    app()
