"""
Demo: extract all visible text from the Curiosity example SVG (mechanical schema).

Usage (from backend/):
    uv run python libs/svg/demos/extract_text_demo.py
    uv run python libs/svg/demos/extract_text_demo.py --svg-path /path/to/other.svg
"""

from pathlib import Path

import typer

from libs.svg import extract_text_from_svg

app = typer.Typer(no_args_is_help=True)

_DEFAULT_SVG_PATH = (
    Path(__file__).resolve().parents[4]
    / "frontend"
    / "apps"
    / "curiosity"
    / "src"
    / "assets"
    / "example.svg"
)


@app.command()
def main(
    svg_path: Path = typer.Option(  # noqa: B008
        _DEFAULT_SVG_PATH,
        "--svg-path",
        "-f",
        help="Path to the SVG file to extract text from.",
        exists=True,
        file_okay=True,
        dir_okay=False,
    ),
    show_count: bool = typer.Option(True, "--count/--no-count", help="Show total count."),
) -> None:
    """Extract and display all visible text strings found in an SVG file."""
    typer.echo(f"Reading SVG: {svg_path}")
    svg_content = svg_path.read_text(encoding="utf-8", errors="replace")

    texts = extract_text_from_svg(svg_content)

    typer.echo(f"\nExtracted {len(texts)} unique text strings:\n")
    for text in texts:
        typer.echo(f"  {text}")

    if show_count:
        typer.echo(f"\nTotal: {len(texts)} strings")


if __name__ == "__main__":
    app()
