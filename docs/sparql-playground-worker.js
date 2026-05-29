importScripts('https://cdn.jsdelivr.net/gh/eyereasoner/eyeling@v1.24.33/dist/browser/eyeling.browser.js');
importScripts('https://cdn.jsdelivr.net/gh/giacomociti/n3-utils@v0.1.0/builtins/sparql.js');

self.onmessage = (event) => {
  const { requestId, rules } = event.data || {};

  if (!requestId) {
    return;
  }

  try {
    if (!self.eyeling) {
      throw new Error('eyeling browser bundle not loaded in worker');
    }
    if (!self.sparqlBuiltin) {
      throw new Error('sparql builtin module not loaded in worker');
    }

    const result = self.eyeling.reasonStream(rules, {
      builtinModules: [self.sparqlBuiltin],
    });

    self.postMessage({
      requestId,
      ok: true,
      closureN3: result.closureN3,
    });
  } catch (err) {
    const message = (err && err.stack) ? err.stack : String(err);
    self.postMessage({
      requestId,
      ok: false,
      error: message,
    });
  }
};