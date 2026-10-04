# IR Consent Review

Static GitHub Pages frontend for Round 1 of a consultant modified-Delphi review of procedure-specific IR consent risks.

Current dataset: 20 procedures and 238 evidence-derived Delphi candidate risks. The site also displays a small project-defined local core set that is not part of the Delphi vote.

## Current interface

- Gentelella-inspired clinical/admin layout
- risk-level evidence sources with Tier 1–5 colour coding
- numerical-frequency question shown only where a directly sourced numerical estimate is available
- fixed scoring/evidence guide available throughout the site
- local core consent items shown separately from evidence-derived Delphi candidates
- per-procedure completion and submission
- browser autosave and JSON backup

The visual language is adapted from the open-source Gentelella admin dashboard project (ColorlibHQ/gentelella, MIT licensed). This project does not bundle the Gentelella framework itself.