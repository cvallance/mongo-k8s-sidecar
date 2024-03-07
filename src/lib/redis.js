import redis from 'redis'
import config from './config.js'
import redisLock from 'redis-lock'
import logger from './logging.js'

// -----------------------------------------------------------------------------------------
// Locks and MuTex
// -----------------------------------------------------------------------------------------
const locksmith = redis.createClient({url: config.redisURL})
await locksmith.connect();
logger.trace("Connected locksmith")

process.on("exit", (code) => {
  if (locksmith) try { locksmith.quit() } catch { /*fail silently */ }
})

export const initialiseReplicaSetLock = async () => {
  const lock = redisLock(locksmith)
  return lock("initialise-replica-set", 5000)
}

// -----------------------------------------------------------------------------------------
// Key-Value store
// -----------------------------------------------------------------------------------------
const cache = redis.createClient({url: config.redisURL})
await cache.connect();
logger.trace("Connected cache")

process.on("exit", (code) => {
  if (cache) try { cache.quit() } catch { /*fail silently */ }
})

export async function setCacheValue(key,value) {
  return cache.set(`kvstore:${key}`, JSON.stringify(value))
}

export async function getCacheValue(key) {
  try {
    return JSON.parse(await cache.get(`kvstore:${key}`))
  } catch (err) {
    return new Promise( () => undefined )
  }
}

export async function deleteCachedValue(key) {
  return cache.del(`kvstore:${key}`)
}
// -----------------------------------------------------------------------------------------
// Bee-Queue worker and cron queues
// -----------------------------------------------------------------------------------------
// export const createReplicaSetStatusQueue = 
//   (isWorker) => new Queue('rs-status-updates', { ...common_queue_conig,isWorker: isWorker })
                                                  
// export const createUpdateLabelsQueue = 
//   (isWorker) => new Queue('update-labels', { ...common_queue_conig,isWorker: isWorker })
                                              
// -----------------------------------------------------------------------------------------
// Broadcast message subscription
// -----------------------------------------------------------------------------------------
const publisher = redis.createClient({url: config.redisURL})
await publisher.connect()
logger.trace("Connected publisher")

const subscriber = redis.createClient({url:config.redisURL})
await subscriber.connect()
logger.trace("Connected subscriber")

process.on("exit", (code) => {
  // try to unsubscribe from redis channels gracefully 
  if (publisher) try { publisher.quit() } catch { /* fail silently */ }
  if (subscriber) try { subscriber.quit() } catch { /* fail silently */ }
})

export const broadcastMemberState = async (member, state) => {
  return publisher.publish('member-state', JSON.stringify({member, state}))
}

export const subscribeMemberState = async ( listener ) => {
  return subscriber.subscribe('member-state', async (message) => {
    const {member, state}= JSON.parse(message)
    await listener(member,state)
  })
}