const gd = require("./game-data.js");
const scenes = gd.gameData.scenes;
const nextScenes = new Set();
const missing = [];

Object.entries(scenes).forEach(([key, s]) => {
    s.choices.forEach(c => {
        if (!scenes[c.next] && c.next !== "ending_victory" && !c.next.startsWith('ending')) {
            missing.push({ from: key, to: c.next });
        }
    });
});

if (missing.length > 0) {
    console.log("Missing scenes:");
    missing.forEach(m => console.log(`From ${m.from} to ${m.to}`));
} else {
    console.log("No missing scenes found.");
}
