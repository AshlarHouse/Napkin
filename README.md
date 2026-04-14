# Napkin

Napkin is a Napa-specific restaurant randomizer. The app itself runs from `spots.json`, but the source of truth now lives in `data/restaurants-master.csv`.

## How the data works

1. Add or edit restaurants in `data/restaurants-master.csv`
2. Run `npm run build:data`
3. The script rebuilds `spots.json`
4. Deploy the site

## Why this setup

- `index.html` stays simple and fast
- `spots.json` stays app-friendly
- the master CSV is easier to grow into a full Napa directory

## Important columns

- `name`, `address`, `cuisine`
- `type`: JSON array like `["lunch","dinner"]`
- `hours`: JSON object keyed by day
- `cravingMatch`: JSON array like `["pizza"]`
- `note`: your family-specific recommendation
- `photo`: file name like `smallworld.png`
- `priorityScore`: room for later weighting and ranking
- `lastVerified`: when you last confirmed the restaurant data

## Next content goal

Fill this file out until every Napa restaurant and takeout option has a row, then refine the Napkin-specific fields over time.
