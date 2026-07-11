/**
 * Deliberate memory leaker for watchdog testing. Grows RSS by ~2 MB every
 * 100 ms, forever. Run it, watch customfan flag it (dry-run), then Ctrl+C.
 *
 *   node tools/leaker.js
 */

const hoard = [];

setInterval(() => {
  // ~2 MB of live objects per tick — kept referenced so GC can't reclaim.
  hoard.push(Buffer.alloc(2 * 1024 * 1024, 1));
  if (hoard.length % 50 === 0) {
    console.log(`[leaker] holding ~${(hoard.length * 2).toLocaleString()} MB`);
  }
}, 100);

console.log('[leaker] leaking ~20 MB/s — customfan should flag this. Ctrl+C to stop.');
