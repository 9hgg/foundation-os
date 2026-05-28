"""Tests for libs/ml/tracing.py — RichTracer methods."""

from __future__ import annotations

from io import StringIO

from rich.console import Console

from libs.ml.tracing import RichTracer


def _tracer() -> tuple[RichTracer, StringIO]:
    buf = StringIO()
    tracer = RichTracer(console=Console(file=buf, width=120))
    return tracer, buf


def _disabled_tracer() -> tuple[RichTracer, StringIO]:
    buf = StringIO()
    tracer = RichTracer(console=Console(file=buf, width=120), enabled=False)
    return tracer, buf


# ─── Enabled tracer ───────────────────────────────────────────────────────────

def test_line_writes_output() -> None:
    t, buf = _tracer()
    t.line("hello world")
    assert "hello world" in buf.getvalue()


def test_kv_writes_output() -> None:
    t, buf = _tracer()
    t.kv("My Panel", [("key1", "value1"), ("key2", 42)])
    out = buf.getvalue()
    assert "key1" in out
    assert "value1" in out


def test_text_block_writes_output() -> None:
    t, buf = _tracer()
    t.text_block("Title", "some content")
    assert "some content" in buf.getvalue()


def test_text_block_empty_content() -> None:
    t, buf = _tracer()
    t.text_block("Title", "")
    assert "<empty>" in buf.getvalue()


def test_text_block_with_language() -> None:
    t, buf = _tracer()
    t.text_block("Code", 'print("hello")', language="python")
    assert "hello" in buf.getvalue()


def test_json_block_writes_output() -> None:
    t, buf = _tracer()
    t.json_block("Data", {"key": "value"})
    assert "value" in buf.getvalue()


def test_section_context_manager() -> None:
    t, buf = _tracer()
    with t.section("My Section"):
        t.line("inside section")
    assert "My Section" in buf.getvalue()
    assert "inside section" in buf.getvalue()


def test_section_with_subtitle() -> None:
    t, buf = _tracer()
    with t.section("Section", subtitle="sub"):
        pass
    assert "sub" in buf.getvalue()


def test_nested_sections_indent() -> None:
    t, buf = _tracer()
    with t.section("Outer"):
        with t.section("Inner"):
            t.line("deep")
    assert "deep" in buf.getvalue()


# ─── Disabled tracer produces no output ──────────────────────────────────────

def test_disabled_line_no_output() -> None:
    t, buf = _disabled_tracer()
    t.line("should not appear")
    assert buf.getvalue() == ""


def test_disabled_section_no_output() -> None:
    t, buf = _disabled_tracer()
    with t.section("hidden"):
        pass
    assert buf.getvalue() == ""


def test_disabled_kv_no_output() -> None:
    t, buf = _disabled_tracer()
    t.kv("title", [("k", "v")])
    assert buf.getvalue() == ""


def test_disabled_text_block_no_output() -> None:
    t, buf = _disabled_tracer()
    t.text_block("T", "content")
    assert buf.getvalue() == ""


def test_disabled_json_block_no_output() -> None:
    t, buf = _disabled_tracer()
    t.json_block("T", {"k": 1})
    assert buf.getvalue() == ""
