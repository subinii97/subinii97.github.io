const fs = require('fs');
const path = require('path');

const postsDir = path.join(__dirname, '../_posts');

function renameFolders() {
  if (!fs.existsSync(postsDir)) {
    console.error('_posts directory not found');
    return;
  }

  const entries = fs.readdirSync(postsDir);
  console.log(`Scanning entries in _posts/...\n`);

  for (const entry of entries) {
    const entryPath = path.join(postsDir, entry);
    const stat = fs.statSync(entryPath);

    if (stat.isDirectory()) {
      // Check if directory matches YYYY-MM-DD-slug
      const dateMatch = entry.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
      if (dateMatch) {
        const newName = dateMatch[1]; // YYYY-MM-DD
        const targetPath = path.join(postsDir, newName);

        if (fs.existsSync(targetPath)) {
          console.warn(`⚠ Collision: ${newName} already exists, skipping ${entry}`);
        } else {
          fs.renameSync(entryPath, targetPath);
          console.log(`✓ Renamed: ${entry} → ${newName}`);
        }
      } else {
        console.log(`- Skipped: ${entry} (does not match YYYY-MM-DD-slug pattern)`);
      }
    }
  }

  console.log('\nFolder renaming completed!');
}

renameFolders();
