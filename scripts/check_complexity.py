"""Fail when any function/method has cyclomatic complexity above the allowed maximum (radon)."""

import argparse
import sys
from pathlib import Path

from radon.complexity import cc_visit

DEFAULT_PATHS = ["backend", "scripts", "api"]
SKIP_PARTS = {
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    "tests",
}  # production code only


def iter_python_files(paths: list[str]):
    for root in paths:
        for path in sorted(Path(root).rglob("*.py")):
            if not SKIP_PARTS.intersection(path.parts):
                yield path


def find_violations(paths: list[str], max_complexity: int) -> tuple[int, list[str]]:
    """Return (blocks checked, formatted violations) for blocks above ``max_complexity``."""
    checked, violations = 0, []
    for path in iter_python_files(paths):
        for block in cc_visit(path.read_text(encoding="utf-8")):
            checked += 1
            if block.complexity > max_complexity:
                violations.append(
                    f"{path}:{block.lineno} {block.name} = {block.complexity}"
                )
    return checked, violations


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*", default=DEFAULT_PATHS)
    parser.add_argument("--max", type=int, default=9, dest="max_complexity")
    args = parser.parse_args()

    checked, violations = find_violations(args.paths, args.max_complexity)
    print(
        f"Checked {checked} blocks (max cyclomatic complexity: {args.max_complexity})."
    )
    if violations:
        print(f"FAILED: {len(violations)} block(s) exceed the limit:")
        print("\n".join(f"  - {v}" for v in violations))
        return 1
    print("PASSED: complexity within limit.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
