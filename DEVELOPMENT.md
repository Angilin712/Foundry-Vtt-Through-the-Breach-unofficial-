# Development notes

The installable package is `through-the-breach/`; only that directory goes into a user's Foundry `Data/systems` directory. The parent workspace contains research, QA, tests, and build tools and is not part of the system.

No bundler, npm install, or remote runtime dependency is required. ES modules run directly in Foundry 14. `system.json` declares Actor/Item types; models use TypeDataModel and sheets use ApplicationV2. The Russian interface is deliberately local-first; localization extraction is deferred.

## Authority and state

Player operations are requests in GM-whispered ChatMessages. Foundry 14 validates ChatMessage.author against the creating user server-side. The designated `game.users.activeGM` snapshots the request and processes it through one promise queue. Actor permissions and parameters are checked again on the authority. A world setting records request IDs before mutations. A started request is not replayed after reconnect; the GM must inspect state. This protocol uses core document persistence, not a socket which trusts a supplied user ID.

The ledger is append-only for this prototype. GM failover observes `userConnected`. A request interrupted between persistence operations can leave a partially completed action; native Cards.pass itself spans multiple writes and is not a database transaction. Do not claim transactional exactly-once recovery. Retained duel flags and the GM cancel action support ordinary interrupted-check recovery. Severe partial database failures may require manual GM inspection of native cards. Full crash recovery, archived request compaction, hostile client hardening and multi-GM failover tests remain future work.

The native deck holds originals with drawn=true while copies reside in hands/active/discard stacks. Shuffle returns only discard through Cards.pass; never call deck.recall for ordinary reshuffling. Personal hands have OBSERVER access for actor owners; decks and discards have default NONE. GM authorizes every mutation exposed by this system. This is normal tabletop ownership behavior, not an anti-cheat security boundary against a modified Foundry client.

Duels use GM-authored public messages. Selection discards unchosen cards, but the chosen card remains in the active stack until replaced or finalized. Replacement originates from the actor's own hand and returns to its own discard. World actors and unlinked token actors resolve by UUID. Fated actors default to linked tokens.

## Verification

Commands for a developer (not needed by the player):

```
node --test tests/*.test.mjs
python tools/build-assets.py
node tools/preview.mjs
```

The native schema tests use the installed Foundry `common/server.mjs` without starting a licensed world. Set FOUNDRY_APP if installation differs. The integration harness mocks persistence and Cards movement; it does not claim to test the actual network/database or live ApplicationV2 events. The preview renders real templates and CSS with real model contexts but a stub application base. Tests currently run against locally installed 14.365 schema and a v14 API target; live 14.368 verification is outstanding.

Before declaring verified compatibility, test a fresh world in 14.368 with a GM and two player browser sessions: install/boot, sheet edits survive reload, two users draw concurrently, observers cannot view another hand, bonus draws and selected discards, black/red jokers, reload with a live duel, GM disconnect/reconnect, NPC token overrides, initiative tracker, and an optional Babele-only run. The end-user guide provides the first smoke-test steps.

## Combat in 0.2.0

Weapon items remain equipment with an isWeapon flag, avoiding a new server document type. Attack messages snapshot weapon values and Actor UUIDs. NPC/Fated attacks reverse the flip to the defender, while NPC/NPC uses rank. Fated/Fated generates both flips, persists the initial cheating order once selections and joker suits are resolved, and lets the aggressor win a final tie. Player permissions are checked against the attacker for damage and against the flipping actor for choice/cheat/finish; damage application/critical/consciousness/undo is GM-only.

Application persists intent before wounds are changed. Child damage/consciousness operations persist a pending marker before creation; interrupted markers require manual inspection. Critical generation also marks intent before drawing. The request ledger prevents automatic replay, but these are still multiple document writes, not a database transaction. Undo checks current wounds and conditions against the recorded applied state and refuses after consciousness starts. It restores wounds and notes but does not return spent cards.

Critical tables provide concise rule reminders, table transitions, location and immediate extra numeric wounds. Durations, bleeding, special checks and creature exceptions are GM-managed. Unconscious failure sets unconscious/prone and current AP=0; there is no automatic AP refresh engine or timed condition scheduler. Future compatibility is allowed by minimum14 with no maximum; verified remains the actually tested14.365.

47 automated scenarios pass. Live14.365 covers tracker initiative for both types, weapon persistence, attack/damage/armor/minimum1, application/undo, critical note/undo, and synthetic target damage without changing the world actor. Fated/Fated and full consciousness branch coverage are harness-tested, not yet live multiclient-certified.

## Sheet automation in 0.4.0

The current audit and scope matrix are in TEST-PLAN.ru.md. `automation.mjs` handles GM-authorized operations through the existing request queue. Pure plans validate before mutation. Multi-document operations persist `system.operationPending` before resource writes and require GM reconciliation after failure. Invalid reload and insufficient AP do not create this marker. Spell/attack preflight validates configured modifiers, suits and parameters before costs. There is no database rollback guarantee.

Item bonuses are declarative, never evaluated code. Active quantity/equipped entries affect numeric aspects/skills/derived stats; flip/suit bonuses only affect matching duels. Pursuit-ability bonuses apply only to the selected current pursuit. Rank-dependent derived stats use true ranks, not AV modifiers. Manual armor and calculated armor both cap at3 and subtract Defense. Old free-text records are not parsed or silently converted.

Epilogues are saved on the actor with unique session ID, eligible skills and the selected advancement. Pursuit steps are actor records keyed by item ID so XP and step grant are one Actor.update; talent rewards and step0 must be selected separately. Magic follows configured structured values, active-grimoire access and repeated Immuto caps. Fated resistance uses the existing two-message cheating sequence; casting TN/suits must also pass. Narrative spell effects and theories remain explicit GM work.

83 automated scenarios pass. Additional browser previews use actual templates and model contexts, including populated equipment/magic/development and long item forms. Live player/network tests of0.4.0 have not been run. Installing package files does not mutate world documents; existing fields get native schema defaults on the next world load.
# Compendiums and creation 0.5.0

`tools/extract-catalog.py` reads creation tables using PDF cell coordinates and records the user-authorized correction to Mind Ace of Crows. Input PDF and extracted research remain ignored. `tools/build-packs.mjs` compiles reviewed sources to native Item/Macro LevelDB sublevels using the installed Foundry dependency. Pack IDs are stable SHA256-derived document IDs; source documents are also retained in `data/pack-sources.json` for validation.

Package building includes native WAL `.log`, SST and manifest files, but excludes diagnostic `LOG` and `LOCK`. Native compendium sources and copied databases are tested independently. Never overwrite pack databases open in a running Foundry process: first-time packs can be installed before restart; subsequent pack replacements require the application to be closed.

Creation/catalog/session operations use the existing authoritative GM queue. Incoming item data is never trusted; entries are fetched from an allowlisted system compendium UUID. Player drafts cannot complete creation. A cross-document lock precedes mutations; a failure must be reconciled manually rather than replayed. Session prologue records pending/done per actor before/after drawing. Epilogue reuses the existing unique-session ledger on each Actor.

Current catalog coverage and manual effects are documented in the Russian system README. Future work: full merchandise, pursuit-step talent selection, reliable prerequisite expressions and special effects, construct/prosthetic creation, Immuto parameter choices, and a compact step-by-step UI.

