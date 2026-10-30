"""python -m pdfimport extract|review|upload  (run from the import-tool folder)"""
import argparse
import sys
from pathlib import Path

from .config import Settings
from .store import DEFAULT_DATA_DIR, Workdir, workdir_for


def workdir_from(args) -> Workdir:
    if args.dir:
        return Workdir(args.dir)
    if not (args.course and args.chapter):
        raise SystemExit("Give --course and --chapter, or the work folder with --dir.")
    return Workdir(workdir_for(Path(args.data), args.course, args.chapter))


def add_target(p: argparse.ArgumentParser) -> None:
    p.add_argument("--course", help="Course name exactly as in the admin portal")
    p.add_argument("--chapter", type=int, help="Chapter number")
    p.add_argument("--dir", help="Work folder (instead of --course and --chapter)")
    p.add_argument("--data", default=str(DEFAULT_DATA_DIR), help="Base folder for work folders")


def main(argv=None) -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(prog="pdfimport", description="Import a chapter PDF: text and 1:1 figures.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    ex = sub.add_parser("extract", help="Read a PDF: text per page and figure candidates")
    ex.add_argument("pdf", type=Path)
    ex.add_argument("--course", required=True)
    ex.add_argument("--chapter", type=int, required=True)
    ex.add_argument("--title", help="Chapter title to set on upload")
    ex.add_argument("--data", default=str(DEFAULT_DATA_DIR))
    ex.add_argument("--force", action="store_true", help="Start over (discards an earlier review)")
    ex.add_argument("--dpi", type=int, default=Settings.dpi)
    ex.add_argument("--keep-repeated", action="store_true", help="Keep images that repeat on most pages")

    rv = sub.add_parser("review", help="Open the review screen in your browser")
    add_target(rv)
    rv.add_argument("--port", type=int, default=8765)
    rv.add_argument("--no-browser", action="store_true")

    up = sub.add_parser("upload", help="Send the reviewed chapter to Supabase")
    add_target(up)
    up.add_argument("--dry-run", action="store_true", help="Show what would be uploaded")

    args = ap.parse_args(argv)

    if args.cmd == "extract":
        from .extract import extract_pdf

        if not args.pdf.exists():
            raise SystemExit(f"File not found: {args.pdf}")
        workdir = Workdir(workdir_for(Path(args.data), args.course, args.chapter))
        settings = Settings(dpi=args.dpi, keep_repeated=args.keep_repeated)
        print(f"Reading {args.pdf.name} ...")
        try:
            m = extract_pdf(args.pdf, args.course, args.chapter, args.title, workdir, settings, force=args.force)
        except FileExistsError as e:
            raise SystemExit(str(e))
        for w in m["warnings"]:
            print(f"  warning: {w}")
        print(f"Found {len(m['figures'])} figure candidate(s) in {m['pdf']['page_count']} pages.")
        print(f"Next: python -m pdfimport review --course \"{args.course}\" --chapter {args.chapter}")
    elif args.cmd == "review":
        from .review import serve

        workdir = workdir_from(args)
        if not workdir.exists():
            raise SystemExit(f"Nothing to review in {workdir.path}. Run extract first.")
        serve(workdir, port=args.port, open_browser=not args.no_browser)
    elif args.cmd == "upload":
        from .upload import upload

        workdir = workdir_from(args)
        if not workdir.exists():
            raise SystemExit(f"Nothing to upload in {workdir.path}. Run extract first.")
        upload(workdir, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
