# Bilingual UI audit

Authoritative source: *Through the Breach, Second Edition Core*, English edition, supplied PDF (420 PDF pages). References below use printed page numbers.

The UI critic translated and reviewed all **1,344 extracted UI phrases**. The integration source is `output/localization/ui-translations.json`; the generated runtime language files are maintained by the main agent. Coverage was checked programmatically: every extracted key has one nonempty English translation.

## Terminology verified

- Fated, Fatemaster, Fate Deck, Twist Deck, Control Hand, and Cheating Fate.
- Defining, Ascendant, Center, and Descendant Suit; the Russian literal names are retained only as canonical source phrases.
- Acting Value (AV), Target Number (TN), Action Points (AP), Dramatic Time, and Ongoing Challenge.
- All 56 Skills use the English rulebook's names, including Flexible, Pneumatic, Pugilism, Artefacting, Pick Pocket, Counter-Spelling, and Prestidigitation.
- Creation-card labels use Station, Body, Root, Mind, and Endeavor.
- Pursuit names checked against the book's actual entries: Russian Ударник is **Drudge**, Мастер рукопашной is **Scrapper**, Жестянщик is **Tinkerer**, and Расхититель могил is **Graverobber**.
- Magia names corrected against pages 264–269: **Mend Critical, Shapeshift, Cadaver Mask, Beckon, Subsume Corpse, Conjuring**.
- Critical Effect names checked against pages 304–305: **Badly Bruised and Lacerated, Hyperventilating, Deep Tissue Damage, Seeping Wound, Nervous System Trauma, Crippled, Agonizing Pain, Gushing Wound, Amputated, Bloody Mess**. The Condition translated from Безумие is **Crazy**.

The 56 Skill reminders were translated as concise paraphrases of their supplied Russian reminders, preserving their associations, combat behavior, training notes, and manual-rule exceptions. This review is not a certification that every optional subsystem described by those reminders is automated.

## Concrete integration findings reported

1. Automated extraction also finds strings used as canonical identifiers, scene-unit recognition values, normalized Talent names, grammatical suffixes, and macro source. Those are not interchangeable with display labels. The main agent has excluded the canonical comparison strings from translation.
2. Dynamic accessibility labels in `actor.hbs` require translation of static fragments while keeping `{{label}}` and `{{name}}` verbatim. Reported locations: aspect labels, Skill Rank/Aspect/suit labels, chat-description action, Trigger labels, and delete action.
3. Presentation labels computed during module import can be frozen before Foundry has loaded the translation dictionary. They need live getters or translation when preparing the view. This applies especially to Condition/effect-label maps.
4. Canonical names should only be presented in translation when they still equal their library baseline. User edits must win. The same rule should protect edited descriptions, reference text, and journals; localized presentation must never overwrite their stored contents.
5. Stored chat output needs per-client localization; translating only at the GM's creation time leaves mixed-language clients with the GM's language. Dynamic user names, notes, and numerical/mechanical identifiers must be preserved.
6. Source range/unit strings concatenate grammatical suffixes. Full unit formatting is preferable to translating suffixes independently; the current English fragments preserve the original syntax but need a rendering check.
7. An old Ace of Crows warning remains in a defensive branch. The actual Tarot data should contain the confirmed Mind array **−3/0/0/+3** and never enter that missing-number path for this card.
8. Bloody Mess has a short manual-resolution reminder. The authoritative detail (p.305): its Horror pulse applies when the destroyed target was Living or Undead; Living witnesses test at TN 8 + half the target's Rank Value, rounded up, or TN14 for a Fated target. This must not be mistaken for an automated pulse.
9. The source audit identified locale-dependent text being saved into system-generated records: Bestiary Macro/root-folder names, the adventure Macro folder, numbered Marionette token names, the starting Grimoire name/description, and synthetic Rank/effect-only card names. A Russian client cannot translate a stored English phrase back with a Russian-to-English-only lookup. Store canonical system strings and render them per client, or implement metadata-scoped reverse localization; do not reverse-translate player-authored text.

## Limits of this critic pass

The critic did not operate the live server or edit system scripts/templates. Browser verification, bilingual compendium/journal integration, source preservation, automated regression tests, and the second independent rules audit are performed by the main agent and rules critic. The English dictionary is complete for the extracted UI phrases; this is not an assertion that the entire system has passed live English/Russian acceptance tests.
