import { joinPrimaryQueue, leavePrimaryQueue } from "../queues/primary-queue.js"
import logger from "../lib/logging.js"

export var takeOnPrimaryRole = async () => {
  logger.trace({role: 'primary'}, "Taking on role")
  await joinPrimaryQueue()
}

export var leavePrimaryRole = async () => {
  logger.trace({role: 'primary'}, "Leaving on role")
  await leavePrimaryQueue()
}
