import logger from './lib/logging.js'

import { initialiseCronJobs } from "./queues/cron-queue.js";

logger.info("Starting tests")

import redis from 'redis'
import Leader from 'redis-leader'

import cron from 'node-cron'
import semaphore from './lib/semaphore.js';

const client = redis.createClient('redis://localhost:6379')
process.on('exit', (code) => client.disconnect() )
client.connect()

const lock = semaphore(client,{key: 'lock:test', ttl: 10})
const lock2 = semaphore(client,{key: 'lock:test', ttl: 10})

let res = await lock.aquire()
logger.info({res:res}, 'First lock')

try {
  let res2 = await lock2.aquire()
} catch (err) {
  logger.info({err:err}, 'Second lock should fail')
}

await lock.renew(20)

setTimeout(async () => {
  let res2 = await lock.aquire()
  logger.info({res:res2}, 'Fist lock should still pass')
  try {
    await lock2.aquire()
  } catch (err) {
    logger.info({err:err}, "Second lock should still fail now")
  }
}, 15*1e3)

setTimeout(async () => {
  let res3 = await lock2.aquire()
  logger.info({res:res3}, 'Now second lock should pass')
  try {
    await lock.aquire()
  } catch (err) {
    logger.info({err:err}, "First lock should fail now")
  }
}, 35*1e3)




logger.info("Finishing tests")

