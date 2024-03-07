import mongo from '../lib/mongo.js';
import { getPodNameForNode } from '../lib/k8s.js'
import diff from "microdiff";
import logger from '../lib/logging.js'

import config from '../lib/config.js';
import Queue from 'bee-queue'

import { updateLabels } from './update-pod-labels.js';
import redis from 'redis'

// const updateStatusQueue = new Queue('rs-status-updates',
//                                 { redis: {host: config.redisURL.hostname, port: config.redisURL.port},
//                                   removeOnSuccess: true,
//                                   removeOnFailure: true,
//                                   activateDelayedJobs: true,
//                                   isWorker: true, 
//                                 })

var processor = async (job) => {
  logger.trace({ queue: 'rs-status', jobId: job.id, relicaset: job.data.set }, 'started processing replica set changes')
  try {
    // --------------------------------------------------------------------------------
    // Obtain the current replica-set status
    var {db,close} = mongo.getDb()
    var rsStatus = await mongo.replSetGetStatus(db)

    // Compute differences to last update
    const memberDiff = diff(job.data.members,rsStatus.members)
    if (memberDiff.length === 0) return;

    // --------------------------------------------------------------------------------
    // Handle changes to member state and health
    const stateChanges = memberDiff.filter( e => 
      (e.path[1] === 'state' || e.path[1] === 'health') && 
      (e.type === 'CHANGE' || e.type === 'CREATE' ) 
    )      

    // Filter for unique members - see: https://codeburst.io/javascript-array-distinct-5edc93501dc4
    const id = stateChanges.map( s => s.path[0] ).filter( (value,index,self) => self.indexOf(value) === index )
    const hosts = id.map( i => rsStatus.members[i] )

    hosts.map( async h => updateLabels(await getPodNameForNode(h.name), h.stateStr, h.health, rsStatus.set) )
    
    // --------------------------------------------------------------------------------
    // Handle changes to node states
    // This will broadcast any change or addition of state to all nodes. The nodes 
    // will leave/assume roles accordingly
    const primaryChanges = memberDiff.filter( e=> e.path[1] === 'state')
    const publisher = redis.createClient({url: config.redisURL.toString()})
    try {
      await publisher.connect()
      primaryChanges.map( async (e) => {
        if (e.type === 'CHANGE' || e.type === 'CREATE' ) {
          logger.trace({member: rsStatus.members[e.path[0]].name, changes: e}, "publish to 'member-state-change'")
        
          await publisher.publish('member-state-change', JSON.stringify({member: rsStatus.members[e.path[0]].name, oldState: e.oldValue, state: e.value}))
        }
      })
    } finally {
      await publisher.quit()
    }


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
}

// export var joinStatusUpdateQueue = async () => {
//   updateStatusQueue.process( processor )
//   logger.trace('Joined rs-status-update queue as worker')

//   // Ensure that there is at least one job in the queue
//   try {
//     const jobCounts = await updateStatusQueue.checkHealth();
//     if ((jobCounts.waiting + jobCounts.active + jobCounts.delayed) < 1) {
//       var {db,close} = mongo.getDb()
//       var rsStatus = await mongo.replSetGetStatus(db)>
//       await updateStatusQueue.createJob(rsStatus).save()
//       logger.info({queueHealth: jobCounts}, "Start monitoring replica set status and join worker queue.")
//     } else {
//       logger.info({queueHealth: jobCounts}, "Replica set monitoring already underway. Joining worker queue.")
//     }
//   } catch (err) {
//     // We are not yet part of the cluster
//     logger.error(err, `Could not access/initialise replica set update queue. Retrying in ${config.loopSleepSeconds} sec.`)
//     setTimeout(workloop, config.loopSleepSeconds * 1000)
//   } finally {
//     if (db && close) close()
//   }
// }
