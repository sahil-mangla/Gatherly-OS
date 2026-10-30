#!/usr/bin/env python3
"""Enforce strict < 200 LOC per file across Python and JavaScript code."""

import os
import sys

MAX_LINES = 200
TARGET_DIRS = ["backend", "frontend", "scripts", "tests", "api"]
EXTENSIONS = (".py", ".js")
SKIP_DIRS = ("node_modules", "__pycache__", ".pytest_cache")


def check_file(path: str) -> int:
    with open(path, "r", encoding="utf-8") as f:
        return sum(1 for _ in f)


def iter_source_files():
    for root_dir in TARGET_DIRS:
        for root, _, files in os.walk(root_dir):
            if any(skip in root for skip in SKIP_DIRS):
                continue
            for file in files:
                if file.endswith(EXTENSIONS):
                    yield os.path.join(root, file)


def main() -> int:
    paths = list(iter_source_files())
    total_checked = len(paths)
    violations = [(p, n) for p in paths if (n := check_file(p)) > MAX_LINES]

    print(
        f"Checked {total_checked} files for line-count compliance (limit: {MAX_LINES} lines)."
    )
    if violations:
        print(f"FAILED: Found {len(violations)} files exceeding {MAX_LINES} lines:")
        for path, count in violations:
            print(f"  - {path}: {count} lines")
        return 1

    print("PASSED: All files are within the 200-line limit.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
