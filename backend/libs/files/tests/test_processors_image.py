from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from PIL import Image

from libs.files.models import File
from libs.files.processors._generic import NoStorageAvailableError
from libs.files.processors.image import ImageProcessor
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
    file_db.extra_ = MagicMock()
    return file_db


@pytest.fixture
def sample_image_path(tmp_path):
    # Create a simple red image using PIL
    img = Image.new("RGB", (100, 100), color="red")
    path = tmp_path / "test_image.jpg"
    img.save(path)
    return str(path)


@pytest.fixture
def sample_gif_path(tmp_path):
    # Create a simple GIF
    img = Image.new("RGB", (100, 100), color="red")
    path = tmp_path / "test_image.gif"
    img.save(path, save_all=True, append_images=[img], duration=100, loop=0)
    return str(path)


@pytest.fixture
def sample_webp_path(tmp_path):
    # Create a simple WebP
    img = Image.new("RGB", (100, 100), color="blue")
    path = tmp_path / "test_image.webp"
    img.save(path, save_all=True, append_images=[img], duration=100, loop=0)
    return str(path)


def test_generate_alternatives_jpg(mock_storage, mock_file, sample_image_path):
    with patch.object(ImageProcessor, "get_storage_details") as mock_get_details:
        mock_get_details.return_value = (mock_storage, sample_image_path, "test_folder")

        processor = ImageProcessor(file_db=mock_file)

        alternatives = processor.generate_alternatives(force=True)

        assert len(alternatives) == 3
        # squared, default, thumbnail
        suffixes = [alt.storage_suffix for alt in alternatives]
        assert "squared" in suffixes
        assert "default" in suffixes
        assert "thumbnail" in suffixes

        assert mock_storage.upload.call_count == 3


def test_generate_alternatives_gif(mock_storage, mock_file, sample_gif_path):
    with patch.object(ImageProcessor, "get_storage_details") as mock_get_details:
        mock_get_details.return_value = (mock_storage, sample_gif_path, "test_folder")

        processor = ImageProcessor(file_db=mock_file)

        alternatives = processor.generate_alternatives(force=True)

        assert len(alternatives) == 3
        suffixes = [alt.storage_suffix for alt in alternatives]
        assert "squared" in suffixes
        assert "default" in suffixes
        assert "thumbnail" in suffixes

        # Check extensions
        for alt in alternatives:
            if alt.storage_suffix == "default":
                assert alt.extension == ".gif"
                assert alt.mime == "image/gif"


def test_generate_alternatives_webp(mock_storage, mock_file, sample_webp_path):
    with patch.object(ImageProcessor, "get_storage_details") as mock_get_details:
        mock_get_details.return_value = (mock_storage, sample_webp_path, "test_folder")

        processor = ImageProcessor(file_db=mock_file)

        alternatives = processor.generate_alternatives(force=True)

        assert len(alternatives) == 3
        suffixes = [alt.storage_suffix for alt in alternatives]
        assert "squared" in suffixes
        assert "default" in suffixes
        assert "thumbnail" in suffixes

        # Check extensions - WebP is processed as GIF/animated logic in the code?
        # The code says: if is_gif or is_webp: ... return ... mime="image/gif", extension=".gif"
        # So it converts WebP to GIF?
        # Let's verify the code logic:
        # if is_gif or is_webp: ... output_path = ... suffix=".gif" ... mime="image/gif"
        # Yes, it converts to GIF.
        for alt in alternatives:
            if alt.storage_suffix == "default":
                assert alt.extension == ".gif"
                assert alt.mime == "image/gif"


def test_generate_extra_data(mock_storage, mock_file, sample_image_path):
    with patch.object(ImageProcessor, "get_storage_details") as mock_get_details:
        mock_get_details.return_value = (mock_storage, sample_image_path, "test_folder")

        processor = ImageProcessor(file_db=mock_file)

        extra = processor.generate_extra_data()

        assert extra.width == 100
        assert extra.height == 100


def test_generate_square_centered_image_resize(mock_storage, mock_file, tmp_path):
    # Create a large image
    img = Image.new("RGB", (4000, 2000), color="blue")
    path = tmp_path / "large_image.jpg"
    img.save(path)

    with patch.object(ImageProcessor, "get_storage_details") as mock_get_details:
        mock_get_details.return_value = (mock_storage, str(path), "test_folder")

        processor = ImageProcessor(file_db=mock_file)

        # Should be resized to max_size (3000)
        _ = processor._ImageProcessor__generate_square_centered_image(force=True, max_size=100)

        # We can't easily check the size of the generated file because it's deleted after upload
        # But we can check that upload was called
        assert mock_storage.upload.called


def test_generate_same_compressed_image_compression(mock_storage, mock_file, tmp_path):
    # Create a random noise image that might be hard to compress
    img_array = np.random.randint(0, 255, (1000, 1000, 3), dtype=np.uint8)
    img = Image.fromarray(img_array)
    path = tmp_path / "noise.jpg"
    img.save(path)

    with patch.object(ImageProcessor, "get_storage_details") as mock_get_details:
        mock_get_details.return_value = (mock_storage, str(path), "test_folder")

        processor = ImageProcessor(file_db=mock_file)

        # Force low max_bytes to trigger compression loop
        # We mock cv2.imencode to simulate size reduction if needed,
        # but let's try with real logic first.
        # If it fails to compress enough, it returns None (which is also a valid path to test)

        # Let's just verify it runs without error
        alt = processor._ImageProcessor__generate_same_compressed_image(force=True)
        # It might return None if it can't compress enough, or an alternative
        if alt:
            assert alt.storage_suffix == "default"


def test_missing_storage_raises_error(mock_file):
    with patch.object(ImageProcessor, "get_storage_details") as mock_get_details:
        mock_get_details.side_effect = NoStorageAvailableError()

        with pytest.raises(NoStorageAvailableError):
            ImageProcessor(file_db=mock_file)


def test_generate_square_centered_image_compression_loop(mock_storage, mock_file, tmp_path):
    # Create a large image
    img = Image.new("RGB", (2000, 2000), color="blue")
    path = tmp_path / "large_image.jpg"
    img.save(path)

    with patch.object(ImageProcessor, "get_storage_details") as mock_get_details:
        mock_get_details.return_value = (mock_storage, str(path), "test_folder")
        processor = ImageProcessor(file_db=mock_file)

        # Mock cv2.imencode to simulate large file size initially, then small enough
        with patch("cv2.imencode") as mock_imencode:
            # First call (check size): return large buffer
            # Second call (compression loop): return large buffer
            # Third call (compression loop): return small buffer
            large_buffer = np.zeros(600_000, dtype=np.uint8)
            small_buffer = np.zeros(100_000, dtype=np.uint8)

            # The code calls imencode(".jpg", cropped_img) to check size
            # Then calls imencode(".jpg", cropped_img, [params]) in loop

            mock_imencode.side_effect = [
                (True, large_buffer),  # Initial check
                (True, large_buffer),  # First compression attempt
                (True, small_buffer),  # Second compression attempt
            ]

            # We also need to mock cv2.resize and cv2.imread because we are mocking cv2 module partially?
            # No, patch("cv2.imencode") only patches imencode.
            # But we need real cv2.imread to work.

            alt = processor._ImageProcessor__generate_square_centered_image(
                force=True, max_bytes=500_000, max_size=2000
            )

            assert alt is not None
            assert mock_imencode.call_count >= 3


def test_cv2_read_failure_fallback_pil(mock_storage, mock_file, sample_image_path):
    with patch.object(ImageProcessor, "get_storage_details") as mock_get_details:
        mock_get_details.return_value = (mock_storage, sample_image_path, "test_folder")
        processor = ImageProcessor(file_db=mock_file)

        # Mock cv2.imread to return None
        with patch("cv2.imread", return_value=None) as mock_imread:
            # Mock cv2.cvtColor to return valid image (simulating PIL fallback success)
            with patch("cv2.cvtColor") as mock_cvtColor:
                mock_cvtColor.return_value = np.zeros((100, 100, 3), dtype=np.uint8)

                alt = processor._ImageProcessor__generate_square_centered_image(force=True)

                assert alt is not None
                mock_imread.assert_called()
                mock_cvtColor.assert_called()


def test_cv2_read_failure_total(mock_storage, mock_file, sample_image_path):
    with patch.object(ImageProcessor, "get_storage_details") as mock_get_details:
        mock_get_details.return_value = (mock_storage, sample_image_path, "test_folder")
        processor = ImageProcessor(file_db=mock_file)

        # Mock cv2.imread to return None AND cv2.cvtColor to return None (or PIL failure)
        with patch("cv2.imread", return_value=None):
            with patch("cv2.cvtColor", return_value=None):
                alt = processor._ImageProcessor__generate_square_centered_image(force=True)
                assert alt is None


def test_generate_square_centered_image_upscale(mock_storage, mock_file, tmp_path):
    # Create a small image
    img = Image.new("RGB", (50, 50), color="blue")
    path = tmp_path / "small_image.jpg"
    img.save(path)

    with patch.object(ImageProcessor, "get_storage_details") as mock_get_details:
        mock_get_details.return_value = (mock_storage, str(path), "test_folder")
        processor = ImageProcessor(file_db=mock_file)

        # Should be upscaled to min_size (100)
        with patch("cv2.resize") as mock_resize:
            # We need mock_resize to return something valid for subsequent calls
            mock_resize.return_value = np.zeros((100, 100, 3), dtype=np.uint8)

            _ = processor._ImageProcessor__generate_square_centered_image(force=True, min_size=100)

            mock_resize.assert_called()
