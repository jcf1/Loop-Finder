import { loadPyodide } from "pyodide";

export var Pyodide = (function () {
  var instance;
  function createInstance() {
    var object = new PythonRunner();
    return object;
  }
  return {
    getInstance: function () {
      if (!instance) {
        instance = createInstance();
      }
      return instance;
    },
  };
})();

class PythonRunner {
  constructor() {
    this.code = '';
    fetch('https://raw.githubusercontent.com/jcf1/Loop-Finder/pyodide/src/loopFinder.py', {
        mode: 'no-cors',  
    })
    .then((res) => res.text())
    .then((text) => {
        this.code = text
    });

    this._output = console.log;
    this._pyodide = null;
    loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full",
      stderr: (text) => {
        this._output(text);
      },
      stdout: (text) => {
        this._output(text);
      },
    }).then((result) => {
      this._pyodide = result;      
    });
  }
  setOutput(output) {
    this._output = output;
  }
  run(clip, minLen, maxLen, threshold, evaluation) {
    if (this._pyodide) {
        const globals = this._pyodide.toPy({clip, minLen, maxLen, threshold, evaluation});
        return this._pyodide.runPython(this.code,{globals});
    }
  }
}
