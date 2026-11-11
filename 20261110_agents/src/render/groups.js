// Landmark groups and their colours: categorical slots in fixed order (validated data-viz palette,
// dark-surface steps). Kept apart from scene3d.js so the panels work without three.js.
export const LANDMARK_GROUPS = [ // categorical slots in fixed order (dataviz palette, dark steps)
  { key: 'lane', label: 'Lane / corridor entry or exit', types: ['lane-entry', 'lane-exit'], color: '#3987e5' },
  { key: 'band', label: 'Altitude band switch', types: ['band-switch'], color: '#d95926' },
  { key: 'landing', label: 'Landing site', types: ['landing-site'], color: '#199e70' },
  { key: 'congestion', label: 'Congestion', types: ['congestion'], color: '#c98500' },
  { key: 'hold', label: 'Holding point', types: ['hold'], color: '#d55181' },
  { key: 'nfz', label: 'No-fly boundary', types: ['nfz-edge'], color: '#9085e9' },
  { key: 'own', label: 'Home / customer', types: ['home', 'customer'], color: '#008300' },
];
