import { Injectable } from "@angular/core";

export interface TeamColorPalette {
  badgeClass: string;
  textClass: string;
  borderClass: string;
  solidHex: string;
  secondaryHex: string;
  gradient: {
    from: string;
    to: string;
  };
}

@Injectable({
  providedIn: "root",
})
export class TeamColorsService {
  /**
   * 20 visually distinct palettes — one per league team.
   *
   * solidHex (primary / main colour) — all 20 are unique.
   *
   * secondaryHex (accent / ring colour) — all 20 are also unique.
   * They are drawn from the same pool of 20 primary hex values but
   * rotated by +6, with two targeted swaps (indices 6↔7 and 10↔13)
   * to improve contrast in the most similar-hued pairs.
   */
  private readonly palettes: TeamColorPalette[] = [
    // [0]  red
    {
      badgeClass: "bg-red-600",
      textClass: "text-red-400",
      borderClass: "border-red-500",
      solidHex: "#dc2626",
      secondaryHex: "#0891b2",
      gradient: { from: "#ef4444", to: "#7f1d1d" },
    },
    // [1]  blue
    {
      badgeClass: "bg-blue-600",
      textClass: "text-blue-400",
      borderClass: "border-blue-500",
      solidHex: "#2563eb",
      secondaryHex: "#ea580c",
      gradient: { from: "#3b82f6", to: "#1e3a8a" },
    },
    // [2]  emerald
    {
      badgeClass: "bg-emerald-600",
      textClass: "text-emerald-400",
      borderClass: "border-emerald-500",
      solidHex: "#059669",
      secondaryHex: "#0d9488",
      gradient: { from: "#10b981", to: "#064e3b" },
    },
    // [3]  amber
    {
      badgeClass: "bg-amber-600",
      textClass: "text-amber-400",
      borderClass: "border-amber-500",
      solidHex: "#d97706",
      secondaryHex: "#4f46e5",
      gradient: { from: "#f59e0b", to: "#78350f" },
    },
    // [4]  purple
    {
      badgeClass: "bg-purple-600",
      textClass: "text-purple-400",
      borderClass: "border-purple-500",
      solidHex: "#9333ea",
      secondaryHex: "#e11d48",
      gradient: { from: "#a855f7", to: "#581c87" },
    },
    // [5]  pink
    {
      badgeClass: "bg-pink-600",
      textClass: "text-pink-400",
      borderClass: "border-pink-500",
      solidHex: "#db2777",
      secondaryHex: "#65a30d",
      gradient: { from: "#f472b6", to: "#831843" },
    },
    // [6]  cyan  — accent swapped to violet for better contrast vs sky
    {
      badgeClass: "bg-cyan-600",
      textClass: "text-cyan-400",
      borderClass: "border-cyan-500",
      solidHex: "#0891b2",
      secondaryHex: "#7c3aed",
      gradient: { from: "#06b6d4", to: "#164e63" },
    },
    // [7]  orange — accent swapped to sky for better contrast vs violet
    {
      badgeClass: "bg-orange-600",
      textClass: "text-orange-400",
      borderClass: "border-orange-500",
      solidHex: "#ea580c",
      secondaryHex: "#0284c7",
      gradient: { from: "#f97316", to: "#7c2d12" },
    },
    // [8]  teal
    {
      badgeClass: "bg-teal-600",
      textClass: "text-teal-400",
      borderClass: "border-teal-500",
      solidHex: "#0d9488",
      secondaryHex: "#c026d3",
      gradient: { from: "#2dd4bf", to: "#134e4a" },
    },
    // [9]  indigo
    {
      badgeClass: "bg-indigo-600",
      textClass: "text-indigo-400",
      borderClass: "border-indigo-500",
      solidHex: "#4f46e5",
      secondaryHex: "#16a34a",
      gradient: { from: "#6366f1", to: "#312e81" },
    },
    // [10] rose   — accent swapped to stone for better contrast vs yellow
    {
      badgeClass: "bg-rose-600",
      textClass: "text-rose-400",
      borderClass: "border-rose-500",
      solidHex: "#e11d48",
      secondaryHex: "#57534e",
      gradient: { from: "#fb7185", to: "#881337" },
    },
    // [11] lime
    {
      badgeClass: "bg-lime-600",
      textClass: "text-lime-400",
      borderClass: "border-lime-500",
      solidHex: "#65a30d",
      secondaryHex: "#475569",
      gradient: { from: "#a3e635", to: "#365314" },
    },
    // [12] sky
    {
      badgeClass: "bg-sky-600",
      textClass: "text-sky-400",
      borderClass: "border-sky-500",
      solidHex: "#0284c7",
      secondaryHex: "#52525b",
      gradient: { from: "#38bdf8", to: "#0c4a6e" },
    },
    // [13] violet — accent swapped to yellow for better contrast vs stone
    {
      badgeClass: "bg-violet-600",
      textClass: "text-violet-400",
      borderClass: "border-violet-500",
      solidHex: "#7c3aed",
      secondaryHex: "#ca8a04",
      gradient: { from: "#8b5cf6", to: "#4c1d95" },
    },
    // [14] fuchsia
    {
      badgeClass: "bg-fuchsia-600",
      textClass: "text-fuchsia-400",
      borderClass: "border-fuchsia-500",
      solidHex: "#c026d3",
      secondaryHex: "#dc2626",
      gradient: { from: "#e879f9", to: "#701a75" },
    },
    // [15] green
    {
      badgeClass: "bg-green-600",
      textClass: "text-green-400",
      borderClass: "border-green-500",
      solidHex: "#16a34a",
      secondaryHex: "#2563eb",
      gradient: { from: "#4ade80", to: "#14532d" },
    },
    // [16] yellow
    {
      badgeClass: "bg-yellow-600",
      textClass: "text-yellow-400",
      borderClass: "border-yellow-500",
      solidHex: "#ca8a04",
      secondaryHex: "#059669",
      gradient: { from: "#facc15", to: "#713f12" },
    },
    // [17] slate
    {
      badgeClass: "bg-slate-600",
      textClass: "text-slate-400",
      borderClass: "border-slate-500",
      solidHex: "#475569",
      secondaryHex: "#d97706",
      gradient: { from: "#94a3b8", to: "#1e293b" },
    },
    // [18] zinc
    {
      badgeClass: "bg-zinc-600",
      textClass: "text-zinc-400",
      borderClass: "border-zinc-500",
      solidHex: "#52525b",
      secondaryHex: "#9333ea",
      gradient: { from: "#a1a1aa", to: "#18181b" },
    },
    // [19] stone
    {
      badgeClass: "bg-stone-600",
      textClass: "text-stone-400",
      borderClass: "border-stone-500",
      solidHex: "#57534e",
      secondaryHex: "#db2777",
      gradient: { from: "#a8a29e", to: "#292524" },
    },
  ];

  /**
   * Fixed palette assignments for the 20 known league teams.
   *
   * Every team maps to a distinct index (0–19), guaranteeing that no two
   * teams share a primary or accent colour. Real-world team colours are
   * matched where possible; compromises are noted inline.
   *
   * Teams not in this table fall back to the hash-based lookup below.
   */
  private readonly teamNameToPaletteIndex: Readonly<Record<string, number>> = {
    Arsenal: 0, // red       — Arsenal's traditional red
    Chelsea: 1, // blue      — Chelsea's traditional blue
    "Nottingham Forest": 2, // emerald   — forest green hint
    Wolverhampton: 3, // amber     — Wolves' iconic gold/amber
    "Aston Villa": 4, // purple    — closest to Villa's claret
    Bournemouth: 5, // pink      — cherry-red hue
    "Manchester City": 6, // cyan      — sky-blue
    "Luton Town": 7, // orange    — Luton's orange strip
    "Sheffield United": 8, // teal      — distinctive contrast colour
    Everton: 9, // indigo    — Everton's royal/dark blue
    Liverpool: 10, // rose      — Liverpool's red
    Brentford: 11, // lime      — visually distinct from other greens
    Brighton: 12, // sky       — Brighton's blue-and-white
    Burnley: 13, // violet    — closest to Burnley's claret
    "Crystal Palace": 14, // fuchsia   — Palace's red/purple palette
    "Manchester United": 15, // green     — all red shades taken; unique accent ring (blue) echoes the kit
    "Tottenham Hotspur": 16, // yellow    — gold tone, distinct from navy
    "Newcastle United": 17, // slate     — Newcastle's black-and-white → dark grey
    "West Ham United": 18, // zinc      — dark, echoing claret tones
    Fulham: 19, // stone     — neutral, echoing Fulham's white/black
  };

  getPalette(teamName: string | null | undefined): TeamColorPalette {
    if (!teamName) {
      return {
        badgeClass: "bg-zinc-700",
        textClass: "text-zinc-400",
        borderClass: "border-zinc-500",
        solidHex: "#3f3f46",
        secondaryHex: "#52525b",
        gradient: { from: "#52525b", to: "#18181b" },
      };
    }

    // Use the fixed assignment for all known teams — guarantees unique colours.
    const fixedIndex = this.teamNameToPaletteIndex[teamName];
    if (fixedIndex !== undefined) {
      return this.palettes[fixedIndex];
    }

    // Fallback for any team name not in the table (e.g. custom/future teams).
    const index = Math.abs(this.getNameHash(teamName)) % this.palettes.length;
    return this.palettes[index];
  }

  /**
   * Get team colours with primary as main and secondary as accent.
   */
  getTeamColors(teamName: string | null | undefined): {
    main: string;
    accent: string;
  } {
    const palette = this.getPalette(teamName);
    return { main: palette.solidHex, accent: palette.secondaryHex };
  }

  private getNameHash(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (name.charCodeAt(i) + ((hash << 5) - hash)) | 0;
    }
    return hash;
  }
}
