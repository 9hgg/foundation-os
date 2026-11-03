import os
import subprocess

from .types import BaseModelWithConfig


def get_release() -> str | None:
    """The short git SHA of the running code, for Sentry release tracking.

    Tries a checked-out .git first (the VM's systemd deploys run from a live
    clone). Falls back to the GIT_SHA env var (for Docker images built
    without .git, e.g. the Cloud Run worker — bake it in at build time via
    ``--build-arg GIT_SHA=$(git rev-parse --short HEAD)``). Returns None if
    neither is available.
    """
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return os.environ.get("GIT_SHA")


class ReleaseInfo(BaseModelWithConfig):
    sha: str | None = None
    message: str | None = None
    date: str | None = None


def get_release_info() -> ReleaseInfo:
    """Sha + subject + author date of the running code's commit, for display
    (e.g. an admin dashboard). Only available when a .git checkout is present
    (the VM's systemd deploys) — a Docker image with only GIT_SHA baked in
    gets just the sha, no message/date (not worth baking those in too, they're
    only ever useful for humans looking at a live admin page).
    """
    try:
        sha, message, date = subprocess.check_output(
            ["git", "log", "-1", "--format=%h%n%s%n%cI"],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip().split("\n", 2)
    except (OSError, subprocess.CalledProcessError, ValueError):
        return ReleaseInfo(sha=os.environ.get("GIT_SHA"))
    return ReleaseInfo(sha=sha, message=message, date=date)
