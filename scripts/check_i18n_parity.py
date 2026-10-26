#!/usr/bin/env python3
"""Fail when English and Canadian French catalogs disagree.

Checks Android string resources, the server message catalogs, and the
projector message module. Missing keys, extra keys, mismatched format
placeholders, and French punctuation that is missing its required
non-breaking space are all failures.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NBSP = "\u00a0"
PUNCTUATION = ":?!"
ANDROID_STRING = re.compile(
    r'<string\s+name="([^"]+)"[^>]*>(.*?)</string>',
    re.DOTALL,
)
ANDROID_FORMAT = re.compile(r"%(?:\d+\$)?[sdif]")
PLACEHOLDER = re.compile(r"\{(\w+)\}")
JS_UNICODE = re.compile(r"\\u([0-9a-fA-F]{4})")


def decode_android(value: str) -> str:
    text = value.replace(r"\u00A0", NBSP).replace(r"\u00a0", NBSP)
    text = text.replace("&#160;", NBSP).replace("&nbsp;", NBSP)
    return text.replace(r"\'", "'").replace(r"\"", '"')


def decode_js(value: str) -> str:
    text = JS_UNICODE.sub(lambda match: chr(int(match.group(1), 16)), value)
    return text.replace(r"\'", "'").replace(r"\"", '"')


def french_punctuation_issues(text: str) -> list[str]:
    """Canadian French requires a non-breaking space before : ? !."""
    issues: list[str] = []
    for index, char in enumerate(text):
        if char not in PUNCTUATION:
            continue
        if index == 0:
            issues.append(f"punctuation {char!r} has no preceding character")
            continue
        previous = text[index - 1]
        if char == ":" and previous.isdigit():
            continue
        if previous == NBSP:
            continue
        issues.append(f"{previous!r} precedes {char!r}")
    return issues


def android_strings(directory: Path) -> dict[str, str]:
    found: dict[str, str] = {}
    duplicates: list[str] = []
    for path in sorted(directory.glob("*.xml")):
        for name, value in ANDROID_STRING.findall(path.read_text(encoding="utf-8")):
            if name in found:
                duplicates.append(f"{name} in {path.name}")
            found[name] = value
    if duplicates:
        raise SystemExit("duplicate Android string names: " + ", ".join(duplicates))
    return found


def compare_named(
    label: str,
    english: dict[str, str],
    french: dict[str, str],
    *,
    decode,
) -> list[str]:
    problems: list[str] = []
    missing = sorted(set(english) - set(french))
    extra = sorted(set(french) - set(english))
    if missing:
        problems.append(f"{label}: missing French keys: {', '.join(missing)}")
    if extra:
        problems.append(f"{label}: extra French keys: {', '.join(extra)}")
    for key in sorted(set(english) & set(french)):
        en_text = decode(english[key])
        fr_text = decode(french[key])
        en_formats = ANDROID_FORMAT.findall(en_text) or PLACEHOLDER.findall(en_text)
        fr_formats = ANDROID_FORMAT.findall(fr_text) or PLACEHOLDER.findall(fr_text)
        # Compare the placeholder family that is actually used, not both.
        if ANDROID_FORMAT.findall(en_text) or ANDROID_FORMAT.findall(fr_text):
            if ANDROID_FORMAT.findall(en_text) != ANDROID_FORMAT.findall(fr_text):
                problems.append(f"{label}: format mismatch for {key}")
        if PLACEHOLDER.findall(en_text) != PLACEHOLDER.findall(fr_text):
            problems.append(f"{label}: placeholder mismatch for {key}")
        for issue in french_punctuation_issues(fr_text):
            problems.append(f"{label}: French punctuation in {key}: {issue}")
    return problems


def js_locale_entries(source: str) -> dict[str, dict[str, str]]:
    entries: dict[str, dict[str, str]] = {}
    for locale in ("en", "fr"):
        marker = f"{locale}: {{"
        start = source.find(marker)
        if start < 0:
            raise SystemExit(f"projector messages are missing the {locale} catalog")
        opening = start + len(marker) - 1
        depth = 0
        end = None
        for index in range(opening, len(source)):
            if source[index] == "{":
                depth += 1
            elif source[index] == "}":
                depth -= 1
                if depth == 0:
                    end = index
                    break
        if end is None:
            raise SystemExit(f"projector {locale} catalog is not closed")
        block = source[opening + 1 : end]
        locale_entries: dict[str, str] = {}
        for match in re.finditer(
            r"^\s{4}(\w+):\s+'((?:\\'|[^'])*)'",
            block,
            re.MULTILINE,
        ):
            locale_entries[match.group(1)] = match.group(2)
        entries[locale] = locale_entries
    return entries


def collect_problems() -> list[str]:
    problems: list[str] = []
    for module in ("app", "manager"):
        base = ROOT / "android" / module / "src" / "main" / "res"
        english = android_strings(base / "values")
        french = android_strings(base / "values-fr")
        problems.extend(
            compare_named(
                f"android/{module}",
                english,
                french,
                decode=decode_android,
            )
        )

    server_en = json.loads((ROOT / "pi-server/messages/en.json").read_text(encoding="utf-8"))
    server_fr = json.loads((ROOT / "pi-server/messages/fr.json").read_text(encoding="utf-8"))
    problems.extend(compare_named("server", server_en, server_fr, decode=lambda value: value))

    projector = (ROOT / "pi-server/static/projector/messages.js").read_text(encoding="utf-8")
    locales = js_locale_entries(projector)
    problems.extend(compare_named("projector", locales["en"], locales["fr"], decode=decode_js))
    return problems


def main() -> int:
    problems = collect_problems()
    if problems:
        print("i18n parity check failed:", file=sys.stderr)
        for problem in problems:
            print(f"- {problem}", file=sys.stderr)
        return 1
    print("i18n catalogs match for English and Canadian French.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
