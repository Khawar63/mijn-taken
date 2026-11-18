# Mijn Taken

Een gratis, eigen takenapp met Notion-achtige functies: lijst, bord, kalender, lijsten, labels, subtaken en notities.

- `index.html` is de complete app (één bestand).
- `src/` bevat de bronbestanden; `python3 src/bundel.py` maakt `index.html` opnieuw.

Je taken worden alleen in je eigen browser bewaard, niet in deze repository.

## Synchronisatie (optioneel)
Vul in `src/sync.js` de Supabase Project URL en anon/publishable key in en draai `python3 src/bundel.py`. Inloggen gaat met een e-mail-inloglink; elke gebruiker ziet alleen zijn eigen taken (row level security).
