mergeInto(LibraryManager.library, {
  emscripten_stdin_async__deps: ['$EmterpreterAsync'],
  emscripten_stdin_async: function(buf, size) {
    return EmterpreterAsync.handle(function(resume) {
      Module['stdinAsync'](size, function(data) {
        var finalSize = Math.min(size, data.length);
        Module.HEAPU8.set(data.subarray(0, finalSize), buf);
        resume(function() { return finalSize; });
      });
    });
  },
});
