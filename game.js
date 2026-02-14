const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scanEl = document.getElementById('scan-count');
const bestEl = document.getElementById('best-count');

const ASSET_PATH = 'tiles/';

// --- ALL BIOMES (all terrain types) ---
const BIOMES = {
    GRASS:  { tile: 'tileGrass.png', props: ['treeGreen_high.png', 'treeGreen_mid.png', 'treeGreen_low.png', 'flowerRed.png', 'flowerGreen.png', 'bushGrass.png', 'hillGrass.png', 'smallRockGrass.png'] },
    SNOW:   { tile: 'tileSnow.png', props: ['pineBlue_high.png', 'pineBlue_mid.png', 'pineBlue_low.png', 'rockSnow_1.png', 'rockSnow_2.png', 'rockSnow_3.png', 'hillSnow.png', 'smallRockSnow.png', 'bushSnow.png'] },
    SAND:   { tile: 'tileSand.png', props: ['treeCactus_1.png', 'treeCactus_2.png', 'treeCactus_3.png', 'hillSand.png', 'bushSand.png', 'smallRockDirt.png'] },
    AUTUMN: { tile: 'tileAutumn.png', props: ['treeAutumn_high.png', 'treeAutumn_mid.png', 'treeAutumn_low.png', 'pineAutumn_high.png', 'pineAutumn_mid.png', 'pineAutumn_low.png', 'bushAutumn.png', 'hillAutumn.png', 'flowerYellow.png'] },
    MAGIC:  { tile: 'tileMagic.png', props: ['hillMagic.png', 'bushMagic.png', 'flowerBlue.png', 'flowerWhite.png'] },
    LAVA:   { tile: 'tileLava.png', props: ['waveLava.png', 'rockStone.png', 'tileLava_tile.png'] },
    ROCK:   { tile: 'tileRock.png', props: ['rockStone_moss1.png', 'rockStone_moss2.png', 'rockStone_moss3.png', 'rockDirt.png', 'rockDirt_moss1.png', 'rockDirt_moss2.png', 'rockDirt_moss3.png', 'smallRockStone.png', 'hillDirt.png'] },
    DIRT:   { tile: 'tileDirt.png', props: ['bushDirt.png', 'hillDirt.png', 'rockDirt.png', 'rockDirt_moss1.png', 'rockDirt_moss2.png', 'rockDirt_moss3.png', 'smallRockDirt.png'] },
    STONE:  { tile: 'tileStone.png', props: ['rockStone.png', 'rockStone_moss1.png', 'rockStone_moss2.png', 'rockStone_moss3.png', 'smallRockStone.png'] },
    WATER:  { tile: 'tileWater.png', props: ['waveWater.png'] }
};

const ALIENS = ['alienBeige.png', 'alienBlue.png', 'alienGreen.png', 'alienPink.png', 'alienYellow.png'];

let images = {};
let grid = [];
let targetHex = null;
let lastDist = null;
let gameActive = true;
let currentAlien = ALIENS[0];
let scans = 0;
let bestScans = Infinity;
let bestAdjustedScore = Infinity;  // scans / diameter, lower is better
let bestLevel = 0;
let currentLevel = 1;
let currentHexRadius = 2;  // For best-score normalization
let confetti = [];
let maxHexDist = 4;  // Max axial distance for color scaling (updated per level)
const MAX_LEVEL = 8;  // Slower growth: L1-2 r=2, L3-4 r=3, L5-6 r=4, L7-8 r=5

// Camera: zoom & pan for adaptive viewport (mouse wheel, pinch, drag)
let cameraZoom = 1;
let cameraX = 0;
let cameraY = 0;
let isDragging = false;
let lastMouseX = 0, lastMouseY = 0;
let lastPinchDist = 0;
let lastPinchCenter = { x: 0, y: 0 };
let touches = {};
let didDrag = false;
let dragStartX = 0, dragStartY = 0;
let didTouchPan = false;
let touchStartX = 0, touchStartY = 0;
const HEX_SIZE = 37;  // Tighter spacing for denser grid
// Tile size: +1 to eliminate thin gaps between adjacent hexes (floor truncation)
const TILE_W = Math.floor(HEX_SIZE * Math.sqrt(3)) + 1;   // ~65
const TILE_H = HEX_SIZE * 2 + 1;                          // ~75

// 1. Asset Preloader
async function loadAssets() {
    const allFiles = [...new Set([...Object.values(BIOMES).flatMap(b => [b.tile, ...b.props]), ...ALIENS])];
    const promises = allFiles.map(file => {
        return new Promise(res => {
            const img = new Image();
            img.src = ASSET_PATH + file;
            img.onload = () => { images[file] = img; res(); };
            img.onerror = () => { console.warn("Missing asset:", file); res(); };
        });
    });
    await Promise.all(promises);
    initGame();
}

// 2. Game Setup
function initGame(advanceLevel = false) {
    if (advanceLevel && !gameActive) {
        currentLevel = Math.min(currentLevel + 1, MAX_LEVEL);
    }
    // Slower map growth: level 1→2 radius 2, level 3→4 radius 3, level 5→6 radius 4
    const hexRadius = 2 + Math.floor(currentLevel * 0.5);
    currentHexRadius = hexRadius;
    maxHexDist = hexRadius * 2;  // Max axial distance for warmer/colder shading

    grid = [];
    confetti = [];
    gameActive = true;
    lastDist = null;
    scans = 0;
    scanEl.innerText = scans;
    bestEl.innerText = bestAdjustedScore === Infinity ? "--" : `${bestScans} (L${bestLevel})`;
    currentAlien = ALIENS[Math.floor(Math.random() * ALIENS.length)];
    document.getElementById('message').innerText = "FIND THE ALIEN!";
    document.getElementById('message').style.color = "white";
    document.getElementById('level').innerText = currentLevel;
    document.getElementById('newMissionBtn').innerText = "✨ New Mission";

    // Biome count scales with level: small maps = 1-2 biomes, large = more
    const biomeKeys = Object.keys(BIOMES);
    const numBiomes = Math.max(1, Math.min(currentLevel + 1, biomeKeys.length));
    const shuffled = [...biomeKeys].sort(() => Math.random() - 0.5);
    const selectedBiomes = shuffled.slice(0, numBiomes);

    const seeds = selectedBiomes.map(key => ({
        key,
        q: (Math.random() * hexRadius * 2) - hexRadius,
        r: (Math.random() * hexRadius * 2) - hexRadius
    }));

    for (let q = -hexRadius; q <= hexRadius; q++) {
        for (let r = Math.max(-hexRadius, -q - hexRadius); r <= Math.min(hexRadius, -q + hexRadius); r++) {

            let closestKey = 'GRASS';
            let minDist = Infinity;
            seeds.forEach(s => {
                let d = (Math.abs(q - s.q) + Math.abs(q + r - s.q - s.r) + Math.abs(r - s.r)) / 2;
                if (d < minDist) { minDist = d; closestKey = s.key; }
            });

            const biome = BIOMES[closestKey];
            const prop = Math.random() > 0.55 ? biome.props[Math.floor(Math.random() * biome.props.length)] : null;

            grid.push({ q, r, tile: biome.tile, prop, clicked: false });
        }
    }

    targetHex = grid[Math.floor(Math.random() * grid.length)];
    resize();  // Set canvas size first
    fitZoomToScreen();
    draw();
}

// Hex to pixel (flat-top axial coordinates) - returns world-space coords
function hexToPixel(q, r) {
    return {
        x: canvas.width / 2 + HEX_SIZE * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r),
        y: canvas.height / 2 + HEX_SIZE * (3 / 2 * r)
    };
}

// Screen coords -> world coords (for click detection with camera transform)
function screenToWorld(sx, sy) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    return {
        x: (sx - cx - cameraX) / cameraZoom + cx,
        y: (sy - cy - cameraY) / cameraZoom + cy
    };
}

// Compute grid bounds: flat-top hex extent = HEX_SIZE horiz, HEX_SIZE*sqrt3/2 vert
function getGridBounds() {
    if (grid.length === 0) return { w: 400, h: 400 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const hexW = HEX_SIZE;
    const hexH = HEX_SIZE * Math.sqrt(3) / 2;
    grid.forEach(hex => {
        const { x, y } = hexToPixel(hex.q, hex.r);
        minX = Math.min(minX, x - hexW);
        maxX = Math.max(maxX, x + hexW);
        minY = Math.min(minY, y - hexH);
        maxY = Math.max(maxY, y + hexH);
    });
    return { w: maxX - minX, h: maxY - minY, minX, minY, maxX, maxY };
}

function fitZoomToScreen() {
    const bounds = getGridBounds();
    const padding = 50;
    const scaleX = (canvas.width - padding) / bounds.w;
    const scaleY = (canvas.height - padding) / bounds.h;
    cameraZoom = Math.min(1.2, Math.max(0.35, Math.min(scaleX, scaleY)));
    cameraX = 0;
    cameraY = 0;
}

// 3. Rendering Logic
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    grid.sort((a, b) => (a.r - b.r) || (a.q - b.q)); // Painter's Sort: row first, then column

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.save();
    ctx.translate(cx + cameraX, cy + cameraY);
    ctx.scale(cameraZoom, cameraZoom);
    ctx.translate(-cx, -cy);

    grid.forEach(hex => {
        const { x, y } = hexToPixel(hex.q, hex.r);

        // Draw Base Tile (scaled to fill hex cell, centered at x,y)
        if (images[hex.tile]) {
            ctx.drawImage(images[hex.tile], x - TILE_W/2, y - TILE_H/2, TILE_W, TILE_H);
        }

        // Draw Prop: base on isometric tile's front surface, scaled to match tile
        if (hex.prop && images[hex.prop]) {
            const propImg = images[hex.prop];
            const tileImg = images[hex.tile];
            const scaleX = tileImg ? TILE_W / tileImg.width : 1.85;
            const scaleY = tileImg ? TILE_H / tileImg.height : 1.57;
            const pw = propImg.width * scaleX;
            const ph = propImg.height * scaleY;
            // Front of isometric top face; hills/flat props sit lower on the tile
            const surfaceY = hex.prop.includes('hill') ? y - TILE_H * 0.05 : y - TILE_H * 0.12;
            // Kenney sprite padding: trees/bushes +18, small rocks/hills +12, big rocks need extra +6
            const isHillOrRock = hex.prop.includes('hill') || hex.prop.includes('rock');
            const isBigRock = hex.prop.includes('rock') && !hex.prop.includes('smallRock');
            const padOffset = 18 + (isHillOrRock ? 12 : 0) + (isBigRock ? 6 : 0);
            const dx = x - pw / 2;
            const dy = surfaceY - ph + padOffset;
            ctx.drawImage(propImg, 0, 0, propImg.width, propImg.height, dx, dy, pw, ph);
        }

        // Shade scanned tiles: reddish (warmer) vs bluish (colder) based on distance to alien
        // Uses hex-shaped mask; winning tile stays unshaded so alien stays visible
        if (hex.clicked && (gameActive || hex !== targetHex) && hex.distToTarget != null) {
            drawHexMask(x, y - TILE_H * 0.15, hex.distToTarget);
        }

        // Alien reveal (when found or game over)
        if (hex === targetHex && (hex.clicked || !gameActive)) {
            const aw = TILE_W * 0.9;
            const ah = TILE_H * 1.1;
            const wiggle = !gameActive ? Math.sin(Date.now() / 80) * 4 : 0;
            ctx.drawImage(images[currentAlien], x - aw/2 + wiggle, y - ah, aw, ah);
        }
    });

    ctx.restore();

    // Confetti overlay when mission success (screen space)
    confetti.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15;
        p.rotation += p.rotSpeed;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
    });
    confetti = confetti.filter(p => p.y < canvas.height + 20);

    if (!gameActive) requestAnimationFrame(draw);
}

// Draws an isometric hexagon overlay: squashed Y so it lies on the tile's top surface
function drawHexMask(x, y, distToTarget) {
    const r = HEX_SIZE;  // Full size to cover the tile surface
    const isoY = 0.78;  // Light vertical squash for isometric (less compressed)
    // t: 0 = warm (red), 1 = cold (blue); dist 1 = warmest wrong, maxHexDist = coldest
    const t = Math.min(1, Math.max(0, (distToTarget - 1) / Math.max(1, maxHexDist - 1)));
    const red = Math.round(255 - t * 205);   // Strong red when warm
    const green = Math.round(60 - t * 60);   // Low green for vivid red/blue
    const blue = Math.round(60 + t * 195);   // Strong blue when cold
    ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, 0.6)`;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i + Math.PI / 6;
        const hx = x + r * Math.cos(angle);
        const hy = y + (r * isoY) * Math.sin(angle);
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.fill();
}

// 4. Input Handling
canvas.addEventListener('click', (e) => {
    if (!gameActive) return;
    if (didDrag) { didDrag = false; return; }  // Ignore click if we were mouse-dragging
    if (didTouchPan) { didTouchPan = false; return; }  // Ignore click if we were touch-panning

    const rect = canvas.getBoundingClientRect();
    const screenX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const screenY = (e.clientY - rect.top) * (canvas.height / rect.height);
    const { x: cx, y: cy } = screenToWorld(screenX, screenY);

    let clickedHex = null;
    let minDist = Math.min(40, TILE_W * 0.6);
    grid.forEach(hex => {
        const { x, y } = hexToPixel(hex.q, hex.r);
        const d = Math.hypot(x - cx, y - cy);
        if (d < minDist) { minDist = d; clickedHex = hex; }
    });

    if (clickedHex && !clickedHex.clicked) {
        clickedHex.clicked = true;
        scans++;
        scanEl.innerText = scans;

        const dist = (Math.abs(clickedHex.q - targetHex.q) + Math.abs(clickedHex.q + clickedHex.r - targetHex.q - targetHex.r) + Math.abs(clickedHex.r - targetHex.r)) / 2;
        clickedHex.distToTarget = dist;

        if (dist === 0) {
            handleWin();
            draw();  // Redraw immediately so alien appears on correct click
        } else {
            if (lastDist !== null) {
                const msg = document.getElementById('message');
                if (dist < lastDist) {
                    msg.innerText = "GETTING WARMER! 🔥";
                    msg.style.color = "#fbbf24";
                } else if (dist > lastDist) {
                    msg.innerText = "GETTING COLDER... ❄️";
                    msg.style.color = "#60a5fa";
                }
            }
            lastDist = dist;
        }
        draw();
    }
});

function spawnConfetti() {
    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];
    const cx = canvas.width / 2;
    for (let i = 0; i < 70; i++) {
        confetti.push({
            x: cx + (Math.random() - 0.5) * canvas.width * 0.8,
            y: canvas.height * 0.2 + Math.random() * 80,
            vx: (Math.random() - 0.5) * 6,
            vy: Math.random() * 4 + 2,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: 8 + Math.random() * 10,
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.3
        });
    }
}

function handleWin() {
    gameActive = false;
    spawnConfetti();
    const msg = document.getElementById('message');
    msg.innerText = "MISSION SUCCESS!";
    msg.style.color = "#4ade80";

    const diameter = 2 * currentHexRadius;
    const adjustedScore = scans / diameter;
    if (adjustedScore < bestAdjustedScore) {
        bestAdjustedScore = adjustedScore;
        bestScans = scans;
        bestLevel = currentLevel;
        bestEl.innerText = `${bestScans} (L${bestLevel})`;
    }

    const btn = document.getElementById('newMissionBtn');
    btn.innerText = currentLevel < MAX_LEVEL ? "✨ Next Mission" : "✨ New Mission";
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    draw();
}

// Mouse wheel: zoom toward cursor
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const screenX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const screenY = (e.clientY - rect.top) * (canvas.height / rect.height);
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const wx = (screenX - cx - cameraX) / cameraZoom + cx;
    const wy = (screenY - cy - cameraY) / cameraZoom + cy;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(2.5, Math.max(0.25, cameraZoom * factor));
    cameraX = screenX - cx - (wx - cx) * newZoom;
    cameraY = screenY - cy - (wy - cy) * newZoom;
    cameraZoom = newZoom;
    draw();
}, { passive: false });

// Mouse drag: pan
canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    didDrag = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
});
canvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    if (Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY) > 8) didDrag = true;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
    cameraX += (e.clientX - lastMouseX) * scaleX;
    cameraY += (e.clientY - lastMouseY) * scaleY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    draw();
});
canvas.addEventListener('mouseup', () => { isDragging = false; });
canvas.addEventListener('mouseleave', () => { isDragging = false; });

// Touch: pinch zoom + one/two-finger pan
function getTouchCenter(touchesList) {
    const t = Array.from(touchesList);
    return {
        x: t.reduce((s, p) => s + p.clientX, 0) / t.length,
        y: t.reduce((s, p) => s + p.clientY, 0) / t.length
    };
}
function getTouchDist(touchesList) {
    const t = Array.from(touchesList);
    if (t.length < 2) return 0;
    return Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);
}
let lastTouchCenter = { x: 0, y: 0 };
canvas.addEventListener('touchstart', (e) => {
    didTouchPan = false;
    lastTouchCenter = getTouchCenter(e.touches);
    touchStartX = lastTouchCenter.x;
    touchStartY = lastTouchCenter.y;
    if (e.touches.length >= 2) {
        e.preventDefault();
        lastPinchDist = getTouchDist(e.touches);
        lastPinchCenter = lastTouchCenter;
    }
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
    if (e.touches.length >= 2) {
        e.preventDefault();
        const dist = getTouchDist(e.touches);
        const center = getTouchCenter(e.touches);
        const factor = dist / lastPinchDist;
        cameraZoom = Math.min(2.5, Math.max(0.25, cameraZoom * factor));
        cameraX += (center.x - lastPinchCenter.x) * scaleX;
        cameraY += (center.y - lastPinchCenter.y) * scaleY;
        lastPinchDist = dist;
        lastPinchCenter = center;
    } else if (e.touches.length === 1) {
        e.preventDefault();
        const center = getTouchCenter(e.touches);
        if (Math.hypot(center.x - touchStartX, center.y - touchStartY) > 10) didTouchPan = true;
        cameraX += (center.x - lastTouchCenter.x) * scaleX;
        cameraY += (center.y - lastTouchCenter.y) * scaleY;
        lastTouchCenter = center;
    }
    if (e.touches.length >= 1) draw();
}, { passive: false });
canvas.addEventListener('touchend', (e) => {
    if (e.touches.length > 0) lastTouchCenter = getTouchCenter(e.touches);
});

window.addEventListener('resize', resize);
loadAssets();
