// DOM updates for the status panel, distance panel, hint, event log and metric table.

import { modeLabel } from '../sim/game.js';

const $ = (id) => document.getElementById(id);
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '∞');

export function makePanels() {
  const log = $('log');
  let lastNotable = null;

  function status(game, score) {
    $('score-police').textContent = score.police;
    $('score-thief').textContent = score.thief;
    $('progress').style.width = `${(100 * game.step) / game.ctx.config.maxSteps}%`;
    $('ov-round').textContent = `Round ${game.round}`;
    $('ov-step').textContent = `Step ${game.step} / ${game.ctx.config.maxSteps}`;
    $('police-mode').textContent = modeLabel('police', game.police.mode);
    $('thief-mode').textContent = modeLabel('thief', game.thief.mode);
    const per = game.perception;
    $('police-hears').classList.toggle('on', per.policeHears);
    $('police-sees').classList.toggle('on', per.policeSees.visible);
    $('thief-hears').classList.toggle('on', per.thiefHears);
    $('thief-sees').classList.toggle('on', per.thiefSees.visible);
  }

  function distances(game) {
    const { config } = game.ctx;
    const d = game.distances;
    const per = game.perception;
    $('d-eu').innerHTML = `${f1(d.euclidean)}<small>cells</small>`;
    $('d-ac').innerHTML = `${f1(d.acoustic)}<small>cells</small>`;
    $('d-path').innerHTML = `${f1(d.path)}<small>cells</small>`;
    $('d-perc').innerHTML = `${f1(d.perceptual)}`;

    const why = [];
    if (d.euclidean > config.visionRange) why.push(`beyond the ${config.visionRange}-cell fog`);
    else {
      if (!per.policeSees.clear) why.push('something solid is in between');
      else {
        why.push('a clear line');
        if (!per.policeSees.inCone && !per.thiefSees.inCone) why.push('but neither faces the other');
        else if (!per.policeSees.inCone) why.push('but the police is facing away');
        else if (!per.thiefSees.inCone) why.push('the thief is facing away');
      }
    }
    $('d-eu-note').textContent = `Sight: ${why.join(', ')}.`;
    const muffle = d.acoustic - d.euclidean;
    $('d-ac-note').textContent = (d.acoustic <= config.hearingRange
      ? `Within the ${config.hearingRange}-cell hearing range: any footstep is heard.`
      : `Beyond the ${config.hearingRange}-cell hearing range: footsteps do not carry.`)
      + (muffle > 1e-6 ? ` Muffling adds ${f1(muffle)}.` : ' Nothing solid in between.');
    $('d-path-note').textContent = d.path > d.euclidean * 1.5
      ? `Walking: ${f1(d.path - d.euclidean)} cells longer than the straight line.`
      : 'Walking: close to the straight line.';
    const q = game.ctx.perceptualQ;
    const rank = d.perceptual <= q(0.1) ? 'very similar places (closest 10% of pairs on this map)'
      : d.perceptual <= q(0.5) ? 'fairly similar places' : 'places that look quite different';
    $('d-perc-note').textContent = `Fingerprint difference: ${rank}.`;

    const h = game.hint;
    $('hint-title').textContent = h.title;
    $('hint-text').textContent = h.text;
    $('hint').classList.toggle('strong', h.kind !== 'none');
    if (h.kind !== 'none') lastNotable = { ...h, step: game.step, round: game.round };
    const showLast = h.kind === 'none' && lastNotable && lastNotable.round === game.round;
    $('hint-last').hidden = !showLast;
    if (showLast) {
      $('hint-last-title').textContent = `${lastNotable.title} (step ${lastNotable.step})`;
      $('hint-last-text').textContent = lastNotable.text;
    }
  }

  function addEvents(events) {
    for (const e of events) {
      const li = document.createElement('li');
      li.className = `${e.who} ${e.kind === 'win' ? 'win' : ''}`;
      const when = document.createElement('span');
      when.className = 'when';
      when.textContent = `R${e.round} · ${e.step}`;
      const what = document.createElement('span');
      what.className = 'what';
      what.textContent = e.text;
      li.append(when, what);
      log.prepend(li);
    }
    while (log.children.length > 200) log.lastChild.remove();
  }

  function roundMarker(text) {
    const li = document.createElement('li');
    li.className = 'round';
    li.innerHTML = '<span class="when">&mdash;</span>';
    const what = document.createElement('span');
    what.textContent = text;
    li.append(what);
    log.prepend(li);
  }

  function axioms(results) {
    const rows = [
      ['euclidean', 'Euclidean'],
      ['acoustic', 'Acoustic'],
      ['path', 'Path'],
      ['perceptual', 'Perceptual'],
    ];
    const cell = (bad, total, extra = '') => (bad === 0
      ? `<span class="ok">Pass</span><small>0 of ${total} violations${extra}</small>`
      : `<span class="bad">Fail</span><small>${bad} of ${total}${extra}</small>`);
    const body = rows.map(([key, label]) => {
      const r = results[key];
      const n = r.triples;
      const id = key === 'perceptual'
        ? (r.zeroPairs === 0
          ? `<span class="ok">Pass on this map</span><small>no two cells have identical fingerprints; closest pair d = ${r.closestDistinct.d.toFixed(2)}</small>`
          : `<span class="bad">Fails</span><small>${r.zeroPairs} pairs of different cells with d = 0</small>`)
        : `<span class="ok">Pass</span><small>d = 0 only for the same cell (all ${results.cells} cells)</small>`;
      const verdict = {
        perceptual: '<b>Pseudometric</b><small>d = 0 is allowed for two different places</small>',
        acoustic: '<b>Semimetric</b><small>no triangle inequality</small>',
      }[key] ?? '<b>Metric</b>';
      return `<tr><td><b>${label}</b></td><td>${cell(r.negative, n)}</td><td>${cell(r.asymmetric, n)}</td>`
        + `<td>${cell(r.triangle, n, ' (random triples)')}</td><td>${id}</td><td>${verdict}</td></tr>`;
    }).join('');
    document.querySelector('#axioms tbody').innerHTML = body;
    const r = results.perceptual;
    $('axioms-note').innerHTML = `<b>Why the perceptual distance is only a pseudometric.</b> It compares what two positions look like,
      not where they are. Two different cells whose 362 rays have exactly the same lengths have d = 0, for example the centres of
      two identical rooms (one of the tests builds such a case). ${r.zeroPairs === 0
        ? `On this map no two cells match exactly, but the closest pair differs by only ${r.closestDistinct.d.toFixed(2)}, while a typical pair differs by about ${results.typicalPerceptual.toFixed(0)}.`
        : `On this map ${r.zeroPairs} pairs of different cells match exactly.`}
      In space, this is what getting lost means: two places that look the same from the inside can be far apart,
      and nothing in what you see tells you which one you are in. Symmetry and the triangle inequality always hold, because it is
      a Euclidean distance between vectors.<br><br>
      <b>Why the acoustic distance is only a semimetric.</b> It fails the triangle inequality in ${results.acoustic.triangle} of
      ${results.acoustic.triples} random triples: a straight line from a to c may cross a rock, while a to b and b to c both pass
      beside it, so going "via b" sounds closer than going straight. Real sound does exactly that: it bends around obstacles
      (diffraction) and arrives along the least muffled route. This model only follows the straight line, which keeps it simple
      and readable, at the price of the triangle inequality.`;
  }

  return { status, distances, addEvents, roundMarker, axioms, resetHint() { lastNotable = null; } };
}
