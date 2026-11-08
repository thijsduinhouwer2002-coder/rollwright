# Changelog

## 0.3.2

- Classic, the free look, is calmer. Results are flat tokens in your theme's colours, with no shine, glow or sparkle. A natural 20 still lands in gold (gold border, gold number, a small straight NAT 20 label) and a natural 1 in red. The d20 makes a quarter turn and the number fades in, in about a quarter of a second.
- The paid skins Parchment and Arcane keep all their effects. The Classic tile in the settings shows the new calm look.

## 0.3.1

- The two optional skins are redrawn so each one looks like its own thing. Parchment is old paper with ink and a red d20; a natural 20 is gold leaf with a red wax seal, a natural 1 gets a dark ink seal. Arcane is a night sky with a light rim; a natural 20 shows gold numbers on deep purple inside a golden aura.
- Stickers such as NAT 20 sit a little higher, so they no longer touch the number.
- A table or list in the same note can be rolled with `[[#^id]]`. The example note uses it, so its two table rolls keep working after you rename it (before, they said "Note not found").
- A roll inside a table cell or list item now finds its links from the note that holds the table, as Obsidian does. This only matters when two notes in different folders share a name.
- Roll log: a fixed value such as `dice: 7` shows 7 once, without a formula and working that repeat it.
- Roll again on an older roll in the log rolls in the note it came from (with that note's frontmatter), as long as the note still exists; otherwise in the open note.
- A crit or fumble copied from the note reads "20, NAT 20", not "20NAT 20".
- A dice code inside a rolled section, paragraph or line (such as `dice: 1d6`) now shows as plain text, "1d6", instead of raw code. It still does not roll there, so a note can never keep rolling itself.
- Clean-up after the first Obsidian review: settings callbacks no longer hand promises to Obsidian, elements are made with Obsidian's own helpers, the styles no longer use `!important`, and every release now comes with a build provenance attestation for main.js and styles.css.
- The empty Roll log says "Open the example note" once that note exists, instead of offering to create it again.

## 0.3.0

A new look. Rolling should feel like rolling.

- Every result is a small token with a d20 mark. When you click it, it tumbles and the number flickers through a few values for half a second before it lands.
- A natural 20 lands in gold with a NAT 20 sticker, a natural 1 in red with NAT 1. Other rolls at the highest or lowest possible result get MAX or MIN. Screen readers hear the result first, then the sticker.
- The roll history is now the **Roll log**: rolls are grouped under their note and the time the session began, newest on top. Natural 20s and 1s, and other highest or lowest rolls, show as gold and red cards; table and list results show as text cards. Click a heading to open the note. The command is now "Open roll log"; the button "Clear log" empties it.
- New: an empty Roll log offers "Try it: create an example note". The command "Create example note" does the same. It writes one tavern scene with dice and tables, never overwrites a note and is never created by itself.
- The skin previews in the settings show a natural 20 and a normal roll in each skin, with a lock on the paid skins until you activate a key.
- With "reduce motion" turned on in your system, results do not tumble or flicker.
- Fixed: Live Preview showed two spaces after a label such as "Perception:".

## 0.2.0

Notation added so notes written for other dice plugins keep working:

- Number flags: `|round`, `|noround`, `|ceil`, `|floor`, `|signed`, `|paren`, `|noparen`. Rounding ignores tiny floating point errors, so `(0.1+0.2)*10|ceil` shows 3.
- `dice+:` keeps a result across restarts, `dice-:` never keeps it.
- `dice-mod:` replaces the code in your note with the formula, the full result and the total, after you confirm. Undo works.
- Ctrl or Cmd click opens the source of a section, table, list, line or tag roller. Alt click rerolls with the average. Not available on phones without a keyboard.
- Frontmatter fields as numbers: `dice: str`, `1d20 + str`.
- `1dS` stunt die: three six sided dice, the third is the stunt die; on a double the stunt points equal the stunt die.
- Narrative dice (Genesys style): `3g2d`, with text results such as `2 Success, 1 Threat`.

Also in 0.2.0:

- Paid skins now use license keys from Polar. Paste the key and press Activate; it is checked once at `api.polar.sh` and after that quietly at most once every 30 days. Only the key and the date of the check are stored. The settings have a Buy button that opens the Polar checkout.
- The old offline key check (`RW1-...` keys) is removed. No such keys were ever sold.
- The settings of Rollwright can be found with the settings search of Obsidian 1.13 and later. Older versions show the same settings as before.
- Error messages now say what to type to fix the problem, with an example. For instance `dice: 2d6 +` shows: "The formula ends too early: it ends with +. Add a number or a die after it, like 2d6 + 1."
- The buy button shows the price: Buy for $6.
- The Skins settings show a small preview of Classic, Parchment and Arcane with an example result, also before you buy. Choosing a paid skin still needs a key.
- The Skins settings now read Skin, then Get the paid skins ("Parchment and Arcane. One payment, yours to keep."), then License key.
- The license key text no longer names Polar: "Paste the key from your purchase email and press Activate. It is checked online at most once every 30 days."

## 0.1.0

First version.
