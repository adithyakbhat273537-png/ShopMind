const unitLabels = {
  piece: ["piece", "pieces"], unit: ["unit", "units"], pack: ["pack", "packs"],
  packet: ["packet", "packets"], box: ["box", "boxes"], pair: ["pair", "pairs"],
  set: ["set", "sets"], dozen: ["dozen", "dozen"], bundle: ["bundle", "bundles"],
  kg: ["kg", "kg"], g: ["g", "g"], litre: ["L", "L"], ml: ["ml", "ml"],
  metre: ["m", "m"], m: ["m", "m"], cm: ["cm", "cm"], mm: ["mm", "mm"],
  inch: ["in", "in"], foot: ["ft", "ft"], yard: ["yd", "yd"], roll: ["roll", "rolls"],
};

export function formatStockQuantity(quantity, unit = "piece") {
  const parsed = Number(quantity ?? 0);
  const value = Number.isFinite(parsed) ? parsed : 0;
  const safeUnit = String(unit || "piece").trim().toLowerCase();
  const [singular, plural] = unitLabels[safeUnit] || [safeUnit, `${safeUnit}s`];
  return `${value.toLocaleString("en-IN")} ${value === 1 ? singular : plural}`;
}

export function stockUnitLabel(unit = "piece") {
  const safeUnit = String(unit || "piece").trim().toLowerCase();
  return (unitLabels[safeUnit] || [safeUnit, `${safeUnit}s`])[0];
}
