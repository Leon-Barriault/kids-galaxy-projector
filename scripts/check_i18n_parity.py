#!/usr/bin/env python3
"""Fail when English and Canadian French catalogs disagree.

Checks Android string resources, the server message catalogs, the
projector message module, and the parent/teacher guides. Missing keys,
extra keys, mismatched format placeholders, French punctuation without a
non-breaking space, and user-guide sections that do not match are failures.
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
        en_android = ANDROID_FORMAT.findall(en_text)
        fr_android = ANDROID_FORMAT.findall(fr_text)
        if (en_android or fr_android) and en_android != fr_android:
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


MARKER = re.compile(r"<!--\s*(section|step|fix|problem|photo):\s*([a-z0-9-]+)\s*-->")
CODE_FENCE = re.compile(r"```.*?```", re.DOTALL)
HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
MARKDOWN_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
INLINE_CODE = re.compile(r"`[^`]+`")
SENTENCE_SPLIT = re.compile(r"[^.!?]+[.!?]")
USER_GUIDES = (
    "install.md",
    "daily.md",
    "troubleshooting.md",
    "quick-start.md",
    "production-setup.md",
    "kid-tablet.md",
)
REQUIRED_GUIDE_MARKERS = {
    "production-setup.md": (
        "section:hardware",
        "section:network",
        "section:wsl",
        "section:travel",
        "section:specs",
        "section:computer",
        "section:docker",
        "section:certificates",
        "section:renew",
        "section:lost",
        "section:tablets",
        "section:first-run",
        "section:backup",
        "section:restore",
        "section:update",
        "section:rollback",
        "section:watch",
        "section:golive",
        "section:kid",
    ),
    "kid-tablet.md": (
        "section:specs",
        "section:case",
        "section:protector",
        "section:kiosk",
        "section:block",
        "section:boot",
        "section:charge",
        "section:dropped",
        "section:replace",
        "section:limits",
    ),
}
MAX_SENTENCE_WORDS = 22
MAX_AVERAGE_WORDS = 16
MAX_ENGLISH_GRADE = 8.5


def marker_sequence(text: str) -> list[tuple[str, str]]:
    return [(kind, name) for kind, name in MARKER.findall(text)]


def prose_for_reading(text: str) -> str:
    stripped = CODE_FENCE.sub(" ", text)
    stripped = HTML_COMMENT.sub(" ", stripped)
    stripped = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", stripped)
    stripped = MARKDOWN_LINK.sub(r"\1", stripped)
    stripped = INLINE_CODE.sub(" ", stripped)
    kept_lines: list[str] = []
    for line in stripped.splitlines():
        if line.strip().startswith("|"):
            continue
        kept_lines.append(line)
    return "\n".join(kept_lines)


def sentences_of(text: str) -> list[str]:
    found: list[str] = []
    for paragraph in re.split(r"\n\s*\n", text):
        cleaned = re.sub(r"^[#>*\-\d.\)\s]+", " ", paragraph, flags=re.MULTILINE)
        for match in SENTENCE_SPLIT.findall(cleaned):
            words = re.findall(r"[A-Za-zÀ-ÿ0-9']+", match)
            if len(words) >= 3:
                found.append(match.strip())
    return found


def word_count(sentence: str) -> int:
    return len(re.findall(r"[A-Za-zÀ-ÿ0-9']+", sentence))


def syllable_count(word: str) -> int:
    letters = re.sub(r"[^a-z]", "", word.lower())
    if not letters:
        return 1
    groups = re.findall(r"[aeiouy]+", letters)
    count = len(groups)
    if letters.endswith("e") and count > 1:
        count -= 1
    return max(1, count)


def flesch_kincaid_grade(sentences: list[str]) -> float:
    words = [word for sentence in sentences for word in re.findall(r"[A-Za-z0-9']+", sentence)]
    if not sentences or not words:
        return 0.0
    syllables = sum(syllable_count(word) for word in words)
    return 0.39 * (len(words) / len(sentences)) + 11.8 * (syllables / len(words)) - 15.59


def reading_problems(label: str, text: str, *, english: bool) -> list[str]:
    problems: list[str] = []
    prose = prose_for_reading(text)
    found = sentences_of(prose)
    if not found:
        return [f"{label}: no sentences to check"]
    lengths = [word_count(sentence) for sentence in found]
    too_long = [sentence for sentence in found if word_count(sentence) > MAX_SENTENCE_WORDS]
    for sentence in too_long[:5]:
        problems.append(f"{label}: sentence is too long ({word_count(sentence)} words): {sentence}")
    if len(too_long) > 5:
        problems.append(
            f"{label}: {len(too_long)} sentences are longer than {MAX_SENTENCE_WORDS} words"
        )
    average = sum(lengths) / len(lengths)
    if average > MAX_AVERAGE_WORDS:
        problems.append(f"{label}: average sentence is {average:.1f} words")
    if english:
        grade = flesch_kincaid_grade(found)
        if grade > MAX_ENGLISH_GRADE:
            problems.append(f"{label}: reading grade is {grade:.1f}, above {MAX_ENGLISH_GRADE}")
    return problems


def user_guide_problems() -> list[str]:
    problems: list[str] = []
    english_root = ROOT / "docs" / "user" / "en"
    french_root = ROOT / "docs" / "user" / "fr"
    for name in USER_GUIDES:
        english_path = english_root / name
        french_path = french_root / name
        if not english_path.is_file() or not french_path.is_file():
            problems.append(f"user guide missing pair: {name}")
            continue
        english = english_path.read_text(encoding="utf-8")
        french = french_path.read_text(encoding="utf-8")
        english_markers = marker_sequence(english)
        french_markers = marker_sequence(french)
        if english_markers != french_markers:
            problems.append(f"user guide {name}: English and French sections or steps differ")
            english_ids = [f"{kind}:{marker}" for kind, marker in english_markers]
            french_ids = [f"{kind}:{marker}" for kind, marker in french_markers]
            missing = [item for item in english_ids if item not in french_ids]
            extra = [item for item in french_ids if item not in english_ids]
            if missing:
                problems.append(f"user guide {name}: missing in French: {', '.join(missing)}")
            if extra:
                problems.append(f"user guide {name}: extra in French: {', '.join(extra)}")
        if not english_markers:
            problems.append(f"user guide {name}: no section markers")
        required = REQUIRED_GUIDE_MARKERS.get(name, ())
        english_ids = [f"{kind}:{marker}" for kind, marker in english_markers]
        for required_id in required:
            if required_id not in english_ids:
                problems.append(f"user guide {name}: missing required marker {required_id}")
        problems.extend(reading_problems(f"user guide en/{name}", english, english=True))
        problems.extend(reading_problems(f"user guide fr/{name}", french, english=False))
        for issue in french_punctuation_issues(prose_for_reading(french)):
            problems.append(f"user guide fr/{name}: French punctuation: {issue}")
    return problems


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
    problems.extend(user_guide_problems())
    return problems


def main() -> int:
    problems = collect_problems()
    if problems:
        print("i18n parity check failed:", file=sys.stderr)
        for problem in problems:
            print(f"- {problem}", file=sys.stderr)
        return 1
    print("i18n catalogs and user guides match for English and Canadian French.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
