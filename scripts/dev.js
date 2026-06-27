const { spawn } = require('child_process');

console.log('Starting development environment...');

// 1. Run build-posts in watch mode
const watcher = spawn('node', ['scripts/build-posts.js', '--watch'], { stdio: 'inherit' });

// 2. Run http-server
const server = spawn('npx', ['http-server', './', '-p', '8085', '-c-1'], { stdio: 'inherit', shell: true });

process.on('SIGINT', () => {
  watcher.kill();
  server.kill();
  process.exit();
});
