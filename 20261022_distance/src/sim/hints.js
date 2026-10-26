// Explains, in plain English, moments where one distance says "near" and another says "far".

import { canSee, eyePoint, segmentClear } from './los.js';
import { nodeXYL } from './world.js';

const f1 = (v) => v.toFixed(1);

export function describeDistances(game) {
  const { world, config, perceptualQ } = game.ctx;
  const p = game.police;
  const t = game.thief;
  const { euclidean: e, path: d, perceptual: q } = game.distances;
  const P = nodeXYL(world, p.node);
  const T = nodeXYL(world, t.node);
  const clear = segmentClear(world, eyePoint(world, p.node), eyePoint(world, t.node));
  const pSees = canSee(world, p.node, p.facing, t.node);
  const tSees = canSee(world, t.node, t.facing, p.node);
  const vision = config.visionRange;
  const hearing = config.hearingRange;

  if (P.level !== T.level && e <= 5 && d >= e + 5) {
    const upper = P.level === 1 ? 'The police officer' : 'The thief';
    return {
      kind: 'stacked',
      title: 'Stacked on two levels',
      text: `${upper} is on the canopy almost directly above the other: only ${f1(e)} cells apart in a straight line, `
        + `but ${clear ? 'the opening between them is the only gap' : 'the platform floor is in between, so neither can see the other'}. `
        + `To meet, one of them would have to walk ${f1(d)} cells and climb a ladder. Euclidean distance says near; path distance says far.`,
    };
  }
  if (P.level === T.level && e <= 6 && !clear && d >= 1.8 * e && d - e >= 4) {
    const sound = d > hearing
      ? ` Footsteps travel along the path, so at ${f1(d)} cells they do not carry across, even though the straight line is well inside ${hearing}.`
      : '';
    return {
      kind: 'hedge',
      title: 'A wall of vegetation between them',
      text: `Only ${f1(e)} cells apart as the crow flies, but bushes, rocks or trees block both the view and the way: `
        + `the walk around is ${f1(d)} cells.${sound}`,
    };
  }
  if (e <= vision && clear && !pSees.inCone && !tSees.inCone) {
    return {
      kind: 'backToBack',
      title: 'Close, but looking away',
      text: `They are ${f1(e)} cells apart with nothing in between, yet each one is outside the other's 120° vision cone. `
        + 'Distance alone does not decide sight: direction matters too.',
    };
  }
  if (tSees.visible && !pSees.visible) {
    return {
      kind: 'oneSided',
      title: 'One-sided sight',
      text: `The thief can see the police officer ${f1(e)} cells away, but the officer is facing elsewhere. `
        + 'Same Euclidean distance in both directions, different outcome.',
    };
  }
  if (clear && e <= vision && d >= 1.8 * e && d - e >= 6) {
    const across = P.level !== T.level ? 'from the canopy down to the ground through open air' : 'across a gap the path cannot cross';
    return {
      kind: 'seenFar',
      title: 'In view, but a long walk away',
      text: `A clear line of ${f1(e)} cells, ${across}, yet the walk between them is ${f1(d)} cells. `
        + 'Sight follows the Euclidean distance; feet and footsteps follow the path.',
    };
  }
  if (e > vision && q <= perceptualQ(0.1)) {
    return {
      kind: 'twins',
      title: 'Far apart, but in similar places',
      text: `${f1(e)} cells apart, far beyond the ${vision}-cell fog, yet their visibility fingerprints differ by only ${f1(q)} `
        + `(the closest 10% of pairs on this map are below ${f1(perceptualQ(0.1))}). `
        + 'Both stand in places that look almost the same from the inside: Euclidean distance says far; perceptual distance says near.',
    };
  }
  if (d <= hearing && !pSees.visible && !tSees.visible && e <= vision) {
    return {
      kind: 'hearOnly',
      title: 'Within earshot, out of sight',
      text: `Path distance ${f1(d)} is inside the ${hearing}-cell hearing range, so footsteps carry, but neither can see the other.`,
    };
  }
  return {
    kind: 'none',
    title: 'No strong disagreement right now',
    text: `Euclidean ${f1(e)}, path ${f1(d)}, perceptual ${f1(q)}. `
      + (d > e * 1.5 ? 'The walk is clearly longer than the straight line.' : 'The walk is close to the straight line.'),
  };
}
