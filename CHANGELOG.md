# Changelog

## Unreleased

- Paid skins now use license keys from Polar. Paste the key and press Activate; it is checked once at `api.polar.sh` and after that quietly at most once every 30 days. Only the key and the date of the check are stored. The settings have a Buy button that opens the Polar checkout.
- The old offline key check (`RW1-...` keys) is removed. No such keys were ever sold.
- The settings of Rollwright can be found with the settings search of Obsidian 1.13 and later. Older versions show the same settings as before.
- Error messages now say what to type to fix the problem, with an example. For instance `dice: 2d6 +` shows: "The formula ends too early: it ends with +. Add a number or a die after it, like 2d6 + 1."
- The buy button shows the price: Buy for $6.
- The Skins settings show a small preview of Classic, Parchment and Arcane with an example result, also before you buy. Choosing a paid skin still needs a key.
- The Skins settings now read Skin, then Get the paid skins ("Parchment and Arcane. One payment, yours to keep."), then License key.
- The license key text no longer names Polar: "Paste the key from your purchase email and press Activate. It is checked online at most once every 30 days."

## 0.2.0

Notation added so notes written for other dice plugins keep working:

- Number flags: `|round`, `|noround`, `|ceil`, `|floor`, `|signed`, `|paren`, `|noparen`. Rounding ignores tiny floating point errors, so `(0.1+0.2)*10|ceil` shows 3.
- `dice+:` keeps a result across restarts, `dice-:` never keeps it.
- `dice-mod:` replaces the code in your note with the formula, the full result and the total, after you confirm. Undo works.
- Ctrl or Cmd click opens the source of a section, table, list, line or tag roller. Alt click rerolls with the average. Not available on phones without a keyboard.
- Frontmatter fields as numbers: `dice: str`, `1d20 + str`.
- `1dS` stunt die: three six sided dice, the third is the stunt die; on a double the stunt points equal the stunt die.
- Narrative dice (Genesys style): `3g2d`, with text results such as `2 Success, 1 Threat`.

## 0.1.0

First version.
