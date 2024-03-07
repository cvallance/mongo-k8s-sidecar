import { joinWorkerQueue, leaveWorkerQueue } from "../queues/worker-queue.js"
import logger from "../lib/logging.js"

export var takeOnWorkerRole = async () => {
  logger.trace({role: 'worker'}, "Taking on role")
  await joinWorkerQueue()
}

export var leaveWorkerRole = async () => {
  logger.trace({role: 'worker'}, "Leaving on role")
  await leaveWorkerQueue()
}
