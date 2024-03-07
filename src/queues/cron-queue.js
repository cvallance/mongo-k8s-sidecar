import { getReplicaSetStatus, processReplicaSetStatusChange } from '../actions/process-replica-set-status-change.js'
import { getCacheValue, setCacheValue, deleteCachedValue } from '../lib/redis.js'
import cron from 'node-cron'
import redis from 'redis'
import config from '../lib/config.js'
import logger from '../lib/logging.js'
import semaphore from '../lib/semaphore.js'
import { processPodChanges, getPodStatus } from '../actions/process-pod-status-changes.js'

const client = new redis.createClient({url: config.redisURL })
process.on('exit', (code) => { try { client.close() } catch { /* fail silently */}})
await client.connect()

const lock = semaphore(client, {key: 'lock:cron-queue', ttl: 60})

const actions = [
  { name: 'update-replica-set-state', cron: '*/10 * * * * *', getter: getReplicaSetStatus, action: processReplicaSetStatusChange, broadcast: false },
  { name: 'update-pod-status', cron: '*/10 * * * * *', getter: getPodStatus, action: processPodChanges, broadcast: false },
  { name: 'renew-semaphore', cron: '*/30 * * * * *', getter: () => {}, action: () => lock.renew(), broadcast: true }
]

export async function initialiseCronJobs() { 

  return Promise.all(
    actions.map( async action => {
      
        // Make sure there is a former value stored
        // if (! await getCacheValue(action.name) ) {
        //   let value = await action.getter()
        //   if (value !== null && value !== undefined) await setCacheValue(action.name, value) 
        //   logger.info({action: action.name, value: value}, 'setting initial value for cron job')
        // }
        
        // Schedule the work
        cron.schedule(action.cron, async () => {
          try {
            action.broadcast || await lock.aquire()
            logger.trace({action: action}, 'Starting cron job')
            let oldValue = await getCacheValue(action.name)
            let value = await action.getter()
            await action.action(oldValue,value)
            if (value !== null && value !== undefined) {
              await setCacheValue(action.name,value)
            } else {
              await deleteCachedValue(action.name)
            }
            logger.trace({action: action, oldValue: oldValue, value: value}, 'Finished cron job')
          } catch (err) {
            if (! (err instanceof SemaphoreLockError)) throw err
          } 
        })

        logger.trace({action: action}, 'Cron job submitted')

      })
  )
}