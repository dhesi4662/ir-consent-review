# Leeds IR Consent Audit Delphi Review

Static GitHub Pages frontend for departmental review of procedure-specific IR consent risks.

## Current interface

- 20 procedure-specific review sets
- risk-level evidence sources with Tier 1 to Tier 5 colour coding
- locally proposed common risks only where not already represented in the evidence-derived list
- numerical-frequency question only where a directly sourced numerical estimate is available
- scoring guide available throughout the site
- GMC number and 6 digit PIN sign-in
- approved reviewer roster keyed by GMC number
- automatic local and server-side draft saving
- cross-device draft restoration
- per-procedure submission and locking after submission
- JSON backup

PINs are stored as salted, peppered SHA-256 hashes, not in plain text. The browser keeps the PIN only in memory for the active session.

Reviewer names are read from the `Approved Reviewers` sheet. Only active GMC numbers on that list can create an account.

The visual language is adapted from the open-source Gentelella admin dashboard project (ColorlibHQ/gentelella, MIT licensed). This project does not bundle the Gentelella framework itself.
