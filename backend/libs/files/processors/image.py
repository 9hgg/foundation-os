import os
import tempfile

import cv2
import numpy as np
from PIL import Image

from libs.logger import print, print_warning
from libs.logger.customLogger import print_color
from libs.svg import extract_text_from_svg

from ..models import FileAlternative
from ..storage import GenericStorage
from ._generic import GenericProcessor, NoLocalPathError, NoStorageAvailableError, NoStorageFolderPathError


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
            print_warning("No storage available, cannot generate SVG text alternative")
            raise NoStorageAvailableError()
        if not self.storage_folder_path:
            print_warning("No storage folder path, cannot generate SVG text alternative")
            raise NoStorageFolderPathError()
        if not self.local_path:
            print_warning("No local path, cannot generate SVG text alternative")
            raise NoLocalPathError()

        storage_suffix = "text"

        if not force and self.storage.exists_in_storage(
            storage_folder_path=self.storage_folder_path,
            alternative=storage_suffix,
        ):
            print_color("green", "(__generate_svg_text_alternative): text alternative already exists", self.storage_folder_path)
            return None

        try:
            with open(self.local_path, encoding="utf-8", errors="replace") as svg_file:
                svg_content = svg_file.read()
        except OSError as error:
            print_warning("(__generate_svg_text_alternative): could not read SVG file:", error)
            return None

        texts = extract_text_from_svg(svg_content)
        if not texts:
            print_warning("(__generate_svg_text_alternative): no text found in SVG", self.local_path)
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

        print("(__generate_svg_text_alternative): generated text alternative with", len(texts), "strings")

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
    def __generate_square_centered_image(
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
            print_warning("No storage available, cannot generate alternatives")
            raise NoStorageAvailableError()
        if not self.storage_folder_path:
            print_warning("No storage folder path available, cannot generate alternatives")
            raise NoStorageFolderPathError()
        if not self.local_path:
            print_warning("No local path available, cannot generate alternatives")
            raise NoLocalPathError()

        if not force and self.storage.exists_in_storage(
            storage_folder_path=self.storage_folder_path,
            alternative=STORAGE_SUFFIX,
        ):
            print_color(
                "green",
                "(__generate_square_centered_image): alternative already exists",
                self.storage_folder_path,
                STORAGE_SUFFIX,
            )
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
                print("Using PIL")
                pil_image = Image.open(self.local_path)
                cv2_img = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
            if cv2_img is None:
                print_warning("Error while reading image")
                return None

            width = cv2_img.shape[1]
            height = cv2_img.shape[0]
            print("(generate_square_centered_image): image width:", width)
            print("(generate_square_centered_image): image height:", height)

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
                print(
                    "(generate_square_centered_image): image too small" + ", will be upscaled to:",
                    min_size,
                )
                cropped_img = cv2.resize(cropped_img, (min_size, min_size))
            elif target_size > max_size:
                print(
                    "(generate_square_centered_image): image too large," + " will be downscaled to:",
                    max_size,
                )
                cropped_img = cv2.resize(cropped_img, (max_size, max_size))

            # Check the size of the image
            img_size_bytes = len(cv2.imencode(".jpg", cropped_img)[1])
            print("image size ############################", img_size_bytes)
            while img_size_bytes > max_bytes:
                print(
                    f"(generate_square_centered_image): image size {img_size_bytes} bytes"
                    + f" is above the maximum allowed {max_bytes} bytes. \n"
                    + f"Compressing image with quality {jpeg_quality}"
                )
                jpeg_quality -= 5
                if jpeg_quality < 0:
                    print_warning("Error while compressing image")
                    return None
                successfull_encoding, img_data = cv2.imencode(
                    ".jpg", cropped_img, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality]
                )
                img_size_bytes = len(img_data)
                print("image size ############################", img_size_bytes)

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
    def __generate_same_compressed_image(self, force: bool = False) -> FileAlternative | None:
        """
        Generate an image with the same compression as the original.
        For GIFs, keep animation and use GIF output. For others, use JPEG.
        """
        if not self.storage:
            print_warning("No storage available, cannot generate alternatives")
            raise NoStorageAvailableError()
        if not self.storage_folder_path:
            print_warning("No storage folder path available, cannot generate alternatives")
            raise NoStorageFolderPathError()
        if not self.local_path:
            print_warning("No local path available, cannot generate alternatives")
            raise NoLocalPathError()
        STORAGE_SUFFIX = "default"

        if not force and self.storage.exists_in_storage(
            storage_folder_path=self.storage_folder_path,
            alternative=STORAGE_SUFFIX,
        ):
            print_color(
                "green",
                "(__generate_same_compressed_image): alternative already exists",
                self.storage_folder_path,
                STORAGE_SUFFIX,
            )
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
            print("Using PIL")
            pil_image = Image.open(self.local_path)
            cv2_img = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
        if cv2_img is None:
            print_warning("Error while reading image")
            return None

        jpeg_quality = 100
        max_bytes = 500_000
        img_size_bytes = len(cv2.imencode(".jpg", cv2_img)[1])
        print("image size ############################", img_size_bytes)
        while img_size_bytes > max_bytes:
            print(
                f"(generate_same_compressed_image): image size {img_size_bytes} bytes"
                + f" is above the maximum allowed {max_bytes} bytes. \n"
                + f"Compressing image with quality {jpeg_quality}"
            )
            jpeg_quality -= 5
            if jpeg_quality < 0:
                print_warning("Error while compressing image")
                return None
            successfull_encoding, img_data = cv2.imencode(".jpg", cv2_img, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
            img_size_bytes = len(img_data)
            print("image size ############################", img_size_bytes)

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
            print_warning("No storage available, cannot generate alternatives")
            raise NoStorageAvailableError()
        if not self.storage_folder_path:
            print_warning("No storage folder path available, cannot generate alternatives")
            raise NoStorageFolderPathError()
        if not self.local_path:
            print_warning("No local path available, cannot generate alternatives")
            raise NoLocalPathError()

        file_stats = os.stat(output_path)
        self.storage.upload(
            local_path=output_path,
            storage_folder_path=self.storage_folder_path,
            alternative=STORAGE_SUFFIX,
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
            print_warning("No storage available, cannot generate alternatives")
            raise NoStorageAvailableError()
        if not self.storage_folder_path:
            print_warning("No storage folder path available, cannot generate alternatives")
            raise NoStorageFolderPathError()
        if not self.local_path:
            print_warning("No local path available, cannot generate alternatives")
            raise NoLocalPathError()

        if not force and self.storage.exists_in_storage(
            storage_folder_path=self.storage_folder_path,
            alternative=STORAGE_SUFFIX,
        ):
            print_color(
                "green",
                "(__generate_thumbnail_image): alternative already exists",
                self.storage_folder_path,
                STORAGE_SUFFIX,
            )
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
            print_warning("No storage available, cannot generate alternatives")
            raise NoStorageAvailableError()
        if not self.storage_folder_path:
            print_warning("No storage folder path available, cannot generate alternatives")
            raise NoStorageFolderPathError()
        if not self.local_path:
            print_warning("No local path available, cannot generate alternatives")
            raise NoLocalPathError()

        file_extra = self.file_db.extra_

        cv2_img = cv2.imread(self.local_path)
        if cv2_img is None:
            print("Using PIL")
            pil_image = Image.open(self.local_path)
            cv2_img = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
        if cv2_img is None:
            print_warning("Error while reading image")
            return file_extra

        width = cv2_img.shape[1]
        height = cv2_img.shape[0]

        file_extra.width = width
        file_extra.height = height

        return file_extra
