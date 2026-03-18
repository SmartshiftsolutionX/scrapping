# Mubawab.ma Property Scraper

## Setup

1. Install dependencies:

```bash
npm install
```

2. Run scraper:

```bash
node index.js
```

## Features

- Scrapes property data (sale, rent, vacation)
- Extracts property types and condition options
- Automatic authentication handling
- Saves results to JSON files

## Output Files

- `sale-properties-{timestamp}.json` - Sale property data
- `rent-properties-{timestamp}.json` - Rent property data
- `vacation-properties-{timestamp}.json` - Vacation property data
- `etat-data-{timestamp}.json` - Property condition options

## Troubleshooting

If you get 403 errors, the session cookies have expired. The script will attempt to refresh them automatically.
