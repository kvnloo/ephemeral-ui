// Synthetic, source-specific health fixtures for the health kinds (kinds-h.js, and the merged brief in kinds-f.js).
// Every number is made up for 2026-11-01. Field names, record types and units follow each source's own public
// API or export format, so a host can map real data onto the same shape; no real person's data is in here.
//
// Shape: { id, name, family: "activity" | "recovery" | "nutrition", day,
//   provenance: { via, device, records: [record type / field ids], note? },
//   headline: { field, label, value, unit, goal? },
//   metrics: [{ field, label, value, unit, raw?: { value, unit } }],   // raw = the source's own unit when it differs
//   series: { label, unit, points: [7 days, oldest first] },
//   goals?: [{ label, value, goal, unit }],                             // rings / macros
//   meals?: [{ label, kcal }] }
export const HEALTH_DAY = "2026-11-01";

export const HEALTH_SOURCES = {
  "apple-health": {
    id: "apple-health", name: "Apple Health", family: "activity", day: HEALTH_DAY,
    provenance: { via: "HealthKit · HKStatisticsCollectionQuery, 1-day buckets", device: "Apple Watch (synthetic)",
      records: ["HKQuantityTypeIdentifierStepCount", "HKQuantityTypeIdentifierActiveEnergyBurned", "HKQuantityTypeIdentifierAppleExerciseTime", "HKCategoryTypeIdentifierAppleStandHour", "HKQuantityTypeIdentifierHeartRateVariabilitySDNN", "HKQuantityTypeIdentifierRestingHeartRate"] },
    headline: { field: "HKQuantityTypeIdentifierActiveEnergyBurned", label: "Move", value: 486, unit: "kcal", goal: 600 },
    goals: [{ label: "Move", value: 486, goal: 600, unit: "kcal" }, { label: "Exercise", value: 22, goal: 30, unit: "min" }, { label: "Stand", value: 9, goal: 12, unit: "h" }],
    metrics: [
      { field: "HKQuantityTypeIdentifierStepCount", label: "Steps", value: 8214, unit: "steps", raw: { value: 8214, unit: "count" } },
      { field: "HKQuantityTypeIdentifierAppleExerciseTime", label: "Exercise", value: 22, unit: "min" },
      { field: "HKCategoryTypeIdentifierAppleStandHour", label: "Stand hours", value: 9, unit: "h" },
      { field: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN", label: "HRV (SDNN)", value: 48, unit: "ms" },
      { field: "HKQuantityTypeIdentifierRestingHeartRate", label: "Resting HR", value: 57, unit: "bpm", raw: { value: 57, unit: "count/min" } },
    ],
    series: { label: "Steps · 7 days", unit: "steps", points: [6120, 9840, 7305, 5210, 10422, 11980, 8214] },
  },
  "google-fit": {
    id: "google-fit", name: "Google Fit", family: "activity", day: HEALTH_DAY,
    provenance: { via: "Google Fit REST v1 · users.dataset:aggregate, bucketByTime 1 d", device: "Wear OS watch (synthetic)",
      records: ["com.google.heart_minutes", "com.google.active_minutes", "com.google.step_count.delta", "com.google.distance.delta", "com.google.calories.expended"],
      note: "Google is retiring the Fit APIs; Health Connect carries the same data on Android." },
    headline: { field: "com.google.heart_minutes", label: "Heart Points", value: 34, unit: "pts", goal: 20 },
    goals: [{ label: "Heart Points", value: 34, goal: 20, unit: "pts" }, { label: "Move Minutes", value: 61, goal: 60, unit: "min" }],
    metrics: [
      { field: "com.google.active_minutes", label: "Move Minutes", value: 61, unit: "min" },
      { field: "com.google.step_count.delta", label: "Steps", value: 9402, unit: "steps" },
      { field: "com.google.distance.delta", label: "Distance", value: 6.87, unit: "km", raw: { value: 6870, unit: "m" } },
      { field: "com.google.calories.expended", label: "Energy expended", value: 2312, unit: "kcal" },
    ],
    series: { label: "Heart Points · 7 days", unit: "pts", points: [12, 28, 9, 18, 41, 52, 34] },
  },
  oura: {
    id: "oura", name: "Oura", family: "recovery", day: HEALTH_DAY,
    provenance: { via: "Oura API v2 · /v2/usercollection/daily_readiness + /sleep", device: "Oura Ring (synthetic)",
      records: ["daily_readiness.score", "daily_sleep.score", "sleep.average_hrv", "sleep.lowest_heart_rate", "sleep.total_sleep_duration", "daily_readiness.temperature_deviation"] },
    headline: { field: "daily_readiness.score", label: "Readiness", value: 74, unit: "/100" },
    metrics: [
      { field: "daily_sleep.score", label: "Sleep score", value: 81, unit: "/100" },
      { field: "sleep.average_hrv", label: "Average HRV", value: 41, unit: "ms" },
      { field: "sleep.lowest_heart_rate", label: "Lowest HR", value: 52, unit: "bpm" },
      { field: "sleep.total_sleep_duration", label: "Total sleep", value: 7.2, unit: "h", raw: { value: 25920, unit: "s" } },
      { field: "daily_readiness.temperature_deviation", label: "Temp. deviation", value: -0.2, unit: "°C" },
    ],
    series: { label: "Average HRV · 7 nights", unit: "ms", points: [44, 47, 39, 36, 42, 45, 41] },
  },
  whoop: {
    id: "whoop", name: "WHOOP", family: "recovery", day: HEALTH_DAY,
    provenance: { via: "WHOOP Developer API v2 · /v2/recovery + /v2/cycle", device: "WHOOP strap (synthetic)",
      records: ["recovery.score.recovery_score", "recovery.score.hrv_rmssd_milli", "recovery.score.resting_heart_rate", "recovery.score.spo2_percentage", "recovery.score.skin_temp_celsius", "cycle.score.strain"] },
    headline: { field: "recovery.score.recovery_score", label: "Recovery", value: 62, unit: "%" },
    metrics: [
      { field: "recovery.score.hrv_rmssd_milli", label: "HRV (RMSSD)", value: 58, unit: "ms" },
      { field: "recovery.score.resting_heart_rate", label: "Resting HR", value: 54, unit: "bpm" },
      { field: "recovery.score.spo2_percentage", label: "SpO₂", value: 96.1, unit: "%" },
      { field: "recovery.score.skin_temp_celsius", label: "Skin temp", value: 33.4, unit: "°C" },
      { field: "cycle.score.strain", label: "Day strain", value: 11.4, unit: "/21" },
    ],
    series: { label: "Recovery · 7 days", unit: "%", points: [71, 66, 48, 39, 57, 70, 62] },
  },
  noop: {
    id: "noop", name: "NOOP", family: "recovery", day: HEALTH_DAY,
    provenance: { via: "NOOP · strap over Bluetooth, computed on-device, local SQLite (no cloud)", device: "WHOOP 4.0 strap via NOOP (synthetic)",
      records: ["heart rate", "R-R intervals", "SpO₂", "skin temperature", "respiration"],
      note: "Open source, offline. Derived scores are approximations, not clinical data." },
    headline: { field: "recovery (local)", label: "Recovery (local)", value: 58, unit: "%" },
    metrics: [
      { field: "R-R intervals", label: "HRV (RMSSD from R-R)", value: 52, unit: "ms" },
      { field: "heart rate", label: "Resting HR", value: 55, unit: "bpm" },
      { field: "respiration", label: "Respiratory rate", value: 14.8, unit: "br/min" },
      { field: "SpO₂", label: "SpO₂", value: 95, unit: "%" },
      { field: "R-R intervals", label: "Beats recorded", value: 31204, unit: "R-R" },
    ],
    series: { label: "Local recovery · 7 days", unit: "%", points: [64, 61, 45, 41, 52, 66, 58] },
  },
  myfitnesspal: {
    id: "myfitnesspal", name: "MyFitnessPal", family: "nutrition", day: HEALTH_DAY,
    provenance: { via: "MyFitnessPal · Export data, Nutrition Summary CSV (per meal)", device: "Food diary (synthetic)",
      records: ["Calories", "Protein (g)", "Carbohydrates (g)", "Fat (g)", "Sodium (mg)", "Fiber"] },
    headline: { field: "Calories", label: "Calories", value: 1860, unit: "kcal", goal: 2200 },
    goals: [{ label: "Protein", value: 112, goal: 150, unit: "g" }, { label: "Carbs", value: 196, goal: 248, unit: "g" }, { label: "Fat", value: 63, goal: 73, unit: "g" }],
    meals: [{ label: "Breakfast", kcal: 420 }, { label: "Lunch", kcal: 610 }, { label: "Dinner", kcal: 690 }, { label: "Snacks", kcal: 140 }],
    metrics: [
      { field: "Protein (g)", label: "Protein", value: 112, unit: "g" },
      { field: "Carbohydrates (g)", label: "Carbs", value: 196, unit: "g" },
      { field: "Fat (g)", label: "Fat", value: 63, unit: "g" },
      { field: "Sodium (mg)", label: "Sodium", value: 2140, unit: "mg" },
      { field: "Fiber", label: "Fiber", value: 24, unit: "g" },
    ],
    series: { label: "Calories · 7 days", unit: "kcal", points: [2050, 1980, 2310, 1720, 2140, 2490, 1860] },
  },
  lifesum: {
    id: "lifesum", name: "Lifesum", family: "nutrition", day: HEALTH_DAY,
    provenance: { via: "Lifesum → Health Connect · NutritionRecord + HydrationRecord", device: "Food diary (synthetic)",
      records: ["NutritionRecord.energy", "NutritionRecord.protein", "NutritionRecord.totalCarbohydrate", "NutritionRecord.totalFat", "HydrationRecord.volume"] },
    headline: { field: "NutritionRecord.energy", label: "Eaten", value: 1540, unit: "kcal", goal: 1900 },
    goals: [{ label: "Protein", value: 88, goal: 119, unit: "g" }, { label: "Carbs", value: 150, goal: 214, unit: "g" }, { label: "Fat", value: 58, goal: 63, unit: "g" }],
    meals: [{ label: "Breakfast", kcal: 380 }, { label: "Lunch", kcal: 520 }, { label: "Dinner", kcal: 560 }, { label: "Snack", kcal: 80 }],
    metrics: [
      { field: "NutritionRecord.protein", label: "Protein", value: 88, unit: "g" },
      { field: "NutritionRecord.totalCarbohydrate", label: "Carbs", value: 150, unit: "g" },
      { field: "NutritionRecord.totalFat", label: "Fat", value: 58, unit: "g" },
      { field: "HydrationRecord.volume", label: "Water", value: 1.75, unit: "L", raw: { value: 1750, unit: "mL" } },
    ],
    series: { label: "Calories · 7 days", unit: "kcal", points: [1690, 1820, 1450, 1610, 1930, 2080, 1540] },
  },
};

/** The health kinds, one per data family, and the sources each draws. */
export const HEALTH_FAMILIES = {
  activity: ["apple-health", "google-fit"],
  recovery: ["oura", "whoop", "noop"],
  nutrition: ["myfitnesspal", "lifesum"],
};

/** What the merged `health` brief combines for each source: itself plus the families it lacks. */
export const HEALTH_MERGE = {
  "apple-health": ["apple-health", "oura", "myfitnesspal"],
  "google-fit": ["google-fit", "noop", "lifesum"],
  oura: ["oura", "apple-health", "myfitnesspal"],
  whoop: ["whoop", "apple-health", "myfitnesspal"],
  noop: ["noop", "google-fit", "lifesum"],
  myfitnesspal: ["myfitnesspal", "whoop", "apple-health"],
  lifesum: ["lifesum", "oura", "google-fit"],
};

/** "8,214" / "6.87" / "−0.2": what a card prints for a metric value. */
export const fmtValue = (v) => (v < 0 ? "−" : "") + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
