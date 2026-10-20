'use strict';

const text = (value, max = 500) => (typeof value === 'string' ? value.slice(0, max) : '');

const integer = (value) => {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) ? number : null;
};

const flag = (value, fallback = true) =>
  value === undefined ? fallback : value !== false && value !== 'false' && value !== 0 && value !== '0';

module.exports = { text, integer, flag };
