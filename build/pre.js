var __ffmpegjs_utf8ToStr;

var __ffmpegjs_print = function() {};
var __ffmpegjs_printErr = function() {};
var __ffmpegjs_initialized = false;

Module = {
  'print': function(line) { debugger; __ffmpegjs_print(line); },
  'printErr': function(line) { __ffmpegjs_printErr(line); },
  'onRuntimeInitialized': function() { __ffmpegjs_initialized = true; }
};

function __ffmpegjs(__ffmpegjs_opts) {
  __ffmpegjs_utf8ToStr = UTF8ArrayToString;
  __ffmpegjs_opts = __ffmpegjs_opts || {};
  var __ffmpegjs_return;

  function __ffmpegjs_toU8(data) {
    if (Array.isArray(data) || data instanceof ArrayBuffer) {
      data = new Uint8Array(data);
    } else if (!data) {
      // `null` for empty files.
      data = new Uint8Array(0);
    } else if (!(data instanceof Uint8Array)) {
      // Avoid unnecessary copying.
      data = new Uint8Array(data.buffer);
    }
    return data;
  }

  Object.keys(__ffmpegjs_opts).forEach(function(key) {
    if (['mounts', 'MEMFS', 'arguments', 'print', 'printErr'].indexOf(key) === -1) {
      Module[key] = __ffmpegjs_opts[key];
    }
  });

  if('print' in __ffmpegjs_opts) __ffmpegjs_print = __ffmpegjs_opts['print'];
  if('printErr' in __ffmpegjs_opts) __ffmpegjs_printErr = __ffmpegjs_opts['printErr'];

  // XXX(Kagami): Prevent Emscripten to call `process.exit` at the end of
  // execution on Node.
  // There is no longer `NODE_STDOUT_FLUSH_WORKAROUND` and it seems to
  // be the best way to accomplish that.
  Module["preInit"] = function() {
    if (ENVIRONMENT_IS_NODE) {
      exit = Module["exit"] = function(status) {
        ABORT = true;
        EXITSTATUS = status;
        STACKTOP = initialStackTop;
        exitRuntime();
        if (Module["onExit"]) Module["onExit"](status);
        throw new ExitStatus(status);
      };
    }
  };

  Module["preRun"] = function() {
    (__ffmpegjs_opts["mounts"] || []).forEach(function(mount) {
      var fs = FS.filesystems[mount["type"]];
      if (!fs) {
        throw new Error("Bad mount type");
      }
      var mountpoint = mount["mountpoint"];
      // NOTE(Kagami): Subdirs are not allowed in the paths to simplify
      // things and avoid ".." escapes.
      if (!mountpoint.match(/^\/[^\/]+$/) ||
          mountpoint === "/." ||
          mountpoint === "/.." ||
          mountpoint === "/tmp" ||
          mountpoint === "/home" ||
          mountpoint === "/dev" ||
          mountpoint === "/work") {
        throw new Error("Bad mount point");
      }
      FS.mkdir(mountpoint);
      FS.mount(fs, mount["opts"], mountpoint);
    });

    FS.mkdir("/work");
    FS.chdir("/work");

    (__ffmpegjs_opts["MEMFS"] || []).forEach(function(file) {
      if (file["name"].match(/\//)) {
        throw new Error("Bad file name");
      }
      var fd = FS.open(file["name"], "w+");
      var data = __ffmpegjs_toU8(file["data"]);
      FS.write(fd, data, 0, data.length);
      FS.close(fd);
    });
  };

  Module["postRun"] = function() {
    // NOTE(Kagami): Search for files only in working directory, one
    // level depth. Since FFmpeg shouldn't normally create
    // subdirectories, it should be enough.
    function listFiles(dir) {
      var contents = FS.lookupPath(dir).node.contents;
      var filenames = Object.keys(contents);
      // Fix for possible file with "__proto__" name. See
      // <https://github.com/kripken/emscripten/issues/3663> for
      // details.
      if (contents.__proto__ && contents.__proto__.name === "__proto__") {
        filenames.push("__proto__");
      }
      return filenames.map(function(filename) {
        return contents[filename];
      });
    }

    var inFiles = Object.create(null);
    (__ffmpegjs_opts["MEMFS"] || []).forEach(function(file) {
      inFiles[file.name] = null;
    });
    var outFiles = listFiles("/work").filter(function(file) {
      return !(file.name in inFiles);
    }).map(function(file) {
      var data = __ffmpegjs_toU8(file.contents);
      return {"name": file.name, "data": data};
    });
    __ffmpegjs_return = {"MEMFS": outFiles};
  };
  Module['callMain'](__ffmpegjs_opts["arguments"] || []);

  return __ffmpegjs_return;
}

__ffmpegjs['ready'] = function(fn) {
  if(__ffmpegjs_initialized) {
    fn();
  } else {
    Module["onRuntimeInitialized"] = fn;
  }
};
