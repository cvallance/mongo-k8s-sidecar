var worker = require('./lib/worker');

console.log('Sarting up mongo-k8s-sidecar');

worker.init(function(err) {
  if (err) {
    console.error('Error trying to initialize mongo-k8s-sidecar', err);
  }

  worker.workloop();
});