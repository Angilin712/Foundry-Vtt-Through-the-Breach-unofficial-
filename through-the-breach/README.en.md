# Through the Breach for Foundry VTT

Unofficial **Second Edition** system, with Russian and English interface and reference content. Foundry **14** is required; the tested engine is **14.365**. Build 14.368 has not yet had a complete live acceptance run.

Version **0.6.0** adds bilingual presentation. The core English views have been verified in Foundry 14.365. Installation archives are distributed through GitHub Releases. The English Second Edition core book supplied by the project owner is the authoritative rules reference.

## Language

Choose **English** or **Русский** in Foundry's language setting and reload when prompted. Restart the Foundry server after installing this update, so it reads the new system language declaration. Babele is optional; this system does not require it for its own translations.

The sheets, creation wizard, Fate Table, spell builder, library names and rule descriptions have translations. Fate card illustrations have English labels. Duel cards in chat are rebuilt for each client's language from the same saved result, without drawing again.

Translations are presentation only: document IDs, skill keys, card state, prices, TN and AP stay unchanged. Your renamed records and edited descriptions take precedence over catalogue translations. Editing an unrelated field does not save translated text over its canonical source. User names, notes, Trigger text and custom spell names are not automatically translated.

## Install or update

Back up your Foundry User Data before an update. Close Foundry before replacing a complete system folder. For manual installation, put the `through-the-breach` folder inside `Data/systems`, without an extra enclosing folder. Restart Foundry, select the system when creating a world, and join as the Gamemaster. Never edit the databases of a running world.

Existing worlds and characters do not need to be recreated. Existing GM edits are preserved by the bestiary and adventure importers. The native libraries include Skills, Stations, Pursuits, Talents, Equipment, Magic and GM commands.

## First session

1. Assign each player a Fated Actor and ownership. Players finish their own Tarot creation; the Fatemaster checks and adjusts characters.
2. Use the Fate Table to prepare the common Fate Deck and individual Twist Decks. End the Prologue to deal three cards to each participating Fated.
3. Use sheet checks and weapon attacks. Complete every open flip; choose the Red Joker's suit when required. Cheating Fate replaces the selected card once when permitted.
4. To cast spells, add Magia and Immuto, attune the relevant Grimoire, then use the spell builder. It recalculates TN, required suits, AP, range and resistance; unsupported effects and compatibility still require the Fatemaster.
5. During a **started combat**, ordinary token movement spends Walk AP and checks turn/ownership/path limits. Outside combat, token movement is free, including when Dramatic Time is declared. The GM's free-placement setting is for positioning and special movement.
6. End the scene to resolve temporary effects and offer hand refresh. Use the Epilogue command for advancement; players choose their eligible Skill increase and Pursuit reward.

## Checks and limits

The local automated suite passes **205 tests**, including language switching, preservation of custom text, mixed-language duel rendering and identical Immuto calculations in both languages. Two independent critic agents checked terminology and reference content against the English core: all 216 Tarot numeric arrays and 32 Magia parameter sets checked matched the source. The English sheet, library search, Fate hand, spell preview and adventure reading view passed a live GM smoke test on 10 October 2026. This does not certify every optional rule or a complete mixed-language multiplayer session. Native scene labels, edited records and historical plain-text chat remain in their original language.

Legacy First Edition bestiary material remains explicitly marked as legacy and needs GM review. Chapter 11 is adapted with editable GM journals and assets. For historical changes, see the repository's `CHANGELOG.md` and the Russian installation guide.

## Download 0.6.0

[Installation ZIP](https://github.com/Angilin712/Foundry-Vtt-Through-the-Breach-unofficial-/releases/download/v0.6.0/through-the-breach-0.6.0.zip) · [SHA256](https://github.com/Angilin712/Foundry-Vtt-Through-the-Breach-unofficial-/releases/download/v0.6.0/through-the-breach-0.6.0.zip.sha256) · [Patch notes](https://github.com/Angilin712/Foundry-Vtt-Through-the-Breach-unofficial-/blob/main/CHANGELOG.md)
