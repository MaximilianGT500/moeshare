'use strict';

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'assets', 'fonts');
const FILE = path.join(DIR, 'Inter-SemiBold.otf');
const NAME = 'Inter SemiBold';

if (process.platform === 'linux' && !process.env.FONTCONFIG_FILE && !fs.existsSync('/etc/fonts/fonts.conf')) {
  process.env.FONTCONFIG_FILE = path.join(DIR, 'fonts.conf');
}

module.exports = { FILE, NAME };
