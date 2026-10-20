'use strict';

const { encode } = require('uqr');

function qrSvg(text, { quietZone = 3 } = {}) {
  const { data, size } = encode(text, { ecc: 'M', border: 0 });
  let path = '';
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (!data[y][x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < size && data[y][x]) x += 1;
      path += `M${start} ${y}h${x - start}v1h-${x - start}z`;
    }
  }
  const total = size + quietZone * 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-quietZone} ${-quietZone} ${total} ${total}" shape-rendering="crispEdges" role="img">` +
    `<rect x="${-quietZone}" y="${-quietZone}" width="${total}" height="${total}" fill="#ffffff"/>` +
    `<path d="${path}" fill="#000000"/></svg>`
  );
}

module.exports = { qrSvg };
