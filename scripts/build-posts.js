const fs = require('fs');
const path = require('path');

const postsDir = path.join(__dirname, '../_posts');
const outputFile = path.join(__dirname, '../posts.json');

function parseFrontMatter(fileContent) {
  const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) {
    return { metadata: {}, content: fileContent };
  }
  const yamlSection = match[1];
  const content = fileContent.slice(match[0].length);
  
  const metadata = {};
  const lines = yamlSection.split('\n');
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    
    // Split by first colon
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    
    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();
    
    // Remove inline comments starting with '#' (e.g. tags: [bottomsurgery] # TAG names...)
    const commentIndex = value.indexOf('#');
    if (commentIndex !== -1) {
      value = value.slice(0, commentIndex).trim();
    }
    
    // Parse arrays like [Transition] or [bottomsurgery]
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(item => item.trim().replace(/^["']|["']$/g, ''));
    } else {
      // Remove surrounding quotes if any
      value = value.replace(/^["']|["']$/g, '');
    }
    
    metadata[key] = value;
  }
  
  return { metadata, content };
}

/**
 * Collect all .md files from _posts/type/.
 * Supports both root-level files and per-post folders.
 */
function collectMdFilesForType(type) {
  const typeDir = path.join(postsDir, type);
  if (!fs.existsSync(typeDir)) return [];

  const results = [];
  const entries = fs.readdirSync(typeDir);

  for (const entry of entries) {
    const entryPath = path.join(typeDir, entry);
    const stat = fs.statSync(entryPath);

    if (stat.isFile() && (entry.endsWith('.md') || entry.endsWith('.markdown'))) {
      results.push({
        filePath: entryPath,
        folder: type,
        type: type
      });
    } else if (stat.isDirectory()) {
      const subFiles = fs.readdirSync(entryPath).filter(f => f.endsWith('.md') || f.endsWith('.markdown'));
      for (const subFile of subFiles) {
        results.push({
          filePath: path.join(entryPath, subFile),
          folder: `${type}/${entry}`,
          type: type
        });
      }
    }
  }
  return results;
}

function build() {
  if (!fs.existsSync(postsDir)) {
    console.error('_posts directory not found');
    return;
  }
  
  const mdFiles = [
    ...collectMdFilesForType('diary'),
    ...collectMdFilesForType('study')
  ];
  const posts = [];
  
  for (const { filePath, folder, type } of mdFiles) {
    const file = path.basename(filePath);
    if (file === '.placeholder') continue;

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const { metadata, content } = parseFrontMatter(fileContent);
    
    // Extract date from filename if not in metadata, e.g. 2025-12-18-grs.md -> 2025-12-18
    const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
    const fileDate = dateMatch ? dateMatch[1] : '';
    
    posts.push({
      filename: file,
      folder: folder,   // relative folder name within _posts, e.g. "diary/2018-01-23-norway-1"
      type: type,       // 'diary' or 'study'
      title: metadata.title || file.replace(/\.md$/, ''),
      subtitle: metadata.subtitle || '',
      date: metadata.date || fileDate,
      categories: metadata.categories || [],
      tags: metadata.tags || [],
      content: content
    });
  }
  
  // Sort posts by date descending
  posts.sort((a, b) => {
    const getCleanDate = (dateStr) => {
      if (!dateStr) return new Date(0);
      const clean = dateStr.split(' ')[0];
      return new Date(clean);
    };
    return getCleanDate(b.date) - getCleanDate(a.date);
  });
  
  fs.writeFileSync(outputFile, JSON.stringify(posts, null, 2), 'utf-8');
  console.log(`Successfully generated ${posts.length} posts inside posts.json`);
}

build();

if (process.argv.includes('--watch') || process.argv.includes('-w')) {
  console.log(`Watching for changes in ${postsDir}...`);
  let debounceTimeout;
  try {
    fs.watch(postsDir, { recursive: true }, (eventType, filename) => {
      if (filename) {
        if (filename.startsWith('.') || filename.endsWith('~')) return;
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
          console.log(`Change detected in ${filename}. Rebuilding posts.json...`);
          try {
            build();
          } catch (e) {
            console.error('Rebuild failed:', e);
          }
        }, 150);
      }
    });
  } catch (err) {
    console.error('Failed to start folder watch:', err);
  }
}
