const { execSync } = require('child_process');

console.log('Running postinstall script...');

if (process.env.RENDER === 'true') {
  console.log('Render environment detected. Installing whatsapp-relay dependencies...');
  try {
    execSync('npm install', { cwd: 'whatsapp-relay', stdio: 'inherit' });
    console.log('whatsapp-relay dependencies installed successfully.');
    
    console.log('Installing headless Chrome for Puppeteer...');
    execSync('npx puppeteer browsers install chrome', { cwd: 'whatsapp-relay', stdio: 'inherit' });
    console.log('Headless Chrome installed successfully.');
  } catch (err) {
    console.error('Failed to install whatsapp-relay dependencies/Chrome:', err.message);
    process.exit(1);
  }
} else {
  console.log('Local environment detected. Installing Electron app dependencies...');
  try {
    execSync('npx electron-builder install-app-deps', { stdio: 'inherit' });
    console.log('Electron app dependencies installed successfully.');
  } catch (err) {
    console.warn('Electron app dependencies install warned/failed:', err.message);
  }
}
