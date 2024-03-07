// import logger from '../lib/logging.js'

// import config from '../lib/config.js';
// import Queue from 'bee-queue'

// import mongo from '../lib/mongo.js'
// import redis from 'redis'
// import os from 'os'

// import { subscribeMemberStateChange, createReplicaSetStatusQueue } from '../lib/redis.js';

// import { getPodNameForNode, getMongoPods } from '../lib/k8s.js';

// let rsUpdateQueue

// export async function subscribeToMemberStateChanges() {
//   try {
//     await subscribeMemberStateChange( async (member, oldState, state) => {
//       let podname = await getPodNameForNode(member)
//       let hostname = os.hostname()
      
//       if ( podname === hostname ) {
//         logger.trace({...change, podname, hostname}, "received member-state-change message")
//         // This is about me
//         if ( oldState === 1) leavePrimaryRole()
//         if ( state === 1) takeOnPrimaryRole()
//       } else {
//         logger.trace({...change, podname, hostname}, "ignored member-state-change message; not about me.")
//       }
//     })
//     logger.trace("Subscribed to 'member-state-change' events")
//   } catch (err) {
//     logger.error(err,"Could not subscribe to 'member-state-change' events")
//   }
// }

// var processor = async (job) => {

//   var getAddressesToAdd = (pods, members) => {
//     return pods.filter( p => p.status === 'Running')
//                 .map( p => { return { ip: k8s.getPodStableNetworkAddressAndPort(p), service: k8s.getPodIpAddressAndPort(p)}} )
//                 .filter( v => members.every( m => m.name !== v.ip && m.name != v.service ) )
//                 .filter( (value, index, self) => self.indexOf(value) === index )
//   };

//   var getAddressesToRemove = (members) => {
//     const memberShouldBeRemoved = (m) => {
//       return !m.health
//           && moment().subtract(unhealthySeconds, 'seconds').isAfter(m.lastHeartbeatRecv);
//     }
//     return members.filter( m => memberShouldBeRemoved(m) ).map( m => m.name )
//   };

//   logger.trace({ queue: 'rs-update', jobId: job.id, data: job.data }, 'started replica set update')

//   if (!rsUpdateQueue) {
//     logger.error("Processing primary role job without holding primary role")
//     throw new Error("Processing primary role job without holding primary role")
//   }

//   try {

//     //Loop over all the pods we have and see if any of them aren't in the current rs members array
//     //If they aren't in there, add them
//     var pods = await getMongoPods()
//     var db, close = mongo.getDb()
//     const status = await mongo.replSetGetStatus(db)
//     const members = status.members

//     var addrToAdd = getAddressesToAdd(pods, members);
//     var addrToRemove = getAddressesToRemove(members);

//     if (addrToAdd.length || addrToRemove.length) {
//       logger.info({addrToAdd: addrToAdd, addrToRemove: addrToRemove}, "Updating replica set membership")
//       await mongo.addNewReplSetMembers(db, addrToAdd, addrToRemove, shouldForce);      
//     }

//     logger.trace({ queue: 'rs-update', jobId: job.id, data: job.data }, 'finished replica set update')

//   } finally {
//     rsUpdateQueue.createJob({})
//       .delayUntil(new Date(Date.now() + config.loopSleepSeconds*1000))
//       .save()
//     if (close) close()
//   }

// }

// export var takeOnPrimaryRole = async () => {
//   logger.info("Assuming role as primary ")

//   // Setup the work queue
//   rsUpdateQueue = createReplicaSetStatusQueue(true)  
//   rsUpdateQueue.process( processor )

//   // Make sure that there is a monitoring job in the queue
//   const jobCounts = await rsUpdateQueue.checkHealth();
//   if ((jobCounts.waiting + jobCounts.active + jobCounts.delayed) < 1) {
//     await rsUpdateQueue.createJob().save()
//   }
// }

// export var leavePrimaryRole = async () => {
//   logger.info("Leaving primary role")
//   // Close the work queue
//   if (rsUpdateQueue) await rsUpdateQueue.close(3000)
//   rsUpdateQueue = undefined
// }
