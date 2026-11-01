# Historia – fiszki

Prosta PWA do nauki na sprawdzian z historii („Wczoraj i dziś” kl. 4, rozdziały 5–8:
Moja rodzina, Moje miejsce na ziemi, Regiony Polski i ich tradycje, Polskie symbole i święta państwowe).
Bez serwera i bez kont, postępy w przeglądarce (`localStorage`).

- **Fiszki**: pytanie → dotknij → odpowiedź, potem „Umiem” albo „Jeszcze nie”.
- **Quiz**: wybór z 3 odpowiedzi. Przy pojęciach quiz czasem pyta odwrotnie (definicja → „Jak to nazywamy?”).
  Błędne pytanie wraca 3 pytania później.
- **Trudne pytania**: te z błędami, dopóki nie padną 2 dobre odpowiedzi z rzędu.
- **Próbny sprawdzian**: wszystkie pytania bez powtórek, z wynikiem w % i orientacyjną oceną.
- **Ściąga**: całość do przeczytania, opanowane pytania z ✓.
- Tematy (5.1–8.2) zaznaczasz na ekranie głównym; 🔊 czyta pytanie po polsku.

Pytania są w `data.js` (`q` pytanie, `a` odpowiedź, `more` dopowiedzenie, `t` nazwa pojęcia,
`tag` grupa błędnych odpowiedzi, `zle` własne błędne odpowiedzi).

## Uruchomienie lokalne

```sh
python3 -m http.server 8765
```

## Instalacja na iPhonie

Adres: https://stirith.github.io/historia-fiszki/ → w Safari **Udostępnij → Do ekranu początkowego**.
Działa offline. Po zmianie plików podbij `CACHE` w `sw.js`.
