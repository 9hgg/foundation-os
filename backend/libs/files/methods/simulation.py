def infer_simulation_file_details(
    *,
    extension_client: str | None = None,
    extension: str | None = None,
) -> dict[str, str] | None:
    normalized_extension = (extension_client or extension or "").lower()
    if normalized_extension.startswith("."):
        normalized_extension = normalized_extension[1:]

    if normalized_extension == "fmu":
        return {
            "mime": "application/fmu",
            "extension": ".fmu",
            "kind": "fmu",
        }

    if normalized_extension in {"mo", "mos"}:
        return {
            "mime": "text/x-modelica",
            "extension": f".{normalized_extension}",
            "kind": "modelica",
        }

    return None
