import logger from '../lib/logging.js'

import config from '../lib/config.js';

import { Queue, Worker } from 'bullmq';

import { updatePodLabels } from '../actions/update-pod-labels.js';
import { reconcileState } from '../actions/reconcile-state.js'
import { reconfigureReplicaSet } from '../actions/reconfigure-replica-set.js';

const actions = {
  'update-labels': updatePodLabels,
  'reconcile-state': reconcileState,
  'reconfigure-replica-set': reconfigureReplicaSet
}

const workerQueue = new Queue('worker', { connection: {host: config.redisURL.hostname, port: config.redisURL.port} })
const worker = new Worker('worker', 
      async job => {
        logger.trace({job: job.name, parameters: job.data}, "Start processing job") 
        try {
          if (!(job.name in actions)) throw new Error(`Worker queue cannot process jobs of type '${job.name}'`)
          
          await actions[job.name](job.data)
      
        } catch (err) {
          logger.error({message: err.message, job: job.name, parameters: job.data, error: err}, "Error processing job in worker queue")
        } finally {
          logger.trace({job: job.name, parameters: job.data}, "Finished processing job")
        }
      },
      {
        autorun: false ,
        connection: {host: config.redisURL.hostname, port: config.redisURL.port}
      }
  )

export async function joinWorkerQueue() {
  
  if (!worker.isRunning()) { 
    worker.run() 
    logger.info("Starting worker")
  } 
  if (worker.isPaused()) { 
    worker.resume() 
    logger.info("Resuming worker")
  }
}

export async function leaveWorkerQueue() {
  if (worker.isRunning() && !worker.isPaused()) { 
    worker.pause() 
    logger.info("Pausing worker")
  }
}

/**
 * Submit a job to the worker queue. 
 * 
 * @param {string} action The name of the action to perform. The queue has to be aware of the action
 * @param {any} parameters An object containing the parameters for action as key-value pairs
 * @param {number} delay A delay for starting the job in sec
 */
export async function submitJob(action, parameters, delay = 0) {

  let job = await workerQueue.add(action, parameters, { delay: delay*1e3 })
  logger.trace({job: job.name, parameters: parameters, delay: delay}, 'Submitted job to worker queue')
  return job
}

/**
 * Submit a periodic job to the worker queue. 
 * 
 * @param {string} action The name of the action to perform. The queue has to be aware of the action
 * @param {any} parameters An object containing the parameters for action as key-value pairs
 * @param {string} cron A cron-type string defining the periodic interval
 */
export async function submitPeriodicJob(action, parameters, cron) {

  let job = await workerQueue.add(action, parameters, { repeat: { pattern: cron}} )
  logger.trace({job: job.name, parameters: parameters, cron: cron}, 'Submitted periodic job to worker queue')
  return job
}