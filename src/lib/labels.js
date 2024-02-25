import mongo from './mongo.js';
import { getPodNameForNode, patchPodLabels } from './k8s.js'
import diff from "microdiff";
import dns from 'dns'

import config from './config.js';
import Queue from 'bee-queue'

const never = new Promise(() => {}) // wait forever

const updateStatusQueue = new Queue('rs-status',{sendEvents: true, isWorker: true, activateDelayedJobs: true})

updateStatusQueue.on('ready', () => {
  updateStatusQueue.process( async (job) => {
    console.trace("process - updateStatusQueue")
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

      //console.log(rsDiff)
    } catch (err) {
      // console.error(err)
    } finally {
      let job = updateStatusQueue.createJob(rsStatus).delayUntil(new Date(Date.now() + config.loopSleepSeconds*1000))
      job.save()
      if (db && close) close()
      console.trace("finished - updateStatusQueue")
    }
  });
})

const labelUpdateQueue = new Queue('label-update', {isWorker: true})
labelUpdateQueue.on('ready', () => {
  labelUpdateQueue.process( async (job) => {

    console.trace(`process - labelUpdateQueue(${job.data})`)
    try {
      
      var {name, state, health} = job.data
      var podname = await getPodNameForNode(name)
      await patchPodLabels(podname, { 
        'replicaset.mongodb.com/state': state,
        'replicaset.mongodb.com/health': (health === 1) ? 'healthy' : 'unhealthy' 
      })

    } catch (err) {
      console.info(`Could not update labels of pod ${podname}. This is probably due to the pod being recreated or deleted. Will wait for next state change to sync labels.`)
    } finally {
      console.trace(`finished - labelUpdateQueue(${job.data})`)
    }   
  })
})

var workloop = async () => {
  console.trace("Start updating RS status")
  try {
    var {db,close} = mongo.getDb()
    var rsStatus = await mongo.replSetGetStatus(db)

    // Make sure this pods labels reflect the current state
    let me = rsStatus.members.filter( m => m.self )[0]
    labelUpdateQueue.createJob({ name: me.name, state: me.stateStr, health: me.health }).save()

    // Do a general update to kick things off
    updateStatusQueue.createJob(rsStatus).save()
  } catch (err) {
    // We are not yet part of the cluster
    console.log(`Not yet part of the cluster. Trying in ${loopSleepSeconds} sec`)
    setTimeout(workloop, loopSleepSeconds * 1000)
  } finally {
    if (db && close) close()
  }
  await never
}

export default {
  workloop: workloop
}
