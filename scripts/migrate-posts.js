/**
 * migrate-posts.js
 *
 * Reorganizes _posts/ so each post lives in its own dated folder:
 *   _posts/
 *     2018-01-23-norway-1/
 *       2018-01-23-norway-1.md   <- post markdown (relative image paths)
 *       Flag_of_Norway.svg
 *       norway_1_1.jpeg
 *       ...
 *     2025-12-25-christmas/
 *       2025-12-25-christmas.md
 *       (no images for this post)
 *     ...
 *
 * Usage:  node scripts/migrate-posts.js
 */

const fs = require('fs');
const path = require('path');

const postsDir = path.join(__dirname, '../_posts');

// Resolve where an /assets/img/X path currently lives on disk
// Strategy: check _posts/X first (which is where images were already being served from)
function resolveImgSrc(imgRef) {
  // imgRef is like "norway/Flag_of_Norway.svg" or "yukhoe.jpeg"
  const inPosts = path.join(postsDir, imgRef);
  if (fs.existsSync(inPosts)) return inPosts;

  // Fallback: old assets/img location (shouldn't usually hit this)
  const inAssets = path.join(__dirname, '../assets/img', imgRef);
  if (fs.existsSync(inAssets)) return inAssets;

  return null;
}

function migrate() {
  // Only process .md files directly inside _posts/ (not in subdirectories already)
  const files = fs.readdirSync(postsDir).filter(f => {
    if (!f.endsWith('.md') && !f.endsWith('.markdown')) return false;
    const stat = fs.statSync(path.join(postsDir, f));
    return stat.isFile();
  });

  console.log(`Found ${files.length} post files to migrate.\n`);

  for (const file of files) {
    const slug = file.replace(/\.(md|markdown)$/, '');
    const srcMdPath = path.join(postsDir, file);
    const targetDir = path.join(postsDir, slug);

    console.log(`--- Migrating: ${file} → ${slug}/`);

    // Read original content
    let content = fs.readFileSync(srcMdPath, 'utf-8');

    // Find all /assets/img/X image references
    const imgRefs = [...content.matchAll(/!\[.*?\]\(\/assets\/img\/([^)]+?)\)/g)].map(m => m[1]);
    const uniqueRefs = [...new Set(imgRefs)];

    // Create target folder
    fs.mkdirSync(targetDir, { recursive: true });

    // Copy images, build path replacement map
    const pathMap = {}; // "norway/Flag_of_Norway.svg" -> "Flag_of_Norway.svg"
    for (const imgRef of uniqueRefs) {
      const srcImg = resolveImgSrc(imgRef);
      if (!srcImg) {
        console.warn(`  ⚠  Image NOT found: /assets/img/${imgRef}`);
        continue;
      }
      const imgFilename = path.basename(imgRef);
      const destImg = path.join(targetDir, imgFilename);

      // Avoid overwriting if same filename from different dirs
      if (fs.existsSync(destImg)) {
        console.log(`  ~  Already exists, skipping copy: ${imgFilename}`);
      } else {
        fs.copyFileSync(srcImg, destImg);
        console.log(`  ✓  Copied: ${imgRef} → ${slug}/${imgFilename}`);
      }
      pathMap[imgRef] = imgFilename;
    }

    // Replace /assets/img/X with just the filename in the markdown content
    for (const [oldPath, newName] of Object.entries(pathMap)) {
      content = content.replaceAll(`/assets/img/${oldPath}`, newName);
    }

    // Write updated .md to new location
    const destMdPath = path.join(targetDir, file);
    fs.writeFileSync(destMdPath, content, 'utf-8');
    console.log(`  ✓  Wrote: ${slug}/${file}`);

    // Remove original .md from _posts/ root
    fs.unlinkSync(srcMdPath);
    console.log(`  ✓  Removed original: ${file}`);
    console.log('');
  }

  console.log('Migration complete!');
  console.log('Next step: node scripts/build-posts.js');
}

migrate();
