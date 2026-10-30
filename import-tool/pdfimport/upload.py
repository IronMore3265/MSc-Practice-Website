"""Upload a reviewed chapter to Supabase: PDF row, page text, approved figures (database rows and storage files).

Uses the service role key from import-tool/.env. Safe to run again: rows are matched on the chapter, the page
number and the figure's import key, and figures that are no longer approved are removed.
"""
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import requests

from .store import TOOL_DIR, Workdir

BUCKET = "figures"
BATCH = 40


def load_env(path: Path | None = None) -> dict:
    """Read KEY=VALUE lines from import-tool/.env. Real environment variables win."""
    values: dict = {}
    path = path or TOOL_DIR / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                values[k.strip()] = v.strip().strip('"').strip("'")
    for k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        if os.environ.get(k):
            values[k] = os.environ[k]
    return values


class Supabase:
    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/")
        self.http = requests.Session()
        # Legacy keys are JWTs and go in both headers. New sb_secret_ keys go in apikey only.
        self.http.headers["apikey"] = key
        if key.startswith("eyJ"):
            self.http.headers["Authorization"] = f"Bearer {key}"

    def rest(self, method: str, table: str, *, params=None, json=None, prefer: str | None = None):
        headers = {"Prefer": prefer} if prefer else {}
        r = self.http.request(method, f"{self.url}/rest/v1/{table}", params=params, json=json, headers=headers, timeout=60)
        if not r.ok:
            raise RuntimeError(f"{method} {table} failed ({r.status_code}): {r.text[:300]}")
        return r.json() if r.content else None

    def put_object(self, path: str, data: bytes, mime: str) -> None:
        r = self.http.post(
            f"{self.url}/storage/v1/object/{BUCKET}/{quote(path)}",
            data=data, headers={"Content-Type": mime, "x-upsert": "true", "Cache-Control": "max-age=31536000"}, timeout=120,
        )
        if not r.ok:
            raise RuntimeError(f"Storage upload of {path} failed ({r.status_code}): {r.text[:300]}")

    def delete_objects(self, paths: list[str]) -> None:
        if not paths:
            return
        r = self.http.delete(f"{self.url}/storage/v1/object/{BUCKET}", json={"prefixes": paths}, timeout=60)
        if not r.ok:
            raise RuntimeError(f"Storage delete failed ({r.status_code}): {r.text[:300]}")


def summarize(manifest: dict) -> dict:
    counts = {"approved": 0, "pending": 0, "rejected": 0}
    for f in manifest["figures"]:
        counts[f["status"]] += 1
    return counts


def upload(workdir: Workdir, dry_run: bool = False, log=print) -> None:
    manifest = workdir.load()
    counts = summarize(manifest)
    approved = [f for f in manifest["figures"] if f["status"] == "approved"]
    log(f"{manifest['course']}, chapter {manifest['chapter']}: {len(manifest['pages'])} pages, "
        f"{counts['approved']} approved, {counts['pending']} pending, {counts['rejected']} rejected figures.")
    if counts["pending"]:
        log(f"  {counts['pending']} pending figure(s) are NOT uploaded. Review them first, or reject the ones you do not want.")
    if dry_run:
        log("Dry run: nothing was sent.")
        return

    env = load_env()
    if not env.get("SUPABASE_URL") or not env.get("SUPABASE_SERVICE_ROLE_KEY"):
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in import-tool/.env (see .env.example).")
    db = Supabase(env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])

    courses = db.rest("GET", "course", params={"select": "id", "name": f"eq.{manifest['course']}"})
    if not courses:
        names = [c["name"] for c in db.rest("GET", "course", params={"select": "name", "order": "sort_order"})]
        raise SystemExit(
            f"No course named '{manifest['course']}'. Courses on the site: {', '.join(repr(n) for n in names) or 'none'}.\n"
            "Fix the name by running extract again with --force, or add the course in the admin portal."
        )
    course_id = courses[0]["id"]

    chapters = db.rest("GET", "chapter", params={"select": "id,title", "course_id": f"eq.{course_id}", "number": f"eq.{manifest['chapter']}"})
    title = manifest.get("title")
    if chapters:
        chapter_id = chapters[0]["id"]
        if title and title != chapters[0]["title"]:
            db.rest("PATCH", "chapter", params={"id": f"eq.{chapter_id}"}, json={"title": title})
            log(f"  chapter title set to '{title}'")
    else:
        row = db.rest("POST", "chapter", json={"course_id": course_id, "number": manifest["chapter"], "title": title or f"Chapter {manifest['chapter']}"}, prefer="return=representation")
        chapter_id = row[0]["id"]
        log("  chapter did not exist, created it")

    pages = workdir.load_pages()
    blank = sum(1 for p in manifest["pages"] if p["text_chars"] < 20)
    pdf_row = db.rest(
        "POST", "source_pdf", params={"on_conflict": "chapter_id"}, prefer="resolution=merge-duplicates,return=representation",
        json={
            "chapter_id": chapter_id, "filename": manifest["pdf"]["filename"], "sha256": manifest["pdf"]["sha256"],
            "page_count": manifest["pdf"]["page_count"], "pages_without_text": blank,
            "figures_pending": counts["pending"], "review_status": "in_review" if counts["pending"] else "reviewed",
            "imported_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    pdf_id = pdf_row[0]["id"]

    for i in range(0, len(pages), BATCH):
        rows = [{"pdf_id": pdf_id, "page": p["page"], "text": p["text"]} for p in pages[i : i + BATCH]]
        db.rest("POST", "page_text", params={"on_conflict": "pdf_id,page"}, json=rows, prefer="resolution=merge-duplicates")
    db.rest("DELETE", "page_text", params={"pdf_id": f"eq.{pdf_id}", "page": f"gt.{len(pages)}"})
    log(f"  uploaded text for {len(pages)} pages")

    remote = db.rest("GET", "figure", params={"select": "import_key,blob_path", "pdf_id": f"eq.{pdf_id}"})
    keep = {f["key"] for f in approved}
    stale = [r for r in remote if r["import_key"] not in keep]

    for n, f in enumerate(approved, 1):
        ext = Path(f["file"]).suffix.lstrip(".")
        blob_path = f"{course_id}/{manifest['chapter']:02d}/{f['key']}.{ext}"
        db.put_object(blob_path, (workdir.path / f["file"]).read_bytes(), f["mime_type"])
        db.rest(
            "POST", "figure", params={"on_conflict": "pdf_id,import_key"}, prefer="resolution=merge-duplicates",
            json={
                "pdf_id": pdf_id, "chapter_id": chapter_id, "import_key": f["key"], "page": f["page"], "bbox": f["bbox"],
                "label": f.get("label"), "caption": f.get("caption"), "kind": f["kind"], "source": f["source"],
                "blob_path": blob_path, "mime_type": f["mime_type"], "width": f["width"], "height": f["height"], "sha256": f["sha256"],
            },
        )
        log(f"  figure {n}/{len(approved)}: page {f['page']} {f.get('label') or ''}".rstrip())

    # A figure whose file changed extension (original image replaced by a render) leaves the old file behind.
    current = {f"{course_id}/{manifest['chapter']:02d}/{f['key']}.{Path(f['file']).suffix.lstrip('.')}" for f in approved}
    old_paths = [r["blob_path"] for r in remote if r["blob_path"] not in current]
    if stale:
        db.rest("DELETE", "figure", params={"pdf_id": f"eq.{pdf_id}", "import_key": "in.(" + ",".join(r["import_key"] for r in stale) + ")"})
        log(f"  removed {len(stale)} figure(s) that are no longer approved")
    db.delete_objects(old_paths)
    log("Done.")
