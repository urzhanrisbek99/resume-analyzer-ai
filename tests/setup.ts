/**
 * Test environment shims.
 *
 * pdf.js 6 targets a runtime newer than the Node this project supports: it uses
 * `Promise.withResolvers` and iterator helpers, both of which arrived in Node
 * 22. Browsers have had them for longer, so production is unaffected and the
 * application code stays as it is -- the gap exists only when the library is
 * driven from Node, which happens in these tests and nowhere else.
 *
 * `vitest.config.mts` resolves pdf.js to its legacy build for the same reason.
 */
if (typeof (Promise as { withResolvers?: unknown }).withResolvers !== 'function') {
  Object.defineProperty(Promise, 'withResolvers', {
    configurable: true,
    writable: true,
    value: function withResolvers<T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    },
  });
}

/**
 * `ArrayBuffer.prototype.transferToFixedLength` landed in Node 21. pdf.js uses it
 * while building an operator list, and without it image counting fails -- which
 * the library swallows as a page warning rather than an error, so the gap would
 * otherwise show up as a silently empty result instead of a failing test.
 */
if (
  typeof (ArrayBuffer.prototype as { transferToFixedLength?: unknown }).transferToFixedLength !==
  'function'
) {
  Object.defineProperty(ArrayBuffer.prototype, 'transferToFixedLength', {
    configurable: true,
    writable: true,
    value: function transferToFixedLength(this: ArrayBuffer, newLength?: number): ArrayBuffer {
      const length = newLength ?? this.byteLength;
      const copy = new ArrayBuffer(length);
      new Uint8Array(copy).set(new Uint8Array(this, 0, Math.min(length, this.byteLength)));
      return copy;
    },
  });
}
