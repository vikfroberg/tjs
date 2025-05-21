if (!Map.prototype.map) {
  Object.defineProperty(Map.prototype, 'map', {
    value: function (fn, thisArg) {
      const result = new Map();
      for (const [key, value] of this) {
        result.set(key, fn.call(thisArg, value, key, this));
      }
      return result;
    },
    writable: true,
    configurable: true,
    enumerable: false // keeps it invisible in for..in
  });
}

