// The storm clock (semantic model §4, §7.1): the hourly record of the night, interpolated to any
// moment. A deterministic replay; the randomness of the simulation lives in the agents.
//   - temperature, wind speed, gusts, visibility: linear between observations
//   - wind direction: linear on the unit vector, so 350° -> 20° passes through north
//   - snow: the hour's calibrated snowfall falls evenly over the hour before its observation, so
//     the cumulative snowfall S(t) is piecewise linear and the rate piecewise constant (§4.2)
//   - visibility factor vf(t) and wind chill follow from the interpolated values
// Time is storm time in seconds of local wall-clock time (America/New_York), counted from
// 2016-01-01T00:00 local, so that no time zone of the machine can shift it. No DOM.

const MPS_PER_KT = 0.514444;
const DEG = Math.PI / 180;

// '2016-01-23T19:00' (local) -> storm seconds; and back
export function localSeconds(s) {
  const [d, t = '00:00'] = s.split('T');
  const [y, mo, da] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number);
  return (Date.UTC(y, mo - 1, da, h, mi) - Date.UTC(2016, 0, 1)) / 1000;
}
export function localLabel(sec) {
  return new Date(Date.UTC(2016, 0, 1) + sec * 1000).toISOString().slice(0, 16);
}

export function visibilityFactor(visM) {
  return Math.min(1, Math.max(0.35, 0.35 + (0.65 * Math.log(visM / 400)) / Math.log(40)));
}
export function windChillC(tC, windMs) {
  const tF = tC * 9 / 5 + 32; const mph = windMs * 2.23694;
  if (tF > 50 || mph < 3) return tC;
  const v = mph ** 0.16;
  return ((35.74 + 0.6215 * tF - 35.75 * v + 0.4275 * tF * v) - 32) * 5 / 9;
}

export function makeStorm(record) {
  const obs = record.records.filter((r) => r.tempC != null).map((r) => ({ ...r, t: localSeconds(r.time) }));
  const N = obs.length;
  const t0 = obs[0].t; const t1 = obs[N - 1].t;
  const fill = (k, f) => { for (let q = k; q >= 0; q--) if (obs[q][f] != null) return obs[q][f]; for (let q = k; q < N; q++) if (obs[q][f] != null) return obs[q][f]; return 0; };

  function at(t) {
    const tc = Math.min(t1, Math.max(t0, t));
    let k = 0; while (k + 1 < N && obs[k + 1].t <= tc) k++;
    const a = obs[k]; const b = obs[Math.min(N - 1, k + 1)];
    const u = b.t > a.t ? (tc - a.t) / (b.t - a.t) : 0;
    const lerp = (f) => fill(k, f) + (fill(Math.min(N - 1, k + 1), f) - fill(k, f)) * u;
    const tempC = lerp('tempC'); const windMs = lerp('windMs');
    const gustMs = Math.max(windMs, lerp('gustMs') || windMs);
    const visibilityM = lerp('visibilityM');
    // wind direction on the unit vector (calm: keep the last direction)
    const da = fill(k, 'windFromDeg') * DEG; const db = fill(Math.min(N - 1, k + 1), 'windFromDeg') * DEG;
    const vx = (1 - u) * Math.sin(da) + u * Math.sin(db); const vy = (1 - u) * Math.cos(da) + u * Math.cos(db);
    const windFromDeg = ((Math.atan2(vx, vy) / DEG) + 360) % 360;
    // snow: the hour ending at observation b falls evenly between a and b
    const rateCmH = b.t > a.t ? (b.snowCm ?? 0) * 3600 / (b.t - a.t) : 0;
    const cumSnowCm = (a.cumSnowCm ?? 0) + (b.t > a.t ? (b.snowCm ?? 0) * u : 0);
    return {
      t: tc, label: localLabel(tc), tempC, windMs, gustMs, gustKt: gustMs / MPS_PER_KT,
      windFromDeg, windToDeg: (windFromDeg + 180) % 360,
      visibilityM, vf: visibilityFactor(visibilityM),
      snowRateCmH: t < t0 || t > t1 ? 0 : rateCmH, cumSnowCm, windChillC: windChillC(tempC, windMs),
    };
  }
  return { at, start: t0, end: t1, obs };
}
