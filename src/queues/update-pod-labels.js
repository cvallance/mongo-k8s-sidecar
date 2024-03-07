import mongo from '../lib/mongo.js';
import { getPodNameForNode, patchPodLabels } from '../lib/k8s.js'
import diff from "microdiff";
import logger from '../lib/logging.js'

import config from '../lib/config.js';
import Queue from 'bee-queue'


const labelUpdateQueue = new Queue('label-updates', {
                                    redis: {host: config.redisURL.hostname, port: config.redisURL.port},
                                    removeOnSuccess: true,
                                    removeOnFailure: true,
                                    activateDelayedJobs: true, 
                                    isWorker: true
                                  })

const processor = async (job) => {

  logger.trace({ queue: 'label-update', jobId: job.id, jobData: job.data }, 'started processing')
  try {
    
    var {name, state, health, set} = job.data
    var podname = await getPodNameForNode(name)
    const labels = { 
      'replicaset.mongodb.com/state': state,
      'replicaset.mongodb.com/health': (health === 1) ? 'healthy' : 'unhealthy' ,
      'replicaset.mongodb.com/set': set
    }
    await patchPodLabels(podname, labels)
    logger.info({ podname: podname, labels: labels }, 'patched pod labels')
  
  } catch (err) {
    // There are transient states that lead to failures when pods are pending or
    // in other transient states. These are ignored, because a later job
    // will pick the needed changes up once labels can be written to pods.
    logger.error({ queue: 'label-update', jobId: job.id, podName: podname },'Could not update labels of pod. This is probably due to the pod being recreated or deleted. Will wait for next state change to sync labels.')
  } finally {
    logger.trace({ queue: 'label-update', jobId: job.id }, 'finsihed processing')
  }   

}

export var joinUpdateLabelsQueue = () => {
  labelUpdateQueue.process( processor )
  logger.trace('Joined update-labels queue as worker')
}

export var updateLabels = async (podname, state, health, set) => {
  await labelUpdateQueue.createJob({ 
          name: podname, 
          set: set,
          state: state,
          health: health
  }).save()
}
