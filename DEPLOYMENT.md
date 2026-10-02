# Hosting and deployment

## 1. Create the Google Sheet backend

1. Create a new blank Google Sheet called something like `IR Consent Delphi Responses`.
2. Copy the Sheet ID from its URL. It is the long string between `/d/` and `/edit`.
3. In the Sheet open **Extensions → Apps Script**.
4. Delete the default code and paste everything from `apps-script/Code.gs`.
5. Replace:
   `PASTE_GOOGLE_SHEET_ID_HERE`
   with your actual Sheet ID.
6. Save the Apps Script project.
7. Click **Deploy → New deployment**.
8. Choose **Web app**.
9. Set **Execute as: Me**.
10. Set the access level to the narrowest setting that still allows the GitHub Pages site to submit. Depending on your Google Workspace configuration this may need to be `Anyone`.
11. Click **Deploy** and authorise the script if prompted.
12. Copy the Web App URL ending in `/exec`.

The first successful submission creates:
- `Responses` — one row per consultant × candidate risk
- `Submissions` — one row per submitted procedure
- `Additional Risks` — one row per additional risk suggested by a consultant

## 2. Configure the website

Open `config.js`.

Paste the Apps Script URL:

```js
endpoint: "https://script.google.com/macros/s/...../exec",
```

Also review:

```js
minimumResponsesForConsensus: 3
```

This value documents your intended minimum response threshold. The actual Round 2 generator also defaults to 3 unless you pass another number.

You may optionally set an `accessCode`, but this is not secure authentication because GitHub Pages is static and its JavaScript is public.

## 3. Create the GitHub repository

1. Sign in to GitHub.
2. Click **New repository**.
3. Name it, for example:
   `ir-consent-delphi`
4. Choose **Public** if using standard free GitHub Pages. If your organisation/account supports Pages from a private repository, you can use that instead.
5. Do not initialise with a README if you are uploading the supplied package directly.
6. Create the repository.

## 4. Upload the site files

Upload the **contents** of this package to the repository root, not the outer ZIP itself.

The repository root should contain:

```text
index.html
app.js
styles.css
config.js
data.json
README.md
apps-script/
docs/
tools/
```

Commit the files.

## 5. Turn on GitHub Pages

1. In the repository open **Settings**.
2. Choose **Pages** in the left menu.
3. Under **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: `main`
   - Folder: `/ (root)`
4. Click **Save**.
5. GitHub will display the public Pages URL after deployment, typically:
   `https://YOUR-USERNAME.github.io/ir-consent-delphi/`

## 6. Test before circulation

Use a test consultant ID such as `TEST01`.

Test the following:
- the procedure dashboard loads all procedures;
- you can choose one procedure without completing the others;
- progress persists after refreshing/closing the browser;
- incomplete procedures cannot be submitted;
- a complete procedure can be submitted;
- after submission, the dashboard marks it as submitted;
- you can then complete a different procedure;
- the Google Sheet receives the correct number of rows for each submitted procedure;
- `Submissions` gets one row for each submitted procedure.

Delete your test rows before opening the exercise.

## 7. How consultants use it

A consultant:
1. enters their agreed identifier;
2. sees all procedures;
3. chooses whichever procedure(s) they wish to evaluate;
4. records their experience with that procedure;
5. scores every candidate risk in that selected procedure;
6. submits that procedure;
7. optionally returns to the dashboard and assesses another.

They are not required to complete all procedures.

## 8. Round 2

Export the `Responses` tab from Google Sheets as CSV.

Run:

```bash
python tools/generate_round2.py responses.csv data.json round2-data.json 3
```

The final `3` is the minimum number of complete consultant responses required before consensus is considered. Change it if your group prospectively agrees a different threshold.

The script:
- deduplicates consultant/item responses using the latest submission;
- calculates the denominator per item from consultants who completed that procedure;
- applies the 80% inclusion/exclusion rule;
- flags items with too few responses;
- creates a Round 2 dataset containing unresolved or insufficient-response items.

## Governance

Do not enter patient-identifiable information into this site. It is intended only for consultant voting on procedure-level consent risks. Agree locally whether consultant responses should be identifiable, pseudonymous or anonymous and follow your organisation's audit/QI governance requirements.
