import worker from './lib/worker.js';
import label  from './lib/labels.js';
import k8s  from './lib/k8s.js';
import config from './lib/config.js';
import logger from './lib/logging.js'

logger.info('Starting up mongo-k8s-sidecar');
const never = new Promise(() => {}) // wait forever

worker.init(async function(err) {
  if (err) {
    logger.error(err, 'Error initializing mongo-k8s-sidecar');
    return;
  }

  await Promise.all([worker.workloop(), label.workloop()]) 
});
