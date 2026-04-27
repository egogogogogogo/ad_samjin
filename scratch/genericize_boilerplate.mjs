import fs from 'fs';
import path from 'path';

const targetDir = 'c:/Users/jmlee/Desktop/NEXT/Web service/jml-mes-boilerplate';

const replacements = [
    { from: /JML MES System/g, to: 'Generic MES System' },
    { from: /JML AX Solution/g, to: 'Global AX Solution' },
    { from: /samjin@jml.com/g, to: 'admin@company.com' },
    { from: /Samjin Gasket/g, to: 'Factory Name' },
    { from: /https:\/\/nupkhceajanwdphkqqtp.supabase.co/g, to: 'YOUR_SUPABASE_URL' },
    { from: /sb_publishable_TeIzwFwG1o41qDqeR4qpgg_MPpdV3Ag/g, to: 'YOUR_SUPABASE_ANON_KEY' }
];

function processDir(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file !== '.git' && file !== 'node_modules') {
                processDir(fullPath);
            }
        } else {
            const ext = path.extname(fullPath);
            if (['.html', '.js', '.css', '.md', '.json'].includes(ext)) {
                let content = fs.readFileSync(fullPath, 'utf8');
                let modified = false;
                replacements.forEach(r => {
                    if (r.from.test(content)) {
                        content = content.replace(r.from, r.to);
                        modified = true;
                    }
                });
                if (modified) {
                    fs.writeFileSync(fullPath, content, 'utf8');
                    console.log(`Updated: ${fullPath}`);
                }
            }
        }
    });
}

processDir(targetDir);

// Create a new README.md for the boilerplate
const readmeContent = `# Generic MES (Manufacturing Execution System) Boilerplate

This is a modern, Supabase-backed MES dashboard template based on the JML MES v10.0 architecture.

## 🚀 Key Features
- **Supabase Integration**: Real-time data sync and secure authentication.
- **Vercel Optimized**: Ready for instant deployment.
- **Premium UI**: Dark-themed, responsive dashboard using Chart.js.
- **Production Simulator**: Built-in capacity and bottleneck analysis tools.

## ⚙️ Setup Instructions
1. **Supabase**: Create a new project and update \`frontend/config.js\` with your URL and Anon Key.
2. **Database**: Run the provided SQL scripts (to be added) or set up tables: \`production_actuals\`, \`app_config\`, \`profiles\`.
3. **Deployment**: Push to GitHub and connect to Vercel (Set Root Directory to \`frontend\`).

## 📁 Structure
- \`frontend/\`: The main SPA application.
- \`docs/\`: Setup and architecture guidelines.
`;

fs.writeFileSync(path.join(targetDir, 'README.md'), readmeContent, 'utf8');
console.log('Created: README.md');
