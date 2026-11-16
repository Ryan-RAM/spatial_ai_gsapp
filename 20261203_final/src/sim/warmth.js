// Survivor body heat (semantic model §7.6, rules E1-E2). Warmth runs 100 -> 0; at 0 the survivor
// collapses ("taken by the cold"). No DOM.
//   E1  loss per second = k x max(0, (10 °C - T_wc) / 10 °C) x (0.3 + 0.7 x openness): wind chill
//       from the storm clock, exposure from the cell (canopy and terrain shelter)
//   E2  in a warming shelter, +1 per second

export function warmthLossPerSecond(config, windChillC, openness01) {
  return config.survivor.warmthK * Math.max(0, (10 - windChillC) / 10) * (0.3 + 0.7 * openness01);
}

// warmth after dt seconds; `inShelter` overrides exposure
export function updateWarmth(config, warmth, dt, weather, openness01, inShelter = false) {
  const next = inShelter
    ? warmth + config.survivor.shelterGain * dt
    : warmth - warmthLossPerSecond(config, weather.windChillC, openness01) * dt;
  return Math.min(config.survivor.warmthMax, Math.max(0, next));
}

// seconds until warmth reaches 0 at a constant loss rate (for the planner's look-ahead, §12)
export function secondsLeft(config, warmth, weather, openness01) {
  const r = warmthLossPerSecond(config, weather.windChillC, openness01);
  return r > 0 ? warmth / r : Infinity;
}
