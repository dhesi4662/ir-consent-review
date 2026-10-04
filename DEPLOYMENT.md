# Hosting and deployment

## Apps Script backend

The live site uses the Apps Script web app configured in `config.js`.

After changing `Code.gs`:

1. Open the response Google Sheet.
2. Open **Extensions > Apps Script**.
3. Replace the existing `Code.gs` with the repository version.
4. Save.
5. Open **Deploy > Manage deployments**.
6. Edit the current web app deployment.
7. Select **New version** and deploy.
8. Keep **Execute as: Me**.
9. Keep the access setting that already allows the GitHub Pages site to use the web app.
10. Confirm that the deployed URL still ends in the same `/exec` address shown in `config.js`.

The backend creates these additional tabs automatically:

- `Reviewers`: GMC number, name, PIN salt/hash, login and lock information
- `Drafts`: compressed server-side draft state

Existing tabs remain:

- `Responses`
- `Submissions`
- `Additional Risks`

## Reviewer sign-in

On first use the reviewer enters:

- 7 digit GMC number
- a self-selected 6 digit PIN

The backend attempts to obtain the reviewer's name from the public GMC registrant page. If that lookup cannot be read, the reviewer is asked to enter their name manually.

On later visits the same GMC number and PIN restore the saved server draft. A local browser copy is also maintained as a recovery copy.

After five incorrect PIN attempts the account is temporarily locked for 15 minutes.

A forgotten PIN currently requires the project lead to reset the relevant row in the `Reviewers` tab.

## GitHub Pages

The repository should deploy from:

- branch: `main`
- folder: `/ (root)`

The root contains:

```text
index.html
app.js
styles.css
config.js
data.json
Code.gs
README.md
DEPLOYMENT.md
```

## Test before circulation

Use a genuine GMC number that you control for testing. Do not use another person's GMC number to create a test account.

Check that:

- first sign-in creates a reviewer record;
- the GMC lookup displays the expected name when available;
- an invalid PIN is rejected on return;
- answers show `Saving...` and then `Saved`;
- closing the site and signing in again restores progress;
- signing in on another browser/device restores the same draft;
- submitted procedures are marked submitted and cannot be submitted twice;
- response rows are written correctly to the Google Sheet;
- locally proposed risks are not duplicated when an equivalent evidence-derived risk is already present.

Delete any test response/submission/draft rows before circulation if required.

## Important deployment order

Do not merge frontend changes that require the new login workflow until the updated `Code.gs` has been deployed as a new Apps Script version. The current frontend depends on the new backend actions for login and draft restoration.
