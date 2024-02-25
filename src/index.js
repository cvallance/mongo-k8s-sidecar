import worker from './lib/worker.js';
import label  from './lib/labels.js';
import k8s  from './lib/k8s.js';
import config from './lib/config.js';

console.log('Starting up mongo-k8s-sidecar');
const never = new Promise(() => {}) // wait forever

// Disable logging
console.debug = function () {};
console.trace = function () {};

worker.init(async function(err) {
  if (err) {
    console.error('Error trying to initialize mongo-k8s-sidecar', err);
    return;
  }

  // try {
  //   worker.workloop(); // run once to establish state, then wait for changes to the pods
  //   console.log(`Start monitoring pod changes in namespace ${config.namespace}`)
  //   var req = await k8s.watchMongoPods(worker.workloop)
  //   await never
  // } catch (err) {
  //   console.error(err)
  //   req.abort()
  // } finally {
  //   console.log(`Stop monitoring pod changes in namespace ${config.namespace}`)
  //   if (req) req.abort()
  // }
  
  await Promise.all([worker.workloop(), label.workloop()]) 
});
