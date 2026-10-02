// Startup file. Hosts such as iisnode (Windows/IIS) and Passenger load it with require(),
// which can't load ES modules on Node 18, so this imports the server instead.
import('./server/index.js').catch((err) => {
  console.error(err)
  process.exit(1)
})
