(function(exported){

// Statistics
function stats(data) {
    return {
        'min' : Math.min.apply(0, data),
        'max' : Math.max.apply(0, data),
        'mean' : mean(data),
        'median' : median(data),
        'std': std(data),
        'mode' : mode(data),
        'toString' : function() {
            return `{min: ${this.min.toFixed(2)},\tmax: ${this.max.toFixed(2)},\tmean: ${this.mean.toFixed(2)},\tmedian: ${this.median.toFixed(2)},\tstd: ${this.std.toFixed(2)},\tmode: ${this.mode.map(e => e.toFixed(2))}}`;
        }
    };
}

function min(arr) {
	return Math.min.apply(0, arr);
}

function mean(arr) {
        return arr.reduce((a,b) => a+b) / arr.length;
}

function median(arr) {
        arr.sort((a,b) => a-b);
        return (arr.length % 2) ? arr[(arr.length / 2) | 0] : mean([arr[arr.length/2 - 1], arr[arr.length / 2]]);
}

function mode(arr) {
        var counter = {};
        var mode = [];
        var max = 0;
        for (var i in arr) {
                if (!(arr[i] in counter)) {
                        counter[arr[i]] = 0;
                }
                counter[arr[i]]++;
                if (counter[arr[i]] == max) {
                        mode.push(arr[i]);
                } else if (counter[arr[i]] > max) {
                        max = counter[arr[i]];
                        mode = [arr[i]];
                }
        }
        return mode;
}

function variance(arr) {
    var x = mean(arr);
    return arr.reduce((pre, cur) => pre + ((cur - x)**2)) / (arr.length - 1);
}

function std(arr) {
    return Math.sqrt(variance(arr));
}

// Overload
Function.prototype.toSource = function() {
    return this.toString().slice(this.toString().indexOf('{')+1,-1);
}

Object.defineProperty(Array.prototype, 'chunk', {
    value: function(n){
		let results = [];
		let ceiled = this.length%n;
		let k = Math.ceil(this.length/n);
		let q = Math.floor(this.length/n);
		let c = 0;
		for (i=0; i<ceiled; i++) {
			results[i] = this.slice(c, c+k);
			c += k;
		}
		for (i; i<n; i++) {
			results[i] = this.slice(c, c+q);
			c += q;
		}
		return results;
    }
});

// OptimizationStatus
function optimizationStatusToString(status) {
/* from https://github.com/v8/v8/blob/master/src/runtime/runtime.h */
	let o = [];
	if (status & (1<<0)) o.push('kIsFunction');
	if (status & (1<<1)) o.push('kNeverOptimize');
	if (status & (1<<2)) o.push('kAlwaysOptimize');
	if (status & (1<<3)) o.push('kMaybeDeopted');
	if (status & (1<<4)) o.push('kOptimized');
	if (status & (1<<5)) o.push('kTurboFanned');
	if (status & (1<<6)) o.push('kInterpreted');
	if (status & (1<<7)) o.push('kMarkedForOptimization');
	if (status & (1<<8)) o.push('kMarkedForConcurrentOptimization');
	if (status & (1<<9)) o.push('kOptimizingConccurently');
	if (status & (1<<10)) o.push('kIsExecuting');
	if (status & (1<<11)) o.push('kTopmostFrameIsTurboFanned');
	if (status & (1<<12)) o.push('kLiteMode');
	return o.join("|");
}

// Lists

// Send log to main thread
// Constants
const P = 4096;
const VERBOSE = false;
const NOLOG = false;

const THRESHOLD = 50;
const RESULTS = [];

// global vars to refactor
var first, next, n;

exported.build_evset = async function start(options) {
	// Parse settings
	const B = 8000;
	const CONFLICT = true;
	const ASSOC = 16;
	const STRIDE = 4096;

	// Prepare wasm instance
	const OFFSET = options.offset;
	const module = options.module;
	const memory = options.memory;

	log(`OFFSET: ${OFFSET}`);

	const instance = new WebAssembly.Instance(module, {env: {mem: memory}});
	// Memory view
	const view = new DataView(memory.buffer);

	if (!NOLOG) log('Prepare new evset');
	const evset = new EvSet(view, B, P*2, P, ASSOC, STRIDE, OFFSET);
	first = true, next = CONFLICT;

	n = 0;
	const RETRY = 10;
	await new Promise(r => setTimeout(r, 10)); // timeout to allow counter
	do {
		let r = 0;
		while (!cb(instance, evset, CONFLICT) && ++r < RETRY && evset.victim) {
			if (VERBOSE) log('retry');
			first = false;
		}
		if (r < RETRY) {
			RESULTS.push(evset.refs); // save eviction set
			evset.refs = evset.del.slice();
			evset.del = [];
			evset.relink(); // from new refs
			next = CONFLICT;
			if (VERBOSE) log('Find next (', evset.refs.length, ')');
		}
		else
		{
			next = CONFLICT;
		}
	} while (CONFLICT && evset.vics.length > 0 && evset.refs.length > ASSOC);
	
	const SETS = [];
	for (const set of RESULTS) {
		for (let offset = 0; offset < STRIDE; offset += 64){
			SETS.push(set.map(num => {
				return {
					offset: num - (OFFSET*64) + offset,
				};
			}));
		}
	}

	log('Found ' + SETS.length + ' different eviction sets');

	return SETS;
}

function cb(instance, evset, findall) {

    let {wasm_hit, wasm_miss} = instance.exports;

    const REP = 6;
	const T = 1000;

	const CLOCK = 256; // hardcoded offset in wasm
	const VICTIM = evset.victim|0;
	const PTR = evset.ptr|0;

	function runCalibration(title, hit, miss, warm) {
		for (let i=0; i<T; i++) {
			hit(VICTIM);
			miss(VICTIM, 0);
		}
		if (!warm) {
			// real run
			let t_hit = hit(VICTIM);
			let t_miss = miss(VICTIM, PTR);
			// output
			if (VERBOSE) log ('--- ' + title + ' ---');
			if (VERBOSE) log ('Hit:\t' + (Array.isArray(t_hit) ? stats(t_hit) : t_hit));
			if (VERBOSE) log ('Miss:\t' + (Array.isArray(t_miss) ? stats(t_miss) : t_miss));
			if (VERBOSE) log ('-----------');
			// calc threshold
			if (Array.isArray(t_hit)) {
				t_hit = stats(t_hit).median;
			}
			if (Array.isArray(t_miss)) {
				t_miss = stats(t_miss).median;
			}
			if (t_hit > t_miss) {
				return 0;
			} else {
				return ((Number(t_miss) + Number(t_hit) * 2) / 3);
			}
		}
	}

	const wasmMeasureOpt = {
		hit : function hit(vic) {
			let t, total = [];
			for (let i=0; i<REP; i++) {
				t = wasm_hit(vic);
				total.push(Number(t));
			}
			return total;
		},
		miss : function miss(vic, ptr) {
			let t, total = [];
			for (let i=0; i<REP; i++) {
				t = wasm_miss(vic, ptr);
				total.push(Number(t));
			}
			return total;
		}
	}

	if (first) {
		runCalibration('Wasm measure opt', wasmMeasureOpt.hit, wasmMeasureOpt.miss, true);
		if (!THRESHOLD) {
			log('Error: calibrating');
			return false;
		}
		log('Calibrated threshold: ' + THRESHOLD);

		if (findall) {
			log('Creating conflict set...');
			evset.genConflictSet(wasmMeasureOpt.miss, THRESHOLD);
			log('Done: ' + evset.refs.length);
			first = false;
		}
	}

	if (next) {
		let t;
		do {
			evset.victim = evset.vics.pop();
			if (VERBOSE) log('\ttry victim', evset.victim);
			let e = 0;
			while (evset.victim && e < RESULTS.length) {
				if (median(wasmMeasureOpt.miss(evset.victim, RESULTS[e][0])) >= THRESHOLD) {
					RESULTS[e].push(evset.victim);
					if (VERBOSE) log('\tanother, this belongs to a previous eviction set');
					evset.victim = evset.vics.pop();
				}
				e += 1;
			}
			t = median(wasmMeasureOpt.miss(evset.victim, evset.ptr));
		} while (evset.victim && t < THRESHOLD);
		if (!evset.victim) {
			if (VERBOSE) log('No more victims');
			return false;
		}
		next = false;
	}

	if (VERBOSE) log ('Starting reduction...');
	evset.groupReduction(wasmMeasureOpt.miss, THRESHOLD);

	if (evset.refs.length === evset.assoc) {
		//if (!NOLOG) log('Victim addr: ' + evset.victim);
		//if (!NOLOG) log('Eviction set: ' + evset.refs);
		if (RESULTS.length % 13 === 0) {
			log(`Constructed ${RESULTS.length + 1} sets`);
		}
		evset.del = evset.del.flat();
		return true;
	} else {
		while (evset.del.length > 0) {
			evset.relinkChunk();
		}
		if (VERBOSE) log('Failed: ' + evset.refs.length);
		return false;
	}
}

function EvSet(view, nblocks, start=8192, victim=4096, assoc=16, stride=4096, offset=0) {

	const RAND = true;

	/* private methods */
	this.genIndices = function (view, stride) {
		let arr = [], j = 0;
		for (let i=(stride)/4; i < (view.byteLength-this.start)/4; i += stride/4) {
			arr[j++] = this.start + this.offset + i*4;
		}
		arr.unshift(this.start + this.offset);
		return arr;
	}

	this.randomize = function (arr) {
		for (let i = arr.length; i; i--) {
			var j = Math.floor(Math.random() * i | 0) | 0;
			[arr[i - 1], arr[j]] = [arr[j], arr[i - 1]];
		}
		return arr;
	}

	this.indicesToLinkedList =  function (buf, indices) {
		if (indices.length == 0) {
			this.ptr = 0;
			return;
		}
		let pre = this.ptr = indices[0];
		for (let i=1; i<indices.length; i++) {
			view.setUint32(pre, indices[i], true);
			pre = indices[i];
		}
		view.setUint32(pre, 0, true);
	}

	this.init = function() {
		let indx = this.genIndices(view, stride);
		if (RAND) indx = this.randomize(indx);
		indx.splice(nblocks, indx.length); // select nblocks elements
		this.indicesToLinkedList(view, indx);
		return indx;
	}
	/* end-of-private */

	/* properties */
	this.start = start;
	this.offset = (offset&0x3f)<<6;
	this.victim = victim+this.offset;
	view.setUint32(this.victim, 0, true); // lazy alloc
	this.assoc = assoc;
	this.ptr = 0;
	this.refs = this.init();
	this.del = [];
	this.vics = [];
	/* end-of-properties */

	/* public methods */
	this.unlinkChunk = function unlinkChunk(chunk) {
		let s = this.refs.indexOf(chunk[0]), f = this.refs.indexOf(chunk[chunk.length-1]);
		view.setUint32(this.refs[f], 0, true);
		this.refs.splice(s, chunk.length); // splice chunk indexes
		if (this.refs.length === 0) { // empty list
			this.ptr = 0;
		} else if (s === 0) { // removing first chunk
			this.ptr = this.refs[0];
		} else if (s > this.refs.length-1) { // removing last chunk
			view.setUint32(this.refs[this.refs.length-1], 0, true);
		} else { // removing middle chunk
			view.setUint32(this.refs[s-1], this.refs[s], true);
		}
		this.del.push(chunk); // right
	}

	this.relinkChunk = function relinkChunk() {
		let chunk = this.del.pop(); // right
		if (chunk === undefined) {
			return;
		}
		this.ptr = chunk[0];
		if (this.refs.length > 0) {
			view.setUint32(chunk[chunk.length-1], this.refs[0], true);
		}
		if (typeof(chunk) === 'number') {
			this.refs.unshift(chunk); // left
		} else {
			this.refs.unshift(...chunk); // left
		}
	}

	this.groupReduction = function groupReduction(miss, threshold) {
		const MAX = 20;
		let i = 0, r = 0;
		while (this.refs.length > this.assoc) {
			let m = this.refs.chunk(this.assoc+1);
			let found = false;
			for (let c in m) {
				this.unlinkChunk(m[c]);
				let t = median(miss(this.victim, this.ptr));
				if (t < threshold) {
					this.relinkChunk();
				} else {
					found = true;
					break;
				}
			}
			if (!found) {
				r += 1;
				if (r < MAX) {
					this.relinkChunk();
					if (this.del.length === 0) break;
				} else {
					while (this.del.length > 0) {
						this.relinkChunk();
					}
					break;
				}
			}
			if (VERBOSE) if (!(i++ % 100)) print('\tremaining size: ', this.refs.length);
		}
	}

	this.linkElement = function linkElement(e) {
		if (e === undefined) return;
		this.ptr = e;
		if (this.refs.length > 0) {
			view.setUint32(e, this.refs[0], true);
		} else {
			view.setUint32(e, 0, true);
		}
		this.refs.unshift(e); // left
	}

	this.relink = function () {
		this.indicesToLinkedList(this.buffer, this.refs);
	}

	this.genConflictSet = function (miss, threshold) {
		let indices = this.refs; // copy original indices
		this.refs = [];
		this.vics = [];
		let pre = this.ptr = indices[0], i = 0, e, l = indices.length;
		for (i=0; i<Math.min(l, 800); i++) {
			e =  indices.pop();
			this.linkElement(e);
		}
		while (indices.length > 0) {
			e = indices.pop();
			view.setUint32(e, 0, true); // chrome's COW
			let t = miss(e, this.ptr);
			if (Array.isArray(t)) {
				t = median(t);
			}
			if (t < threshold) {
				this.linkElement(e);
			} else {
				this.vics.push(e);
				// break;
			}
		}
		first = true;
	}
	/* end-of-public */
}

})(self);