'use strict';

const worker = require('./lib/worker');


console.log('Starting up mongo-k8s-sidecar');

worker.init()
  .then(worker.workloop)
  .catch(err => console.error('Error trying to initialize mongo-k8s-sidecar', err));
