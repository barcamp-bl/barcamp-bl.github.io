# barcamp-bl.github.io

Sajt BarCamp BL-a. GitHub Pages ga gradi Jekyll-om (`github-pages` gem, Jekyll 3.10), bez dodatnih pluginova.

## Šta je gdje

| Putanja | Šta |
| --- | --- |
| `index.html` | Cijela stranica (Liquid). |
| `_layouts/default.html` | `<head>`, navigacija, footer. |
| `stylesheets/terminal.css` | Terminal tema. Akcenat je privremeni "chrome" dok 0x07 ne dobije boju. |
| `_config.yml` | Izdanje, datum, rok za prijave, kontakt. |
| `_data/editions.yml` | Prošla izdanja: datum, mjesto, boja. |
| `_talks/<izdanje>/NN-ime.md` | Jedno predavanje po fajlu; `NN` je redoslijed na stranici. |
| `images/` | Teaser: svijetli za og:, tamni za stranicu. |

## Novo predavanje

```markdown
---
edition: "0x07"
speakers: ["Ime Prezime"]
home: nadimak                  # ~/0x07/<home> na kartici
link: https://example.com      # opciono
link_label: example.com        # opciono
title: "Naslov, tačno kako ga je predavač poslao"
title_link: https://...        # opciono
description: "Opis, takođe doslovno."   # opciono
---
```

Izdanje uvijek ide pod navodnike (`"0x07"`), inače ga YAML pročita kao heksadecimalni broj.
Naslovi i opisi se objavljuju doslovno, na jeziku na kojem su poslati.

Predavanja koja još nisu objavljena drže se lokalno kao `*.draft.md`, uz liniju `*.draft.md` u
`.git/info/exclude`: vide se u lokalnom pregledu, a nikad ne završe u repou.
