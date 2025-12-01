# IB Oxford Data Mockup

A lightweight, seeded mockup that demonstrates how IB Oxford project data are handled and transformed across schools, protection areas, and survey waves. Now built with React, Vite, Tailwind CSS, daisyUI, and Plotly for interactive charts.

## Running locally
1. Install dependencies: `npm install`
2. Start the dev server: `npm run dev`
3. Open the printed local URL in your browser (Vite defaults to `http://localhost:5173`).

## Notes
- Data are generated deterministically from a seeded pseudo-random generator (`buildDataset` in `src/data.js`).
- Filters apply across all tables to make walkthroughs easy during discussions.
- Plotly is bundled locally (no CDN) and charts include 95% CI error bars.