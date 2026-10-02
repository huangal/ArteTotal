// Startup file for Passenger (cPanel "Setup Node.js App"), which loads it with require().
// On Node 18, require() can't load ES modules, so this imports the server instead.
import('./server/index.js').catch((err) => {
  console.error(err)
  process.exit(1)
})
