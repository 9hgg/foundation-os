import os
from pathlib import Path
import tempfile
from unittest.mock import MagicMock, patch

import pytest

from libs.files.models import ExtraDetailsFile, File
from libs.files.processors.document import DocumentProcessor, NoLocalPathError, NoStorageAvailableError, NoStorageFolderPathError
from libs.files.storage import GenericStorage


@pytest.fixture
def mock_storage():
    storage = MagicMock(spec=GenericStorage)
    storage.exists_in_storage.return_value = False
    storage.upload.return_value = True
    return storage


@pytest.fixture
def mock_file():
    file_db = MagicMock(spec=File)
    file_db.extra_ = ExtraDetailsFile()
    file_db.extension = ".docx"
    file_db.extension_client = ".docx"
    file_db.original_filename = "contract.docx"
    return file_db


@pytest.fixture
def sample_doc_path(tmp_path):
    path = tmp_path / "sample.docx"
    path.write_bytes(b"doc")
    return str(path)


def _tmp_file_factory(tmp_path, suffix, content=b"data"):
    path = tmp_path / f"generated{suffix}"
    path.write_bytes(content)
    return str(path)


def test_generate_alternatives_for_word_document(mock_storage, mock_file, sample_doc_path, tmp_path):
    copied_pdf_path = _tmp_file_factory(tmp_path, ".pdf", b"pdf")
    local_thumbnail_path = _tmp_file_factory(tmp_path, ".jpg", b"jpg")
    pixmap = MagicMock()
    pixmap.tobytes.return_value = b"png-bytes"
    page = MagicMock()
    page.get_pixmap.return_value = pixmap
    pdf_document = MagicMock()
    pdf_document.page_count = 1
    pdf_document.__getitem__.return_value = page
    pdf_document.__enter__.return_value = pdf_document

    pil_image = MagicMock()

    original_temporary_directory = tempfile.TemporaryDirectory

    def fake_temporary_directory(*args, **kwargs):
        temp_dir = original_temporary_directory(*args, **kwargs)
        pdf_path = Path(temp_dir.name) / "sample.pdf"
        pdf_path.write_bytes(b"generated-pdf")
        return temp_dir

    with (
        patch.object(DocumentProcessor, "get_storage_details", return_value=(mock_storage, sample_doc_path, "docs/1")),
        patch("libs.files.processors.document.shutil.which", return_value="/usr/bin/soffice"),
        patch("libs.files.processors.document.subprocess.run"),
        patch("libs.files.processors.document.tempfile.TemporaryDirectory", side_effect=fake_temporary_directory),
        patch("libs.files.processors.document.GenericStorage.get_temporary_local_path", side_effect=[copied_pdf_path, local_thumbnail_path]),
        patch("libs.files.processors.document.shutil.copyfile", side_effect=lambda src, dst: Path(dst).write_bytes(b"pdf")),
        patch("libs.files.processors.document.fitz.open", return_value=pdf_document),
        patch("libs.files.processors.document.Image.open", return_value=pil_image),
    ):
        processor = DocumentProcessor(file_db=mock_file)
        alternatives = processor.generate_alternatives(force=True)

    assert [alt.storage_suffix for alt in alternatives] == ["pdf", "thumbnail"]
    assert mock_storage.upload.call_count == 2


def test_generate_alternatives_for_powerpoint_document(mock_storage, mock_file, sample_doc_path, tmp_path):
    mock_file.extension = ".pptx"
    mock_file.extension_client = ".pptx"
    mock_file.original_filename = "deck.pptx"
    copied_pdf_path = _tmp_file_factory(tmp_path, ".pdf", b"pdf")
    local_thumbnail_path = _tmp_file_factory(tmp_path, ".jpg", b"jpg")
    pixmap = MagicMock()
    pixmap.tobytes.return_value = b"png-bytes"
    page = MagicMock()
    page.get_pixmap.return_value = pixmap
    pdf_document = MagicMock()
    pdf_document.page_count = 1
    pdf_document.__getitem__.return_value = page
    pdf_document.__enter__.return_value = pdf_document

    pil_image = MagicMock()

    original_temporary_directory = tempfile.TemporaryDirectory

    def fake_temporary_directory(*args, **kwargs):
        temp_dir = original_temporary_directory(*args, **kwargs)
        pdf_path = Path(temp_dir.name) / "sample.pdf"
        pdf_path.write_bytes(b"generated-pdf")
        return temp_dir

    with (
        patch.object(DocumentProcessor, "get_storage_details", return_value=(mock_storage, sample_doc_path, "docs/1")),
        patch("libs.files.processors.document.shutil.which", return_value="/usr/bin/soffice"),
        patch("libs.files.processors.document.subprocess.run"),
        patch("libs.files.processors.document.tempfile.TemporaryDirectory", side_effect=fake_temporary_directory),
        patch("libs.files.processors.document.GenericStorage.get_temporary_local_path", side_effect=[copied_pdf_path, local_thumbnail_path]),
        patch("libs.files.processors.document.shutil.copyfile", side_effect=lambda src, dst: Path(dst).write_bytes(b"pdf")),
        patch("libs.files.processors.document.fitz.open", return_value=pdf_document),
        patch("libs.files.processors.document.Image.open", return_value=pil_image),
    ):
        processor = DocumentProcessor(file_db=mock_file)
        alternatives = processor.generate_alternatives(force=True)

    assert [alt.storage_suffix for alt in alternatives] == ["pdf", "thumbnail"]
    assert mock_storage.upload.call_count == 2


def test_generate_alternatives_for_pdf_only_generates_thumbnail(mock_storage, mock_file, sample_doc_path, tmp_path):
    mock_file.extension = ".pdf"
    mock_file.extension_client = ".pdf"
    local_thumbnail_path = _tmp_file_factory(tmp_path, ".jpg", b"jpg")
    pixmap = MagicMock()
    pixmap.tobytes.return_value = b"png-bytes"
    page = MagicMock()
    page.get_pixmap.return_value = pixmap
    pdf_document = MagicMock()
    pdf_document.page_count = 1
    pdf_document.__getitem__.return_value = page
    pdf_document.__enter__.return_value = pdf_document
    pil_image = MagicMock()

    with (
        patch.object(DocumentProcessor, "get_storage_details", return_value=(mock_storage, sample_doc_path, "docs/1")),
        patch("libs.files.processors.document.GenericStorage.get_temporary_local_path", return_value=local_thumbnail_path),
        patch("libs.files.processors.document.fitz.open", return_value=pdf_document),
        patch("libs.files.processors.document.Image.open", return_value=pil_image),
    ):
        processor = DocumentProcessor(file_db=mock_file)
        alternatives = processor.generate_alternatives(force=True)

    assert [alt.storage_suffix for alt in alternatives] == ["thumbnail"]


def test_generate_alternatives_skips_when_existing_and_not_forced(mock_storage, mock_file, sample_doc_path):
    mock_storage.exists_in_storage.return_value = True
    with patch.object(DocumentProcessor, "get_storage_details", return_value=(mock_storage, sample_doc_path, "docs/1")):
        processor = DocumentProcessor(file_db=mock_file)
        assert processor.generate_alternatives(force=False) == []


def test_generate_alternatives_returns_empty_for_unsupported_extension(mock_storage, mock_file, sample_doc_path):
    mock_file.extension = ".txt"
    mock_file.extension_client = ".txt"
    with patch.object(DocumentProcessor, "get_storage_details", return_value=(mock_storage, sample_doc_path, "docs/1")):
        processor = DocumentProcessor(file_db=mock_file)
        assert processor.generate_alternatives(force=True) == []


def test_generate_extra_data_returns_existing_extra(mock_storage, mock_file, sample_doc_path):
    with patch.object(DocumentProcessor, "get_storage_details", return_value=(mock_storage, sample_doc_path, "docs/1")):
        processor = DocumentProcessor(file_db=mock_file)
        assert processor.generate_extra_data() is mock_file.extra_


def test_convert_office_to_pdf_returns_none_without_soffice(mock_storage, mock_file, sample_doc_path):
    with (
        patch.object(DocumentProcessor, "get_storage_details", return_value=(mock_storage, sample_doc_path, "docs/1")),
        patch("libs.files.processors.document.shutil.which", return_value=None),
    ):
        processor = DocumentProcessor(file_db=mock_file)
        assert processor._DocumentProcessor__convert_office_to_local_pdf() is None


def test_generate_thumbnail_returns_none_for_empty_pdf(mock_storage, mock_file, sample_doc_path):
    pdf_document = MagicMock()
    pdf_document.page_count = 0
    pdf_document.__enter__.return_value = pdf_document
    with patch.object(DocumentProcessor, "get_storage_details", return_value=(mock_storage, sample_doc_path, "docs/1")):
        processor = DocumentProcessor(file_db=mock_file)
        with patch("libs.files.processors.document.fitz.open", return_value=pdf_document):
            assert processor._DocumentProcessor__generate_thumbnail_from_pdf(local_pdf_path=sample_doc_path) is None


def test_missing_storage_raises_error(mock_file):
    with patch.object(DocumentProcessor, "get_storage_details", side_effect=NoStorageAvailableError()):
        with pytest.raises(NoStorageAvailableError):
            DocumentProcessor(file_db=mock_file)


def test_missing_storage_folder_path_raises_error(mock_file):
    with patch.object(DocumentProcessor, "get_storage_details", side_effect=NoStorageFolderPathError()):
        with pytest.raises(NoStorageFolderPathError):
            DocumentProcessor(file_db=mock_file)


def test_missing_local_path_raises_error(mock_file):
    with patch.object(DocumentProcessor, "get_storage_details", side_effect=NoLocalPathError()):
        with pytest.raises(NoLocalPathError):
            DocumentProcessor(file_db=mock_file)
