require('dotenv').config();
const fs = require('fs');
const path = require('path');
const app = require('./src/app');

const PORT = process.env.PORT || 5000;

// Ensure local storage & backup directories exist
const storageDir = path.resolve(process.env.LOCAL_STORAGE_PATH || './storage');
const backupDir = path.resolve(process.env.LOCAL_BACKUP_PATH || './backups');
fs.mkdirSync(storageDir, { recursive: true });
fs.mkdirSync(backupDir, { recursive: true });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Central Backend running on http://localhost:${PORT}`);
});
