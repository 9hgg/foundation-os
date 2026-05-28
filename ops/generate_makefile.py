import re
from pathlib import Path

ROOT_MAKEFILE = Path(__file__).with_name("Makefile")
REPO_ROOT = ROOT_MAKEFILE.parent.parent
START_TAG = "# === AUTO-GENERATED TARGETS BEGIN ==="
END_TAG = "# === AUTO-GENERATED TARGETS END ==="
CADDY_DIR = Path(__file__).with_name("caddy")


def discover_caddyfiles():
    return sorted(
        path for path in CADDY_DIR.rglob("*.Caddyfile") if "archives" not in path.parts
    )


def target_name_for(path: Path) -> str:
    relative = path.relative_to(CADDY_DIR).with_suffix("")
    parts = ["caddy", *relative.parts]
    return "-".join(parts)


def generate_targets():
    lines = [START_TAG, "", "# === CADDY targets ==="]

    for path in discover_caddyfiles():
        relative = path.relative_to(REPO_ROOT)
        target = target_name_for(path)
        lines.append(f".PHONY: {target}")
        lines.append(f"{target}: ## Run Caddy with {relative}")
        lines.append(
            f"\t@caddy run --config $(ROOT_DIR)/{relative.as_posix()} --adapter caddyfile"
        )
        lines.append("")

    lines.append(END_TAG)
    return "\n".join(lines) + "\n"


def update_root_makefile():
    generated_block = generate_targets()
    content = ROOT_MAKEFILE.read_text() if ROOT_MAKEFILE.exists() else ""
    pattern = rf"{START_TAG}.*?{END_TAG}"

    if re.search(pattern, content, flags=re.DOTALL):
        updated = re.sub(pattern, generated_block, content, flags=re.DOTALL)
    else:
        updated = content.rstrip() + "\n\n" + generated_block

    ROOT_MAKEFILE.write_text(updated.rstrip() + "\n")
    print(f"✅ Updated {ROOT_MAKEFILE}")


if __name__ == "__main__":
    update_root_makefile()
