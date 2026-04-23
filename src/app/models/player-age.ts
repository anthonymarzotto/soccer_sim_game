/**
 * Returns the in-game anchor date for the given season year.
 * Currently January 1 of the season year as a placeholder until the
 * schedule-as-calendar feature lands on the roadmap.
 */
export function seasonAnchorDate(seasonYear: number): Date {
  return new Date(Date.UTC(seasonYear, 0, 1));
}

/**
 * Returns the player's age in years as of the given date.
 */
export function computeAge(birthday: Date, asOf: Date): number {
  let age = asOf.getUTCFullYear() - birthday.getUTCFullYear();
  const monthDiff = asOf.getUTCMonth() - birthday.getUTCMonth();
  const dayDiff = asOf.getUTCDate() - birthday.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}

/**
 * Builds a birthday Date such that `computeAge(birthday, seasonAnchorDate(seasonYear))`
 * returns `ageYears`. Distributes within the year using a deterministic 0..1 random
 * provided by the caller so the same seed yields the same birthday.
 */
export function birthdayForAge(ageYears: number, seasonYear: number, random01: number): Date {
  const dayOffset = Math.min(364, Math.max(0, Math.floor(random01 * 365)));
  const date = new Date(Date.UTC(seasonYear - ageYears, 0, 1));
  date.setUTCDate(date.getUTCDate() - dayOffset);
  return date;
}
