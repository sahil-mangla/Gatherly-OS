#!/usr/bin/env python3
"""Enforce strict < 200 LOC per file across Python and JavaScript code."""

import os
import sys

MAX_LINES = 200
TARGET_DIRS = ["backend", "frontend/src"]
EXTENSIONS = (".py", ".js")


def check_file(path: str) -> int:
    with open(path, "r", encoding="utf-8") as f:
        return sum(1 for _ in f)


def main() -> int:
    violations = []
    total_checked = 0

    for root_dir in TARGET_DIRS:
        for root, _, files in os.walk(root_dir):
            if "node_modules" in root or "__pycache__" in root or ".pytest_cache" in root:
                continue
            for file in files:
                if any(file.endswith(ext) for ext in EXTENSIONS):
                    file_path = os.path.join(root, file)
                    lines = check_file(file_path)
                    total_checked += 1
                    if lines > MAX_LINES:
                        violations.append((file_path, lines))

    print(f"Checked {total_checked} files for line-count compliance (limit: {MAX_LINES} lines).")
    if violations:
        print(f"FAILED: Found {len(violations)} files exceeding {MAX_LINES} lines:")
        for path, count in violations:
            print(f"  - {path}: {count} lines")
        return 1

    print("PASSED: All files are within the 200-line limit.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
