# Localization workflow (Option B: Crowdin + local JSON)

This project uses **English (`en`) as the source locale** and keeps runtime translation files in:

- `frontend/src/locales/en/common.json`
- `frontend/src/locales/ru/common.json`

## Why this setup

- Keeps translation files inside the repo (auditable + versioned).
- Uses a TMS (Crowdin) for fast machine pre-translation and human review.
- Supports manual export/import in Crowdin UI (CSV/XLIFF) when translators do not use Git.

## One-time setup

1. Create a Crowdin project.
2. Save project credentials in your shell:

```bash
export CROWDIN_PROJECT_ID=<your_project_id>
export CROWDIN_PERSONAL_TOKEN=<your_personal_token>
```

3. Install Crowdin CLI (choose one):

```bash
npm install -g @crowdin/cli
# or
brew install crowdin
```

## Sync commands

From repository root:

```bash
# Upload source strings (English)
crowdin upload sources --config .crowdin.yml

# Upload existing translations (optional)
crowdin upload translations --config .crowdin.yml

# Download reviewed translations
crowdin download --config .crowdin.yml
```

## Recommended release workflow

1. Add/update keys in `frontend/src/locales/en/common.json`.
2. Upload sources to Crowdin.
3. Run **pre-translation** in Crowdin (MT engine: DeepL/Google/OpenAI, team choice).
4. Human reviewer validates key copy and placeholders.
5. Download translations.
6. Commit changed locale files in Git.

## Manual export/import

If translators require offline files:

- Use Crowdin UI exports (CSV/XLIFF/JSON).
- Re-import into Crowdin after edits.
- Download finalized language bundles back into `frontend/src/locales/<lang>/`.

## Quality gates for CI (recommended)

Add a CI check script to ensure:

- all required locale keys exist
- no placeholder mismatch (`{{name}}`, `{{count}}`, etc.)
- no malformed JSON

This prevents broken translations from reaching production.
