# FSB Journal Ranking & Workload Points Calculator

A web application for looking up academic journal rankings (ABDC, AJG) and calculating Farmer School of Business workload-policy scholarship points.

## Features

- **Journal Search** — Search 3,064 journals with fuzzy matching that handles partial names, abbreviations, and minor spelling differences
- **Rankings Display** — View ABDC (2025) and AJG (2024) ratings for each journal
- **FSB Points Calculator** — Automatically calculates workload-policy scholarship points based on the ABDC/AJG rating combination
- **Working List** — Add multiple journals, enter paper counts, and track cumulative points with a live grand total

## Quick Start

### Prerequisites

- Python 3.x with `openpyxl` (`pip install openpyxl`)

### Setup

1. **Generate the journal data** (only needed once, or when Excel files change):

   ```bash
   python build_data.py
   ```

2. **Start the local server**:

   ```bash
   python -m http.server 8000
   ```

3. **Open** [http://localhost:8000](http://localhost:8000) in your browser.

## Project Structure

```
├── Data/
│   ├── ABDC-2025.xlsx              # ABDC Journal Quality List 2025
│   ├── AJG.xlsx                    # AJG Academic Journal Guide 2024
│   ├── FSB workload point system.xlsx  # FSB points lookup table
│   └── Workload policy.txt         # Policy description
├── build_data.py                   # Preprocessor: Excel → journals.json
├── journals.json                   # Generated merged journal data
├── index.html                      # Web application
├── styles.css                      # Styling
├── app.js                          # Application logic
└── README.md
```

## Data Processing

`build_data.py` uses a 3-pass matching strategy to merge journals across ABDC and AJG lists despite naming inconsistencies:

1. **Exact match** on normalized titles
2. **Deep normalization** — strips subtitles (text after `:`), normalizes `&`/`and`, removes parenthetical text
3. **Fuzzy matching** — bigram (Dice coefficient ≥ 0.82) for remaining journals

## Updating Data

To update rankings when new Excel files are available:

1. Replace the files in the `Data/` folder
2. Run `python build_data.py`
3. Refresh the browser

## Author

Developed by Arthur Carvalho ([arthur.carvalho@miamioh.edu](mailto:arthur.carvalho@miamioh.edu))
