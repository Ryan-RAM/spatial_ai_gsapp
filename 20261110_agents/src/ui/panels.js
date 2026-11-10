// The HTML panels: clock, selected agent card, performance table, events and the legend.

import { FT } from '../sim/config.js';
import { describeLandmark } from '../sim/knowledge.js';
import { LANDMARK_GROUPS } from '../render/groups.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NAME = { drone: 'Delivery drone', tour: 'Tour helicopter', medical: 'Medical helicopter' };
const MODE = {
  charging: 'charging on its pad', takeoff: 'taking off', cruise: 'flying to the customer', drop: 'dropping the package', climb: 'climbing back to its band',
  return: 'flying home', landing: 'landing', divert: 'diverting to a pad (battery low)', recover: 'waiting for recovery after a forced landing',
  parked: 'on the pad', search: 'looking for the heliport', approach: 'approaching the heliport', hold: 'holding (heliport full)', offsite: 'outside the site',
};
const fmtT = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`; };
const n1 = (x) => (x === null || x === undefined ? '–' : Number(x).toFixed(1));

export function makePanels() {
  let lastLog = -1;
  return {
    reset() { lastLog = -1; $('log').innerHTML = ''; },
    clock(sim) { $('clock').textContent = `${fmtT(sim.time)} simulated`; },

    agent(sim, a) {
      const el = $('agent-card');
      if (!a) { el.innerHTML = '<p class="caption">Nobody selected yet. Click an agent, or use Next drone / Next helicopter.</p>'; return; }
      const k = a.knowledge; const w = sim.world;
      const pct = ((100 * k.seenCount) / w.N).toFixed(1);
      const goal = a.goal ? (a.goal.customer ? `customer ${a.goal.customer.id}` : a.goal.home ? 'home hub' : a.goal.sight ? a.goal.sight : a.goal.heliport !== undefined ? `heliport ${w.heliports[a.goal.heliport].id}${k.heliports.has(a.goal.heliport) ? '' : ' (position only approximate)'}` : a.goal.exit ? 'leaving the site' : a.goal.pad !== undefined ? `pad ${a.goal.pad}` : '–') : '–';
      const crit = a.type === 'drone' ? `Least energy: <b>${a.battery.toFixed(0)}</b> of ${a.spec.battery} Wh left, ${a.totals.energy.toFixed(0)} Wh used in total` : `Least time, keep separation: ${a.totals.yields} give-way manoeuvres, ${Math.round(a.totals.waits)} s waiting`;
      const lms = k.landmarks.slice(-40).reverse().map((lm) => {
        const g = LANDMARK_GROUPS.find((q) => q.types.includes(lm.type));
        return `<li><i class="sw dot" style="background:${g?.color}"></i><span>${esc(describeLandmark(w, lm))}${lm.count > 1 ? ` <span class="small">×${lm.count}</span>` : ''}</span></li>`;
      }).join('');
      el.innerHTML = `
        <h3>${NAME[a.type]} #${a.id}</h3>
        <div class="row"><span>Now: <b>${esc(MODE[a.mode] || a.mode)}</b></span><span>Goal: <b>${esc(goal)}</b></span></div>
        <div class="row"><span>Altitude <b>${Math.round(a.z / FT)}</b> ft</span><span>Speed <b>${Math.round(a.speed)}</b> m/s</span><span>Trips done <b>${a.totals.trips}</b></span></div>
        <div class="row"><span>${crit}</span></div>
        <div class="row"><span>Knows <b>${pct}%</b> of the site's cells</span><span>Band rule: <b>${k.bandRule ? 'known' : 'not yet seen'}</b></span>
          <span>Lane gates <b>${k.lanes.size}</b></span><span>No-fly zones <b>${k.noFly.size}</b></span><span>${a.type === 'drone' ? `Pads <b>${k.pads.size}</b>` : `Heliports <b>${k.heliports.size}</b>, references <b>${k.refs.size}</b>`}</span>
          <span>Agents met <b>${k.agents.size}</b></span>${a.type === 'drone' ? `<span>Remembered routes <b>${k.routes.size}</b></span>` : ''}</div>
        <div class="small" style="margin-top:6px">Landmarks (${k.landmarks.length}), newest first. ${a.type === 'drone' ? 'A drone remembers them relative to its home pad and along its trips.' : 'A helicopter crew remembers them against things it can see.'}</div>
        <ul class="lm-list">${lms || '<li class="small">none yet</li>'}</ul>`;
    },

    log(sim) {
      const ev = sim.events; if (!ev.length || ev[ev.length - 1] === lastLog) return;
      lastLog = ev[ev.length - 1];
      $('log').innerHTML = ev.slice(-60).reverse().map((e) => `<li><b>${fmtT(e.t)}</b>${esc(e.text)}</li>`).join('');
    },

    performance(sim) {
      const s = sim.summary();
      const rows = [];
      for (const [type, v] of Object.entries(s.types)) {
        for (const k of ['1', '2', '3', '4+']) {
          const r = v.perTripNumber[k]; if (!r) continue;
          rows.push(`<tr><td>${NAME[type]}</td><td>${k}</td><td>${r.n}</td><td>${n1(r.minutes)}</td><td>${n1(r.km)}</td><td>${type === 'drone' ? n1(r.wh) : '–'}</td><td>${n1(r.replans)}</td><td>${type === 'drone' ? `${Math.round(r.reuseShare)}%` : '–'}</td><td>${n1(r.violationSeconds)}</td><td>${n1(r.waitSeconds)}</td></tr>`);
        }
      }
      $('perf-table').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Agent</th><th>Trip no.</th><th>Trips</th><th>Minutes</th><th>km</th><th>Wh</th><th>Re-plans</th><th>Remembered route</th><th>Violation s</th><th>Wait s</th></tr></thead>
        <tbody>${rows.join('') || '<tr><td colspan="10" class="small">No trip finished yet.</td></tr>'}</tbody></table></div>`;
      const d = s.types.drone.totals, t = s.types.tour.totals, m = s.types.medical.totals;
      $('totals').innerHTML = [
        ['Drones knowing the band rule', `${s.types.drone.knowsBandRule} / ${s.types.drone.agents}`],
        ['Congestion encounters (drones / helicopters)', `${d.congestionEncounters} / ${t.congestionEncounters + m.congestionEncounters}`],
        ['Losses of separation (helicopter pairs / drone pairs / mixed)', `${s.separation.heli} / ${s.separation.drone} / ${s.separation.mixed}`],
        ['Emergency diversions / forced landings (drones)', `${d.emergencies} / ${d.forcedLandings}`],
        ['Wrong-way lane seconds (helicopters)', Math.round(t.wrongWaySeconds + m.wrongWaySeconds)],
        ['No-fly seconds (all)', Math.round(d.nfzSeconds + t.nfzSeconds + m.nfzSeconds)],
        ['Near misses with unseen buildings', d.buildingNearMisses + t.buildingNearMisses + m.buildingNearMisses],
      ].map(([k, v]) => `<span>${k}: <b>${v}</b></span>`).join('');
    },

    heatNote(kind, max) {
      const T = {
        landmarks: 'Heat map: landmarks left by every agent (count per 50 m cell, log scale; home pads left out).',
        congestion: 'Heat map: congestion and holding landmarks: where agents saw a crowd in their cone and treated it as a hindrance.',
        crowd: 'Heat map: ground truth crowding: seconds an agent spent with too many others close by in its band (no agent sees this map).',
        drone: 'Heat map: seconds drones spent over each cell.', heli: 'Heat map: seconds helicopters spent over each cell.',
        knowledge: 'Heat map: how many agents know each cell (linear scale): the shared part of their spatial knowledge.',
        none: 'No heat map.',
      };
      $('heat-note').textContent = `${T[kind] || ''}${max ? ` Brightest cell: ${Math.round(max)}.` : ''}`;
    },

    legend(mode, p, heat) {
      const sw = (c, t, dot) => `<span><i class="sw${dot ? ' dot' : ''}" style="background:${c}"></i>${t}</span>`;
      const agents = sw(p.drone, 'Drone') + sw(p.tour, 'Tour helicopter') + sw(p.medical, 'Medical helicopter (white top)');
      let html = '';
      if (mode === 'city') html = agents + sw(p.lane, 'River loop lane') + sw(p.nfz, 'No-fly: all') + sw(p.nfzDrone, 'No-fly: drones') + sw(p.heliport, 'Heliport') + sw(p.hub, 'Drone hub / pad') + sw(p.selection, 'Selected: cone, trail, plan');
      else if (mode === 'knowledge') html = sw(p.kLand, 'Seen land') + sw(p.kWater, 'Seen water') + sw(p.lane, 'Lane it found') + sw(p.nfz, 'No-fly it found') + sw(p.kBlock, 'Known obstacle') + sw(p.kBlockHot, 'Too tall for its band') + LANDMARK_GROUPS.map((g) => sw(g.color, g.label, true)).join('') + sw(p.anchor, 'Line: what a landmark is remembered against');
      else html = agents.replace('Drone', 'Drone paths').replace('Tour helicopter', 'Tour paths').replace('Medical helicopter (white top)', 'Medical paths') + sw('#c98500', 'Congestion landmark (size = agents)', true) + (heat && heat !== 'none' ? '<span><i class="ramp"></i>heat: low → high</span>' : '');
      $('legend').innerHTML = html;
    },
  };
}
