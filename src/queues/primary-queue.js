import logger from '../lib/logging.js'
import config from '../lib/config.js';

import { Queue, Worker } from 'bullmq'
import { reconfigureReplicaSet } from '../actions/reconfigure-replica-set.js';

const actions = {
  'reconfigure-replica-set': reconfigureReplicaSet
}

const primaryQueue = new Queue('primary', { connection: {host: config.redisURL.hostname, port: config.redisURL.port} })

const worker = new Worker('primary',
  async job => {
    logger.trace({job: job.name, parameters: job.data}, "Start processing primary job") 
    try {
      if (!(job.name in actions)) throw new Error(`Worker queue cannot process jobs of type '${job.name}'`)
      
      await actions[job.name](job.data)

    } catch (err) {
      logger.error({message: err.message, job: job.name, parameters: job.data}, "Error processing job in primary queue")
    } finally {
      logger.trace({job: job.name, parameters: job.data}, "Finished primary processing job")
    }
  },
  {
    autorun: false,
    connection: {host: config.redisURL.hostname, port: config.redisURL.port}
  }
)

export async function joinPrimaryQueue() {
  
  if (!worker.isRunning()) { 
    worker.run() 
    logger.info("Starting primary worker")
  } 
  if (worker.isPaused()) { 
    worker.resume() 
    logger.info("Resuming primary worker")
  }
}

export async function leavePrimaryQueue() {
  if (!worker.isPaused()) { 
    worker.pause() 
    logger.info("Pausing primary worker")
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

  let job = await primaryQueue.add(action, parameters, { delay: delay*1e3 })
  logger.trace({job: job.name, parameters: parameters, delay: delay}, 'Submitted job to primary queue')

}

/**
 * Submit a periodic job to the worker queue. 
 * 
 * @param {string} action The name of the action to perform. The queue has to be aware of the action
 * @param {any} parameters An object containing the parameters for action as key-value pairs
 * @param {string} cron A cron-type string defining the periodic interval
 */
export async function submitPeriodicJob(action, parameters, cron) {

  let job = await primaryQueue.add(action, parameters, { repeat: { pattern: cron}} )
  logger.trace(job, 'Submitted periodic job to worker queue')

}