import { spawn } from 'child_process'

let restartCount = 0
const MAX_RESTARTS = 5
const RESTART_DELAY = 5000

function startBot() {
  console.log('🚀 Starting WhatsApp Bot...')
  
  const bot = spawn('node', ['index.js'], {
    stdio: 'inherit',
    shell: true
  })

  bot.on('close', (code) => {
    console.log(`\n❌ Bot stopped with code ${code}`)
    
    if (code !== 0 && restartCount < MAX_RESTARTS) {
      restartCount++
      console.log(`🔄 Restarting bot (${restartCount}/${MAX_RESTARTS}) in ${RESTART_DELAY/1000} seconds...`)
      setTimeout(startBot, RESTART_DELAY)
    } else if (restartCount >= MAX_RESTARTS) {
      console.log('⛔ Max restart attempts reached. Please check the logs.')
      process.exit(1)
    } else {
      console.log('✅ Bot stopped normally')
      process.exit(0)
    }
  })

  bot.on('error', (err) => {
    console.error('❌ Failed to start bot:', err)
  })

  // Reset restart count on successful run (after 1 minute)
  setTimeout(() => {
    restartCount = 0
  }, 60000)
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...')
  process.exit(0)
})

startBot()