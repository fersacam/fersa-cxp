const fs = require('fs');
const path = require('path');

const walk = dir => {
  fs.readdirSync(dir).forEach(file => {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (full.endsWith('.tsx') || full.endsWith('.ts') || full.endsWith('.jsx') || full.endsWith('.js')) {
      let content = fs.readFileSync(full, 'utf8');
      let originalContent = content;
      // Reemplazar \` por `
      content = content.replace(/\\\\`/g, '`').replace(/\\`/g, '`');
      // Reemplazar \$ por $
      content = content.replace(/\\\\\$/g, '$').replace(/\\\$/g, '$');
      if (content !== originalContent) {
        fs.writeFileSync(full, content);
        console.log(`Fixed ${full}`);
      }
    }
  })
};

walk('./src');
console.log('Done');
