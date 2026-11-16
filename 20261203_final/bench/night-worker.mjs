// A worker thread that runs one night of the evaluation suite (the Node stand-in for the Web
// Workers of M6.2): used by bench/run.mjs to time the suite in parallel.
import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { loadWorld } from '../src/data/load-node.js';
import { makeStorm } from '../src/sim/storm.js';
import { runNight } from '../src/sim/round.js';

const world = loadWorld();
const storm = makeStorm(JSON.parse(readFileSync(new URL('../data/baked/storm-2016-01.json', import.meta.url), 'utf8')));
parentPort.on('message', ({ night, plan }) => parentPort.postMessage(runNight(world, storm, { night, plan })));
parentPort.postMessage('ready');
