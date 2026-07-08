"""Language registry — maps ISO 639-1 codes to display names.

Used to turn a CV/UI language code into a human name for AI prompts
(``{lang_name}``) and to validate/label language choices. Any unknown 2-letter
code degrades gracefully to the code itself, so the app is not limited to this
list — it just has nicer names for the common ones.
"""

# code → (english_name, native_name)
LANGUAGES: dict[str, tuple[str, str]] = {
    "en": ("English", "English"),
    "nl": ("Dutch", "Nederlands"),
    "fr": ("French", "Français"),
    "de": ("German", "Deutsch"),
    "es": ("Spanish", "Español"),
    "it": ("Italian", "Italiano"),
    "pt": ("Portuguese", "Português"),
    "pl": ("Polish", "Polski"),
    "sv": ("Swedish", "Svenska"),
    "da": ("Danish", "Dansk"),
    "no": ("Norwegian", "Norsk"),
    "fi": ("Finnish", "Suomi"),
    "cs": ("Czech", "Čeština"),
    "sk": ("Slovak", "Slovenčina"),
    "ro": ("Romanian", "Română"),
    "hu": ("Hungarian", "Magyar"),
    "el": ("Greek", "Ελληνικά"),
    "tr": ("Turkish", "Türkçe"),
    "uk": ("Ukrainian", "Українська"),
    "ru": ("Russian", "Русский"),
    "zh": ("Chinese", "中文"),
    "ja": ("Japanese", "日本語"),
    "ko": ("Korean", "한국어"),
    "hi": ("Hindi", "हिन्दी"),
    "ar": ("Arabic", "العربية"),
    "he": ("Hebrew", "עברית"),
    "vi": ("Vietnamese", "Tiếng Việt"),
    "id": ("Indonesian", "Bahasa Indonesia"),
    "th": ("Thai", "ไทย"),
}


def lang_name(code: str) -> str:
    """English name for the CV-generation prompt, e.g. 'Dutch (Nederlands)'.

    Falls back to the raw code so an unusual language still produces a sensible
    instruction ('Write ALL generated text in <code>')."""
    code = (code or "").lower()
    entry = LANGUAGES.get(code)
    if not entry:
        return code or "English"
    english, native = entry
    return english if english == native else f"{english} ({native})"


def is_valid_code(code: str) -> bool:
    """A registered language or any plausible 2-letter ISO code."""
    code = (code or "").lower()
    return code in LANGUAGES or (len(code) == 2 and code.isalpha())
