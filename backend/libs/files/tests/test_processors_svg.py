"""Tests for SVG text extraction and ImageProcessor SVG support."""

import os
from unittest.mock import MagicMock

import pytest

from libs.files.models import ExtraDetailsFile, File
from libs.files.processors.image import ImageProcessor
from libs.files.storage import GenericStorage
from libs.svg import extract_text_from_svg

# ---------------------------------------------------------------------------
# extract_text_from_svg unit tests
# ---------------------------------------------------------------------------

_SIMPLE_SVG = """<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <text x="10" y="20">Hello</text>
  <text x="10" y="40">
    <tspan>World</tspan>
  </text>
  <text x="10" y="60">Hello</text>
</svg>"""

_NO_TEXT_SVG = """<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <rect width="50" height="50"/>
</svg>"""

_WHITESPACE_SVG = """<svg xmlns="http://www.w3.org/2000/svg">
  <text>   </text>
  <text>
  </text>
  <text>Label</text>
</svg>"""

_NS_FREE_SVG = """<svg width="100" height="100">
  <text>NoNS</text>
  <text><tspan>Nested</tspan></text>
</svg>"""


def test_extract_text_from_simple_svg():
    texts = extract_text_from_svg(_SIMPLE_SVG)
    assert "Hello" in texts
    assert "World" in texts


def test_extract_text_deduplicates():
    texts = extract_text_from_svg(_SIMPLE_SVG)
    assert texts.count("Hello") == 1


def test_extract_text_preserves_order():
    texts = extract_text_from_svg(_SIMPLE_SVG)
    hello_index = texts.index("Hello")
    world_index = texts.index("World")
    assert hello_index < world_index


def test_extract_text_empty_when_no_text_elements():
    texts = extract_text_from_svg(_NO_TEXT_SVG)
    assert texts == []


def test_extract_text_ignores_whitespace_only():
    texts = extract_text_from_svg(_WHITESPACE_SVG)
    assert "Label" in texts
    assert all(t.strip() for t in texts)


def test_extract_text_without_namespace():
    texts = extract_text_from_svg(_NS_FREE_SVG)
    assert "NoNS" in texts
    assert "Nested" in texts


def test_extract_text_from_real_svg():
    """Smoke-test against the real Curiosity example.svg (if present)."""
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../.."))
    real_path = os.path.join(repo_root, "frontend", "apps", "curiosity", "src", "assets", "example.svg")
    if not os.path.exists(real_path):
        pytest.skip("example.svg not found in repo")

    with open(real_path, encoding="utf-8", errors="replace") as fh:
        content = fh.read()

    texts = extract_text_from_svg(content)
    assert len(texts) > 100  # plenty of labels in the mechanical schema
    assert all(isinstance(t, str) and t.strip() for t in texts)


# ---------------------------------------------------------------------------
# ImageProcessor SVG branch unit tests
# ---------------------------------------------------------------------------


@pytest.fixture()
def mock_storage():
    storage = MagicMock(spec=GenericStorage)
    storage.exists_in_storage.return_value = False
    storage.upload.return_value = True
    return storage


@pytest.fixture()
def mock_file():
    file_db = MagicMock(spec=File)
    file_db.extra_ = ExtraDetailsFile()
    file_db.extension = ".svg"
    file_db.extension_client = ".svg"
    file_db.original_filename = "schema.svg"
    return file_db


def _make_image_processor(mock_file, mock_storage, svg_content: str, tmp_path):
    """Create an ImageProcessor pointing at a real SVG file on disk with mocked storage."""
    local_svg = tmp_path / "schema.svg"
    local_svg.write_text(svg_content, encoding="utf-8")

    processor = object.__new__(ImageProcessor)
    processor.file_db = mock_file
    processor.storage = mock_storage
    processor.local_path = str(local_svg)
    processor.storage_folder_path = "some/folder/path"
    processor.file_downloaded = True
    return processor


def test_image_processor_svg_generates_text_alternative(mock_storage, mock_file, tmp_path):
    processor = _make_image_processor(mock_file, mock_storage, _SIMPLE_SVG, tmp_path)
    alternatives = processor.generate_alternatives(force=True)

    assert len(alternatives) == 1
    alt = alternatives[0]
    assert alt.storage_suffix == "text"
    assert alt.mime == "text/plain"
    assert alt.extension == ".txt"
    assert alt.kind == "text"
    mock_storage.upload.assert_called_once()


def test_image_processor_svg_skips_when_alternative_exists(mock_storage, mock_file, tmp_path):
    mock_storage.exists_in_storage.return_value = True
    processor = _make_image_processor(mock_file, mock_storage, _SIMPLE_SVG, tmp_path)
    alternatives = processor.generate_alternatives(force=False)

    assert alternatives == []
    mock_storage.upload.assert_not_called()


def test_image_processor_svg_no_alternatives_when_no_text(mock_storage, mock_file, tmp_path):
    processor = _make_image_processor(mock_file, mock_storage, _NO_TEXT_SVG, tmp_path)
    alternatives = processor.generate_alternatives(force=True)

    assert alternatives == []
    mock_storage.upload.assert_not_called()

