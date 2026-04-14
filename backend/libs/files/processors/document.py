import os
import shutil
import subprocess
import tempfile
from io import BytesIO
from pathlib import Path

import fitz
from PIL import Image

from libs.logger import print, print_warning
from libs.logger.customLogger import print_color

from ..models import ExtraDetailsFile, FileAlternative
from ..storage import GenericStorage
from ._generic import GenericProcessor, NoLocalPathError, NoStorageAvailableError, NoStorageFolderPathError


class DocumentProcessor(GenericProcessor):
    __kind__ = "document"
    _CONVERTIBLE_OFFICE_EXTENSIONS = {".doc", ".docx", ".ppt", ".pptx"}
    _PDF_EXTENSION = ".pdf"

    def generate_alternatives(self, *, force: bool = False) -> list[FileAlternative]:
        if not self.storage:
            print_warning("No storage available, cannot generate document alternatives")
            raise NoStorageAvailableError()
        if not self.storage_folder_path:
            print_warning("No storage folder path available, cannot generate document alternatives")
            raise NoStorageFolderPathError()
        if not self.local_path:
            print_warning("No local path available, cannot generate document alternatives")
            raise NoLocalPathError()

        extension = self._get_extension()
        if extension not in self._CONVERTIBLE_OFFICE_EXTENSIONS | {self._PDF_EXTENSION}:
            return []

        pdf_exists = self.storage.exists_in_storage(
            storage_folder_path=self.storage_folder_path,
            alternative="pdf",
        )
        thumbnail_exists = self.storage.exists_in_storage(
            storage_folder_path=self.storage_folder_path,
            alternative="thumbnail",
        )
        is_convertible_office_source = extension in self._CONVERTIBLE_OFFICE_EXTENSIONS
        if is_convertible_office_source and not force and pdf_exists and thumbnail_exists:
            print_color(
                "green",
                "(generate_alternatives): pdf and thumbnail already exist",
                self.storage_folder_path,
            )
            return []
        if not is_convertible_office_source and not force and thumbnail_exists:
            print_color(
                "green",
                "(generate_alternatives): thumbnail already exists",
                self.storage_folder_path,
            )
            return []

        need_pdf_upload = is_convertible_office_source and (force or not pdf_exists)
        need_thumbnail = force or not thumbnail_exists

        local_pdf_path: str | None = None
        should_cleanup_local_pdf = False

        if is_convertible_office_source:
            if need_pdf_upload:
                local_pdf_path = self.__convert_office_to_local_pdf()
                should_cleanup_local_pdf = local_pdf_path is not None
            elif need_thumbnail and pdf_exists:
                local_pdf_path = self.__download_existing_pdf_alternative_to_local()
                should_cleanup_local_pdf = local_pdf_path is not None

            if local_pdf_path is None and need_thumbnail:
                # fallback: if download of existing PDF failed, try conversion from Office source
                local_pdf_path = self.__convert_office_to_local_pdf()
                should_cleanup_local_pdf = local_pdf_path is not None
        elif need_thumbnail:
            local_pdf_path = self.local_path

        if local_pdf_path is None:
            return []

        alternatives: list[FileAlternative] = []
        try:
            if need_pdf_upload:
                pdf_alternative = self.__upload_pdf_alternative(local_pdf_path=local_pdf_path)
                if pdf_alternative is not None:
                    alternatives.append(pdf_alternative)

            if need_thumbnail:
                thumbnail_alternative = self.__generate_thumbnail_from_pdf(local_pdf_path=local_pdf_path)
                if thumbnail_alternative is not None:
                    alternatives.append(thumbnail_alternative)
        finally:
            if should_cleanup_local_pdf and os.path.exists(local_pdf_path):
                os.remove(local_pdf_path)

        return alternatives

    def generate_extra_data(self, *, force: bool = False) -> ExtraDetailsFile | None:
        return self.file_db.extra_

    def __convert_office_to_local_pdf(self) -> str | None:
        soffice_bin = shutil.which("soffice")
        if not soffice_bin:
            print_warning("LibreOffice binary 'soffice' not found. Skipping PDF generation for", self.local_path)
            return None

        with tempfile.TemporaryDirectory(prefix="doc_to_pdf_") as output_dir:
            output_dir_path = Path(output_dir)
            source_path = Path(self.local_path)

            command = [
                soffice_bin,
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                str(output_dir_path),
                str(source_path),
            ]

            try:
                subprocess.run(command, check=True, capture_output=True, text=True)
            except subprocess.CalledProcessError as exc:
                    print_warning("Error while converting document to PDF:", source_path.name, exc.stderr)
                    return None

            output_pdf_path = output_dir_path / f"{source_path.stem}.pdf"
            if not output_pdf_path.exists():
                pdf_candidates = list(output_dir_path.glob("*.pdf"))
                if len(pdf_candidates) == 0:
                    print_warning("No PDF generated by soffice for", source_path.name)
                    return None
                output_pdf_path = pdf_candidates[0]

            local_output_path = GenericStorage.get_temporary_local_path(suffix=".pdf")
            shutil.copyfile(output_pdf_path, local_output_path)
            return local_output_path

    def __upload_pdf_alternative(self, *, local_pdf_path: str) -> FileAlternative | None:
        if not self.storage or not self.storage_folder_path:
            return None

        storage_suffix = "pdf"
        self.storage.upload(
            local_path=local_pdf_path,
            storage_folder_path=self.storage_folder_path,
            alternative=storage_suffix,
            force=True,
        )

        file_stats = os.stat(local_pdf_path)
        source_path = Path(self.local_path or "")
        base_name = (self.file_db.original_filename or source_path.name).rsplit(".", 1)[0]
        alternative_filename = f"{base_name}.pdf"
        print("Generated PDF alternative:", alternative_filename)

        return FileAlternative(
            alternative_filename=alternative_filename,
            storage_suffix=storage_suffix,
            description="PDF version generated from Office document",
            size=file_stats.st_size,
            kind="document",
            mime="application/pdf",
            extension=".pdf",
        )

    def __download_existing_pdf_alternative_to_local(self) -> str | None:
        if not self.storage or not self.storage_folder_path:
            return None

        local_pdf_path = GenericStorage.get_temporary_local_path(suffix=".pdf")
        downloaded_pdf_path = self.storage.download(
            storage_folder_path=self.storage_folder_path,
            alternative="pdf",
            local_path=local_pdf_path,
            force=True,
        )
        if downloaded_pdf_path is None:
            print_warning("Could not download existing PDF alternative from storage", self.storage_folder_path)
            if os.path.exists(local_pdf_path):
                os.remove(local_pdf_path)
            return None
        return downloaded_pdf_path

    def __generate_thumbnail_from_pdf(self, *, local_pdf_path: str) -> FileAlternative | None:
        if not self.storage or not self.storage_folder_path:
            return None

        try:
            with fitz.open(local_pdf_path) as pdf_document:
                if pdf_document.page_count == 0:
                    print_warning("Cannot generate thumbnail: PDF has no pages", local_pdf_path)
                    return None
                first_page = pdf_document[0]
                pixmap = first_page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), alpha=False)
                image_data = pixmap.tobytes("png")
        except Exception as error:
            print_warning("Error while rendering first PDF page:", error)
            return None

        try:
            pil_image = Image.open(BytesIO(image_data)).convert("RGB")
            pil_image.thumbnail((200, 200), Image.Resampling.LANCZOS)
            local_thumbnail_path = GenericStorage.get_temporary_local_path(suffix=".jpg")
            pil_image.save(local_thumbnail_path, format="JPEG", quality=85, optimize=True)
        except Exception as error:
            print_warning("Error while generating thumbnail image from PDF:", error)
            return None

        self.storage.upload(
            local_path=local_thumbnail_path,
            storage_folder_path=self.storage_folder_path,
            alternative="thumbnail",
            force=True,
        )
        file_stats = os.stat(local_thumbnail_path)
        os.remove(local_thumbnail_path)

        return FileAlternative(
            alternative_filename="thumbnail.jpg",
            storage_suffix="thumbnail",
            description="Thumbnail generated from first page of PDF",
            size=file_stats.st_size,
            kind="image",
            mime="image/jpeg",
            extension=".jpg",
        )

    def _get_extension(self) -> str:
        extension = self.file_db.extension or self.file_db.extension_client
        if extension:
            normalized_extension = extension.lower()
            return normalized_extension if normalized_extension.startswith(".") else f".{normalized_extension}"

        original_filename = self.file_db.original_filename
        if not original_filename:
            return ""
        return Path(original_filename).suffix.lower()
