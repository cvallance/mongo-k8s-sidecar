import mongo from './mongo.js';
import { getPodNameForNode, patchPodLabels } from './k8s.js'
import diff from "microdiff";
import logger from './logging.js'

import config from './config.js';
import Queue from 'bee-queue'

const never = new Promise(() => {}) // wait forever

const updateStatusQueue = new Queue('rs-status',
                                {sendEvents: true, 
                                 isWorker: true, 
                                 removeOnSuccess: true,
                                 removeOnFailure: true,
                                 activateDelayedJobs: true})

updateStatusQueue.on('ready', () => {
  updateStatusQueue.process( async (job) => {
    logger.trace({ queue: 'rs-status', jobId: job.id, relicaset: job.data.set }, 'started processing replica set changes')
    try {
      var {db,close} = mongo.getDb()
      var rsStatus = await mongo.replSetGetStatus(db)

      const memberDiff = diff(job.data.members,rsStatus.members)
      if (memberDiff.length === 0) return;

      const stateChanges = memberDiff.filter( e => 
        (e.path[1] === 'state' || e.path[1] === 'health') && 
        (e.type === 'CHANGE' || e.type === 'CREATE' ) 
      )      
      const hosts = stateChanges.map( s => rsStatus.members[s.path[0]] )
      
      hosts.map( async h => 
        labelUpdateQueue.createJob({ 
          name: await getPodNameForNode(h.name), 
          state: h.stateStr,
          health: h.health
        }).save()
      )

    } catch (err) {
      // There are transient states that lead to failures when reading the state of the 
      // replica set. This is most likely the case when the replica set is not yet
      // initialised.
      logger.error(err, "Could not read replica set state from localhost. This can happen when the replica set is not yet initialised. Something is seriously wrong if the error persists.")
    } finally {
      updateStatusQueue.createJob(rsStatus)
        .delayUntil(new Date(Date.now() + config.loopSleepSeconds*1000))
        .save()
      if (db && close) close()
      logger.trace({ queue: 'rs-status', jobId: job.id }, 'finished processing replica set changes')
    }
  });
})

const labelUpdateQueue = new Queue('label-update', {isWorker: true})
labelUpdateQueue.on('ready', () => {
  labelUpdateQueue.process( async (job) => {

    logger.trace({ queue: 'label-update', jobId: job.id, jobData: job.data }, 'started processing')
    try {
      
      var {name, state, health} = job.data
      var podname = await getPodNameForNode(name)
      const labels = { 
        'replicaset.mongodb.com/state': state,
        'replicaset.mongodb.com/health': (health === 1) ? 'healthy' : 'unhealthy' 
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
  })
})

var workloop = async () => {
  
  try {
    // var {db,close} = mongo.getDb()
    // var rsStatus = await mongo.replSetGetStatus(db)

    // // Make sure this pods labels reflect the current state
    // let me = rsStatus.members.filter( m => m.self )[0]
    // labelUpdateQueue.createJob({ name: me.name, state: me.stateStr, health: me.health }).save()

    // Do a general update to kick things off if work queue is blank
    const jobCounts = await updateStatusQueue.checkHealth();
    if ((jobCounts.waiting + jobCounts.active + jobCounts.delayed) < 1) {
      logger.info("Start monitoring replica set status and join worker queue.")
      var {db,close} = mongo.getDb()
      var rsStatus = await mongo.replSetGetStatus(db)>
      updateStatusQueue.createJob(rsStatus).save()
    } else {
      logger.info("Replica set monitoring already underway. Will join worker queue.")
    }
  } catch (err) {
    // We are not yet part of the cluster
    logger.error(err, `Could not access/initialise replica set update queue. Trying in ${config.loopSleepSeconds} sec.`)
    setTimeout(workloop, config.loopSleepSeconds * 1000)
  } finally {
    if (db && close) close()
  }
  await never
}

export default {
  workloop: workloop
}
