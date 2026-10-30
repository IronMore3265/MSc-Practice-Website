"""The local work folder for one chapter: manifest.json, pages.json and figures/."""
import hashlib
import json
import os
import re
from pathlib import Path

TOOL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DATA_DIR = TOOL_DIR / "data"


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "course"


def workdir_for(base: Path, course: str, chapter: int) -> Path:
    return Path(base) / slug(course) / f"ch-{chapter:02d}"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def write_json(path: Path, data) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)


class Workdir:
    def __init__(self, path):
        self.path = Path(path)
        self.manifest_path = self.path / "manifest.json"
        self.pages_path = self.path / "pages.json"
        self.figures_dir = self.path / "figures"
        self.previews_dir = self.path / "previews"

    def exists(self) -> bool:
        return self.manifest_path.exists()

    def load(self) -> dict:
        return json.loads(self.manifest_path.read_text(encoding="utf-8"))

    def save(self, manifest: dict) -> None:
        write_json(self.manifest_path, manifest)

    def load_pages(self) -> list[dict]:
        return json.loads(self.pages_path.read_text(encoding="utf-8"))
