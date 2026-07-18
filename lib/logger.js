const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.LOG_DIR
    ? path.resolve(process.env.LOG_DIR)
    : path.join(__dirname, '..', 'logs');

if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

const isTTY = process.stdout.isTTY;

const C = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
    bold: '\x1b[1m',
};

const LEVELS = {
    INFO:  { label: 'INFO',  color: C.green },
    WARN:  { label: 'WARN',  color: C.yellow },
    ERROR: { label: 'ERROR', color: C.red },
    DEBUG: { label: 'DEBUG', color: C.gray },
};

function ts() {
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    return `${date} ${time}`;
}

function write(levelName, msg) {
    const lvl = LEVELS[levelName] || { label: levelName, color: C.reset };
    const tsStr = ts();
    const paddedLevel = lvl.label.padEnd(5);

    const consoleLine = isTTY
        ? `${C.dim}[${tsStr}]${C.reset} ${lvl.color}[${paddedLevel}]${C.reset} ${msg}\n`
        : `[${tsStr}] [${paddedLevel}] ${msg}\n`;

    process.stdout.write(consoleLine);

    const fileLine = `[${tsStr}] [${paddedLevel}] ${msg}\n`;
    const logFile = path.join(LOG_DIR, `${tsStr.slice(0, 10)}.log`);
    fs.appendFileSync(logFile, fileLine);
}

module.exports = {
    info:  (msg) => write('INFO',  msg),
    warn:  (msg) => write('WARN',  msg),
    error: (msg) => write('ERROR', msg),
    debug: (msg) => { if (process.env.DEBUG) write('DEBUG', msg); },
    C,
};
