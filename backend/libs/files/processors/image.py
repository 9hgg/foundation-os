import os
import tempfile

import cv2
import numpy as np
import structlog
from PIL import Image

from libs.svg import extract_text_from_svg

from ..models import FileAlternative
from ..storage import GenericStorage
from ._generic import GenericProcessor, NoLocalPathError, NoStorageAvailableError, NoStorageFolderPathError

logger = structlog.get_logger(__name__)


class ImageProcessor(GenericProcessor):
    __kind__ = "image"

    # ALTERNATIVES

    def generate_alternatives(self, *, force: bool = False) -> list[FileAlternative]:
        """
        Generate the alternative files for an image like:
        - thumbnail
        - square
        - different sizes (respecting aspect ratio)
        For SVG files, also generates a plain-text alternative with extracted labels.
        """

        alternative_files = []

        ext = os.path.splitext(self.local_path or "")[1].lower() if self.local_path else ""

        # SVG files: extract visible text labels instead of rasterizing
        if ext == ".svg":
            alternative__text = self.__generate_svg_text_alternative(force=force)
            if alternative__text is not None:
                alternative_files.append(alternative__text)
            return alternative_files

        # alternative: "squared" (cropped and centered and compressed)
        alternative__squared = self.__generate_square_centered_image(force=force)
        if alternative__squared is not None:
            alternative_files.append(alternative__squared)

        # alternative: "default" (JPEG compressed)
        alternative__default = self.__generate_same_compressed_image(force=force)
        if alternative__default is not None:
            alternative_files.append(alternative__default)

        # alternative: "thumbnail" (200x200 pixels)
        alternative__thumbnail = self.__generate_thumbnail_image(force=force)
        if alternative__thumbnail is not None:
            alternative_files.append(alternative__thumbnail)

        return alternative_files

    # SVG TEXT

    def __generate_svg_text_alternative(self, force: bool = False) -> FileAlternative | None:
        """
        Extract all visible text labels from an SVG and upload them as a
        plain-text alternative (storage suffix ``text``).
        """
        if not self.storage:
            logger.warning("image_svg_text_storage_missing")
            raise NoStorageAvailableError()
        if not self.storage_folder_path:
            logger.warning("image_svg_text_storage_folder_missing")
            raise NoStorageFolderPathError()
        if not self.local_path:
            logger.warning("image_svg_text_local_source_missing")
            raise NoLocalPathError()

        storage_suffix = "text"

        if not force and self.storage.exists_in_storage(
            storage_folder_path=self.storage_folder_path,
            alternative=storage_suffix,
        ):
            logger.debug("image_alternative_exists", alternative=storage_suffix)
            return None

        try:
            with open(self.local_path, encoding="utf-8", errors="replace") as svg_file:
                svg_content = svg_file.read()
        except OSError as error:
            logger.warning("image_svg_read_failed", error_type=type(error).__name__)
            return None

        texts = extract_text_from_svg(svg_content)
        if not texts:
            logger.warning("image_svg_text_not_found")
            return None

        plain_text = "\n".join(texts)

        tmp_fd, tmp_path = tempfile.mkstemp(suffix=".txt")
        try:
            with os.fdopen(tmp_fd, "w", encoding="utf-8") as fp:
                fp.write(plain_text)

            self.storage.upload(
                local_path=tmp_path,
                storage_folder_path=self.storage_folder_path,
                alternative=storage_suffix,
                force=True,
            )
            file_stats = os.stat(tmp_path)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

        logger.debug("image_svg_text_generated", string_count=len(texts))

        return FileAlternative(
            alternative_filename="extracted_text.txt",
            storage_suffix=storage_suffix,
            description="Plain text extracted from SVG visible labels",
            size=file_stats.st_size,
            kind="text",
            mime="text/plain",
            extension=".txt",
        )

    # SQUARED
    def __generate_square_centered_image(  # noqa: C901
        self,
        force: bool = False,
        min_size=1400,
        max_size=3000,
        max_bytes=500_000,
        jpeg_quality=100,
        STORAGE_SUFFIX="squared",
        alternative_filename="squared.jpg",
        description="squared",
    ) -> FileAlternative | None:
        """
        Generate a cropped and centered square image,
        matching the RSS standard width and height.
        Handles GIFs by keeping animation (using PIL),
        but static for other formats (using OpenCV).
        """

        if not self.storage:
            logger.warning("image_alternative_storage_missing", alternative=STORAGE_SUFFIX)
            raise NoStorageAvailableError()
        if not self.storage_folder_path:
            logger.warning("image_alternative_storage_folder_missing", alternative=STORAGE_SUFFIX)
            raise NoStorageFolderPathError()
        if not self.local_path:
            logger.warning("image_alternative_local_source_missing", alternative=STORAGE_SUFFIX)
            raise NoLocalPathError()

        if not force and self.storage.exists_in_storage(
            storage_folder_path=self.storage_folder_path,
            alternative=STORAGE_SUFFIX,
        ):
            logger.debug("image_alternative_exists", alternative=STORAGE_SUFFIX)
            return None

        ext = os.path.splitext(self.local_path)[1].lower()
        # Detect animated WebP as well as GIF
        is_gif = ext == ".gif"
        is_webp = ext == ".webp"

        if is_gif or is_webp:
            # Use PIL to crop and center all frames, keep animation
            pil_image = Image.open(self.local_path)
            rgba_frames = []
            duration = pil_image.info.get("duration", 100)
            loop = pil_image.info.get("loop", 0)
            disposal = pil_image.info.get("disposal", 2)
            try:
                while True:
                    frame = pil_image.copy().convert("RGBA")
                    width, height = frame.size
                    target_size = min(width, height)
                    x = width // 2 - target_size // 2
                    y = height // 2 - target_size // 2
                    frame = frame.crop((x, y, x + target_size, y + target_size))
                    if target_size < min_size:
                        frame = frame.resize((min_size, min_size), Image.Resampling.LANCZOS)
                    elif target_size > max_size:
                        frame = frame.resize((max_size, max_size), Image.Resampling.LANCZOS)
                    rgba_frames.append(frame)
                    pil_image.seek(pil_image.tell() + 1)
            except EOFError:
                pass
            # Generate a global palette from the first frame (adaptive, 256 colors)
            palette_frame = rgba_frames[0].convert("P", palette=Image.ADAPTIVE, colors=256)
            global_palette = palette_frame.getpalette()
            # Convert all frames to P mode using the global palette
            pal_frames = []
            for f in rgba_frames:
                pal_f = f.convert("P", dither=Image.NONE, palette=Image.ADAPTIVE, colors=256)
                pal_f.putpalette(global_palette)
                pal_frames.append(pal_f)
            output_path = GenericStorage.get_temporary_local_path(suffix=".gif")
            pal_frames[0].save(
                output_path,
                save_all=True,
                append_images=pal_frames[1:],
                duration=duration,
                loop=loop,
                disposal=disposal,
                optimize=True,
            )
            return self._finalize_alternative(
                output_path=output_path,
                alternative_filename=alternative_filename.replace(".jpg", ".gif"),
                STORAGE_SUFFIX=STORAGE_SUFFIX,
                description=description,
                mime="image/gif",
                extension=".gif",
            )
        else:
            cv2_img = cv2.imread(self.local_path)
            if cv2_img is None:
                logger.warning("image_decoder_fallback", decoder="pillow")
                pil_image = Image.open(self.local_path)
                cv2_img = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
            if cv2_img is None:
                logger.warning("image_decode_failed")
                return None

            width = cv2_img.shape[1]
            height = cv2_img.shape[0]
            logger.debug("image_loaded", width=width, height=height, alternative=STORAGE_SUFFIX)

            # determine the target size of the cropped image
            target_size = min(width, height)

            # Calculate the x and y coordinates of the top-left
            # corner of the square image from the original
            x = width // 2 - target_size // 2
            y = height // 2 - target_size // 2

            # Crop the image from the calculated coordinates
            cropped_img = cv2_img[y : y + target_size, x : x + target_size]

            # Resize the image if necessary
            if target_size < min_size:
                logger.debug(
                    "image_upscaling",
                    original_size=target_size,
                    target_size=min_size,
                    alternative=STORAGE_SUFFIX,
                )
                cropped_img = cv2.resize(cropped_img, (min_size, min_size))
            elif target_size > max_size:
                logger.debug(
                    "image_downscaling",
                    original_size=target_size,
                    target_size=max_size,
                    alternative=STORAGE_SUFFIX,
                )
                cropped_img = cv2.resize(cropped_img, (max_size, max_size))

            # Check the size of the image
            img_size_bytes = len(cv2.imencode(".jpg", cropped_img)[1])
            logger.debug("image_encoded", size_bytes=img_size_bytes, alternative=STORAGE_SUFFIX)
            while img_size_bytes > max_bytes:
                logger.debug(
                    "image_recompressing",
                    size_bytes=img_size_bytes,
                    max_bytes=max_bytes,
                    jpeg_quality=jpeg_quality,
                    alternative=STORAGE_SUFFIX,
                )
                jpeg_quality -= 5
                if jpeg_quality < 0:
                    logger.warning("image_compression_exhausted", alternative=STORAGE_SUFFIX)
                    return None
                successfull_encoding, img_data = cv2.imencode(
                    ".jpg", cropped_img, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality]
                )
                img_size_bytes = len(img_data)
                logger.debug(
                    "image_recompressed",
                    size_bytes=img_size_bytes,
                    jpeg_quality=jpeg_quality,
                    alternative=STORAGE_SUFFIX,
                )

            output_path = GenericStorage.get_temporary_local_path(suffix=".jpg")
            cv2.imwrite(output_path, cropped_img, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
            return self._finalize_alternative(
                output_path=output_path,
                alternative_filename=alternative_filename,
                STORAGE_SUFFIX=STORAGE_SUFFIX,
                description=description,
                mime="image/jpeg",
                extension=".jpg",
            )

    # DEFAULT
    def __generate_same_compressed_image(self, force: bool = False) -> FileAlternative | None:  # noqa: C901
        """
        Generate an image with the same compression as the original.
        For GIFs, keep animation and use GIF output. For others, use JPEG.
        """
        if not self.storage:
            logger.warning("image_alternative_storage_missing", alternative="default")
            raise NoStorageAvailableError()
        if not self.storage_folder_path:
            logger.warning("image_alternative_storage_folder_missing", alternative="default")
            raise NoStorageFolderPathError()
        if not self.local_path:
            logger.warning("image_alternative_local_source_missing", alternative="default")
            raise NoLocalPathError()
        STORAGE_SUFFIX = "default"

        if not force and self.storage.exists_in_storage(
            storage_folder_path=self.storage_folder_path,
            alternative=STORAGE_SUFFIX,
        ):
            logger.debug("image_alternative_exists", alternative=STORAGE_SUFFIX)
            return None

        ext = os.path.splitext(self.local_path)[1].lower()
        is_gif = ext == ".gif"
        is_webp = ext == ".webp"

        if is_gif or is_webp:
            pil_image = Image.open(self.local_path)
            rgba_frames = []
            duration = pil_image.info.get("duration", 100)
            loop = pil_image.info.get("loop", 0)
            disposal = pil_image.info.get("disposal", 2)
            try:
                while True:
                    frame = pil_image.copy().convert("RGBA")
                    rgba_frames.append(frame)
                    pil_image.seek(pil_image.tell() + 1)
            except EOFError:
                pass
            # Generate a global palette from the first frame (adaptive, 256 colors)
            palette_frame = rgba_frames[0].convert("P", palette=Image.ADAPTIVE, colors=256)
            global_palette = palette_frame.getpalette()
            # Convert all frames to P mode using the global palette
            pal_frames = []
            for f in rgba_frames:
                pal_f = f.convert("P", dither=Image.NONE, palette=Image.ADAPTIVE, colors=256)
                pal_f.putpalette(global_palette)
                pal_frames.append(pal_f)
            output_path = GenericStorage.get_temporary_local_path(suffix=".gif")
            pal_frames[0].save(
                output_path,
                save_all=True,
                append_images=pal_frames[1:],
                duration=duration,
                loop=loop,
                disposal=disposal,
                optimize=True,
            )
            return self._finalize_alternative(
                output_path=output_path,
                alternative_filename="default.gif",
                STORAGE_SUFFIX=STORAGE_SUFFIX,
                description="Default alternative, lighter than the original, GIF animation preserved",
                mime="image/gif",
                extension=".gif",
            )

        cv2_img = cv2.imread(self.local_path)
        if cv2_img is None:
            logger.warning("image_decoder_fallback", decoder="pillow")
            pil_image = Image.open(self.local_path)
            cv2_img = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
        if cv2_img is None:
            logger.warning("image_decode_failed")
            return None

        # Cap the longest edge before touching quality at all — the goal here is
        # just "under max_bytes", and shrinking dimensions gets there in far fewer,
        # far cheaper encode passes than quality-only reduction ever can on a
        # multi-megapixel original (aspect ratio preserved, unlike "squared").
        max_dimension = 2000
        height, width = cv2_img.shape[:2]
        longest_side = max(width, height)
        if longest_side > max_dimension:
            scale = max_dimension / longest_side
            logger.debug(
                "image_downscaling",
                original_size=longest_side,
                target_size=max_dimension,
                alternative=STORAGE_SUFFIX,
            )
            cv2_img = cv2.resize(cv2_img, (round(width * scale), round(height * scale)))

        jpeg_quality = 100
        max_bytes = 500_000
        img_size_bytes = len(cv2.imencode(".jpg", cv2_img)[1])
        logger.debug("image_encoded", size_bytes=img_size_bytes, alternative=STORAGE_SUFFIX)
        while img_size_bytes > max_bytes:
            logger.debug(
                "image_recompressing",
                size_bytes=img_size_bytes,
                max_bytes=max_bytes,
                jpeg_quality=jpeg_quality,
                alternative=STORAGE_SUFFIX,
            )
            jpeg_quality -= 5
            if jpeg_quality < 0:
                logger.warning("image_compression_exhausted", alternative=STORAGE_SUFFIX)
                return None
            successfull_encoding, img_data = cv2.imencode(".jpg", cv2_img, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
            img_size_bytes = len(img_data)
            logger.debug(
                "image_recompressed",
                size_bytes=img_size_bytes,
                jpeg_quality=jpeg_quality,
                alternative=STORAGE_SUFFIX,
            )

        output_path = GenericStorage.get_temporary_local_path(suffix=".jpg")
        cv2.imwrite(output_path, cv2_img, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
        return self._finalize_alternative(
            output_path=output_path,
            alternative_filename="default.jpg",
            STORAGE_SUFFIX=STORAGE_SUFFIX,
            description="Default alternative, lighter than the original with JPEG compression",
            mime="image/jpeg",
            extension=".jpg",
        )

    def _finalize_alternative(
        self,
        output_path: str,
        alternative_filename: str,
        STORAGE_SUFFIX: str,
        description: str,
        mime: str,
        extension: str,
    ) -> FileAlternative:
        if not self.storage:
            logger.warning("image_alternative_storage_missing", alternative=STORAGE_SUFFIX)
            raise NoStorageAvailableError()
        if not self.storage_folder_path:
            logger.warning("image_alternative_storage_folder_missing", alternative=STORAGE_SUFFIX)
            raise NoStorageFolderPathError()
        if not self.local_path:
            logger.warning("image_alternative_local_source_missing", alternative=STORAGE_SUFFIX)
            raise NoLocalPathError()

        file_stats = os.stat(output_path)
        self.storage.upload(
            local_path=output_path,
            storage_folder_path=self.storage_folder_path,
            alternative=STORAGE_SUFFIX,
            content_type=mime,
            force=True,
        )
        os.remove(output_path)
        return FileAlternative(
            alternative_filename=alternative_filename,
            storage_suffix=STORAGE_SUFFIX,
            description=description,
            size=file_stats.st_size,
            kind="image",
            mime=mime,
            extension=extension,
        )

    # THUMBNAIL
    def __generate_thumbnail_image(self, force: bool = False) -> FileAlternative | None:
        STORAGE_SUFFIX = "thumbnail"

        if not self.storage:
            logger.warning("image_alternative_storage_missing", alternative=STORAGE_SUFFIX)
            raise NoStorageAvailableError()
        if not self.storage_folder_path:
            logger.warning("image_alternative_storage_folder_missing", alternative=STORAGE_SUFFIX)
            raise NoStorageFolderPathError()
        if not self.local_path:
            logger.warning("image_alternative_local_source_missing", alternative=STORAGE_SUFFIX)
            raise NoLocalPathError()

        if not force and self.storage.exists_in_storage(
            storage_folder_path=self.storage_folder_path,
            alternative=STORAGE_SUFFIX,
        ):
            logger.debug("image_alternative_exists", alternative=STORAGE_SUFFIX)
            return None
        return self.__generate_square_centered_image(
            force=force,
            min_size=200,
            max_size=200,
            max_bytes=50_000,
            jpeg_quality=100,
            STORAGE_SUFFIX=STORAGE_SUFFIX,
            alternative_filename="thumbnail.jpg",
            description="thumbnail",
        )

    # EXTRA

    def generate_extra_data(self, *, force: bool = False):
        if not self.storage:
            logger.warning("image_metadata_storage_missing")
            raise NoStorageAvailableError()
        if not self.storage_folder_path:
            logger.warning("image_metadata_storage_folder_missing")
            raise NoStorageFolderPathError()
        if not self.local_path:
            logger.warning("image_metadata_local_source_missing")
            raise NoLocalPathError()

        file_extra = self.file_db.extra_

        ext = os.path.splitext(self.local_path)[1].lower()
        if ext == ".svg":
            # SVG is a vector format: neither OpenCV nor Pillow can rasterize it,
            # so there is no pixel width/height to report here.
            return file_extra

        cv2_img = cv2.imread(self.local_path)
        if cv2_img is None:
            logger.warning("image_decoder_fallback", decoder="pillow")
            pil_image = Image.open(self.local_path)
            cv2_img = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
        if cv2_img is None:
            logger.warning("image_decode_failed")
            return file_extra

        width = cv2_img.shape[1]
        height = cv2_img.shape[0]

        file_extra.width = width
        file_extra.height = height

        return file_extra
