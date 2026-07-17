require "zip"

# Entry names in the account archive are UTF-8 and routinely Japanese (a company name is a
# company name — see SPEC.md § Download filenames, which declines to transliterate them).
# rubyzip writes those bytes either way, but leaves the EFS flag — general-purpose bit 11, the
# one that tells an extractor the name is UTF-8 rather than CP437 — unset by default. Strict
# extractors then decode the name as CP437 and produce mojibake.
#
# Set once at boot: this is a global, and setting it per-archive would be a race.
Zip.unicode_names = true
