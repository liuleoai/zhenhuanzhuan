const fs = require('fs');
const content = fs.readFileSync('./game-data.js', 'utf8');
// Simple regex to find scenes and their next links
const sceneRegex = /scene\w+(?=: {)/g;
const nextRegex = /next: "(\w+)"/g;

const scenes = new Set();
let match;
while ((match = sceneRegex.exec(content)) !== null) {
    scenes.add(match[0]);
}

const missing = [];
while ((match = nextRegex.exec(content)) !== null) {
    const target = match[1];
    if (!scenes.has(target) && target !== "ending_victory" && !target.startsWith('ending')) {
        missing.push(target);
    }
}

if (missing.length > 0) {
    console.log("Potential missing scenes (check false positives):", [...new Set(missing)]);
} else {
    console.log("No missing scenes found.");
}
