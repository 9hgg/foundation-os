import json
import os

from ..models import ExtraDetailsFile, FileAlternative
from ._generic import GenericProcessor


class FmuProcessor(GenericProcessor):
    __kind__ = "fmu"

    def generate_alternatives(self, *, force: bool = False) -> list[FileAlternative]:
        try:
            from libs.simulation.methods import inspect_fmu_from_local_path
        except Exception:
            return []

        local_path = self.local_path
        if local_path is None or self.storage is None or self.storage_folder_path is None:
            return []

        try:
            inspection_result = inspect_fmu_from_local_path(fmu_path=local_path)
        except Exception:
            return []

        model_description_output_path = self.storage.get_temporary_local_path(
            suffix=".json"
        )
        inspection_result_as_dict = inspection_result.model_dump()
        with open(model_description_output_path, "w", encoding="utf-8") as output_file:
            json.dump(inspection_result_as_dict, output_file, indent=2, ensure_ascii=False)

        uploaded = self.storage.upload(
            local_path=model_description_output_path,
            storage_folder_path=self.storage_folder_path,
            alternative="description",
            force=force,
        )
        if os.path.exists(model_description_output_path):
            os.remove(model_description_output_path)
        if not uploaded:
            return []

        return [
            FileAlternative(
                description="FMU model description",
                alternative_filename=(
                    f"{self.file_db.original_filename or self.file_db.id.hex}.description.json"
                ),
                storage_suffix="description",
                size=float(len(json.dumps(inspection_result_as_dict))),
                mime="application/json",
                kind="fmu",
                extension=".json",
            )
        ]

    def generate_extra_data(self, *, force: bool = False) -> ExtraDetailsFile | None:
        return ExtraDetailsFile()
