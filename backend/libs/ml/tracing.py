"""Rich-based execution tracing for LLM and AI system runs."""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from textwrap import shorten
from typing import Any

from rich.console import Console, Group
from rich.json import JSON
from rich.padding import Padding
from rich.panel import Panel
from rich.pretty import Pretty
from rich.rule import Rule
from rich.syntax import Syntax
from rich.text import Text

_TRACE_DEPTH: ContextVar[int] = ContextVar("_TRACE_DEPTH", default=0)


@dataclass
class RichTracer:
    """Render nested runtime traces with Rich panels and rules."""

    console: Console
    enabled: bool = True
    indent_width: int = 2
    width: int = 100

    def _pad(self, renderable: Any) -> Padding:
        depth = _TRACE_DEPTH.get()
        return Padding(renderable, (0, 0, 0, depth * self.indent_width))

    @contextmanager
    def section(self, title: str, *, style: str = "cyan", subtitle: str | None = None):
        """Render a nested section boundary and indent nested events."""

        if not self.enabled:
            yield
            return
        self.console.print(self._pad(Rule(title=title, style=style)))
        if subtitle:
            self.console.print(self._pad(Text(subtitle, style=style)))
        token = _TRACE_DEPTH.set(_TRACE_DEPTH.get() + 1)
        try:
            yield
        finally:
            _TRACE_DEPTH.reset(token)

    def line(self, text: str, *, style: str = "white") -> None:
        """Render a single indented line."""

        if not self.enabled:
            return
        self.console.print(self._pad(Text(text, style=style)))

    def kv(self, title: str, entries: list[tuple[str, Any]], *, style: str = "white") -> None:
        """Render a compact key/value panel."""

        if not self.enabled:
            return
        body = "\n".join(f"{key}: {value}" for key, value in entries)
        self.console.print(self._pad(Panel.fit(body, title=title, border_style=style)))

    def text_block(self, title: str, text: str, *, style: str = "blue", language: str | None = None) -> None:
        """Render a multiline text block inside a panel."""

        if not self.enabled:
            return
        content = text.strip() or "<empty>"
        renderable: Any
        if language is not None:
            renderable = Syntax(content, language, word_wrap=True, theme="monokai", line_numbers=False)
        else:
            renderable = Text(content)
        self.console.print(
            self._pad(
                Panel(
                    renderable,
                    title=title,
                    border_style=style,
                    width=self.width,
                    expand=False,
                )
            )
        )

    def json_block(self, title: str, data: Any, *, style: str = "green") -> None:
        """Render JSON-like data in a panel."""

        if not self.enabled:
            return
        self.console.print(
            self._pad(
                Panel(
                    JSON.from_data(data),
                    title=title,
                    border_style=style,
                    width=self.width,
                    expand=False,
                )
            )
        )

    def pretty_block(self, title: str, data: Any, *, style: str = "green", max_chars: int = 3000) -> None:
        """Render arbitrary Python data with truncation."""

        if not self.enabled:
            return
        if isinstance(data, str):
            content = data if len(data) <= max_chars else f"{data[:max_chars]}...<truncated>"
            renderable: Any = Syntax(content, "text", word_wrap=True, theme="monokai", line_numbers=False)
        else:
            renderable = Pretty(
                data,
                max_length=max_chars,
                max_string=max_chars,
                indent_guides=True,
                expand_all=False,
            )
        self.console.print(
            self._pad(
                Panel(
                    renderable,
                    title=title,
                    border_style=style,
                    width=self.width,
                    expand=False,
                )
            )
        )

    def summary(self, title: str, lines: list[str], *, style: str = "white") -> None:
        """Render a titled summary list."""

        if not self.enabled:
            return
        group = Group(*[Text(shorten(line, width=self.width - 8, placeholder="..."), style=style) for line in lines])
        self.console.print(
            self._pad(
                Panel(group, title=title, border_style=style, width=self.width, expand=False)
            )
        )


TRACE = RichTracer(console=Console())
