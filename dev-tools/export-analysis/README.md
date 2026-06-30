# Export Analysis Scripts

Node.js scripts for interrogating a full-game JSON export produced by the in-browser **Export Data** feature.

All scripts run with native ES module support — no build step required.

## Usage

```powershell
# From the repo root:
node dev-tools/export-analysis/<script>.js <path-to-export.json> [args]
```

---

## Scripts

### `check-gk-assists.js`
Scans every played match in the export and reports any goalkeeper assist credits,
along with an aggregate rate.

```powershell
node dev-tools/export-analysis/check-gk-assists.js exports/my-export.json
```

---

### `inspect-match.js`
Prints key events and, if full play-by-play data is present, shows each goal
with the 5 preceding events so you can trace exactly how the goal was scored.

```powershell
node dev-tools/export-analysis/inspect-match.js exports/my-export.json <matchId>
```

---

### `inspect-match-report.js`
Prints the post-match report (scorers, assisters, ratings, saves) for a single match.
Optionally highlight a specific player by passing their ID as a third argument.

```powershell
# All scorers/assisters:
node dev-tools/export-analysis/inspect-match-report.js exports/my-export.json <matchId>

# Focus on a specific player:
node dev-tools/export-analysis/inspect-match-report.js exports/my-export.json <matchId> <playerId>
```

---

## Notes

- Export files live in `exports/` (gitignored — they can be large).
- Scripts expect the export shape produced by the app's IndexedDB export function.
- All scripts read only; they never write back to the export file.
