'use strict';

const crypto = require('crypto');

const STYLES = ['uuid', 'random', 'words', 'emoji', 'invisible', 'original'];
const LINK_STYLES = STYLES.filter((style) => style !== 'original');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

const ADJECTIVES = (
  'agile amber ancient autumn bold brave breezy bright brisk bubbly calm candid cheerful chilly clever cloudy cosmic cozy crimson ' +
  'crisp curious daring dazzling dreamy dusty eager early electric emerald fancy fearless fluffy frosty fuzzy gentle giant gleaming ' +
  'glossy golden graceful grand happy hasty hidden humble icy indigo jolly jumpy kind lazy lively lucky lunar mellow merry mighty ' +
  'misty modest mossy nimble noble olive patient peaceful plucky polished proud quick quiet rapid rosy royal rusty sandy scarlet ' +
  'shiny silent silky silver sleepy slick smooth snowy solar sparkly speedy spicy spry steady stormy sturdy sunny swift tidy tiny ' +
  'tranquil twinkly velvet vivid wandering warm whimsical wild windy wise witty young zany zesty'
).split(' ');

const ANIMALS = (
  'albatross alpaca antelope badger beaver beetle bison bobcat buffalo butterfly camel capybara caribou cheetah chinchilla cobra ' +
  'cougar coyote crane cricket crow dingo dolphin donkey dove dragonfly duck eagle eel elk falcon ferret finch flamingo fox frog ' +
  'gazelle gecko gerbil gibbon giraffe goose gopher gorilla hamster hare hawk hedgehog heron hippo hornet horse hummingbird ibis ' +
  'iguana impala jackal jaguar jellyfish kangaroo kingfisher kiwi koala lemur leopard lion lizard llama lobster lynx macaw magpie ' +
  'manatee marmot meerkat mink mole moose narwhal newt ocelot octopus okapi orca otter owl panda panther parrot pelican penguin ' +
  'pigeon platypus puffin quail rabbit raccoon raven reindeer salamander seal shark sloth snail sparrow squid squirrel stork swan ' +
  'tapir tiger toucan turtle walrus weasel whale wolf wombat yak zebra'
).split(' ');

const NOUNS_DE = (
  'ahorn anker apfel ballon banane baumhaus berg birne blitz blume boot brezel brief brunnen buch burg dach drache eiche eimer ' +
  'eisberg eule fackel falke feder fenster fichte flamingo floss fuchs funke garten geige gipfel glocke gurke hafen hammer hase ' +
  'heft himmel hirsch honig hummel igel insel jacke kaktus kamel kastanie katze keks kerze kiesel kirsche kissen klee knopf koffer ' +
  'komet kompass krake krone kuchen laterne leuchtturm linde loewe lupe mantel marmor meise melone mond moewe muschel nebel ' +
  'nudel oase ofen orgel otter palme panda papagei pinguin pinsel pirat planet pudding quelle rabe rakete regen reh ritter ' +
  'roboter rose sandale schaukel schiff schnecke segel sessel sonne spatz spiegel stern strand stroh taler tanne teich tiger ' +
  'tinte trommel tulpe turm ufer uhr vogel vulkan wal wolke wuerfel zebra zelt zitrone zwerg'
).split(' ');

const EMOJI = Array.from(
  '🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🐔🐧🐦🐤🦆🦅🦉🦇🐺🐗🐴🦄🐝🐛🦋🐌🐞🐢🐍🦎🦖🦕🐙🦑🦐🦀🐡🐠🐟🐬🐳🦈🐊🐅🐆🦓🦍🐘🦛🦏🐪🦒🦘🐄🐎🐖🐑🦙🐐🦌🐕🐈🐓🦚🦜🦢🐇🦝🦔' +
    '🌵🎄🌲🌳🌴🌱🌿🍀🍃🍂🍁🍄🐚🌾🌷🌹🌺🌸🌼🌻🌞🌝🌛🌚🌕🌙🌎🪐💫⭐🌟✨⚡💥🔥🌈⛅🌊🍏🍎🍐🍊🍋🍌🍉🍇🍓🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🥕🌽🥐🍞🧀🍕🍔🍟🌭🍿🧁🍩🍪🎂🍫🍬🍭🍯☕🍵🎈🎉🎁🎨🎸🎺🎲🚀🛸⛵🚲🏰🗿💎🔮🧭⏰💡📚🔑🧩'
);

const INVISIBLE = ['​', '‌', '‍', '⁠'];
const INVISIBLE_LENGTH = 18;
const INVISIBLE_PATTERN = /^[​‌‍⁠]+$/;

const pick = (list) => list[crypto.randomInt(list.length)];

const randomString = (length = 8) => Array.from({ length }, () => pick(ALPHABET)).join('');

function asciiName(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

function originalSlug(original, extension) {
  const ext = String(extension || '').toLowerCase();
  const stem = asciiName(
    ext &&
      String(original || '')
        .toLowerCase()
        .endsWith(ext)
      ? String(original).slice(0, -ext.length)
      : original
  ).slice(0, 80);
  return stem ? `${stem}${ext}` : null;
}

function generate(style, { filename = '', original = '', extension = '', language = 'de', attempt = 0 } = {}) {
  switch (style) {
    case 'random':
      return randomString(8 + Math.floor(attempt / 3));
    case 'words': {
      const parts =
        language === 'en' ? [pick(ADJECTIVES), pick(ADJECTIVES), pick(ANIMALS)] : [pick(NOUNS_DE), pick(NOUNS_DE), pick(NOUNS_DE)];
      if (attempt >= 3) parts.push(String(crypto.randomInt(10, 100)));
      return parts.join('-');
    }
    case 'emoji':
      return Array.from({ length: 4 + Math.floor(attempt / 3) }, () => pick(EMOJI)).join('');
    case 'invisible':
      return Array.from({ length: INVISIBLE_LENGTH + 2 * Math.floor(attempt / 3) }, () => pick(INVISIBLE)).join('');
    case 'original': {
      const base = originalSlug(original, extension);
      if (!base) return randomString(8);
      if (attempt === 0) return base;
      const ext = String(extension || '').toLowerCase();
      const stem = ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
      return `${stem}-${attempt < 5 ? attempt + 1 : randomString(4)}${ext}`;
    }
    default:
      return attempt === 0 && filename ? filename : `${crypto.randomUUID()}${extension || ''}`;
  }
}

async function unique(style, options, exists) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const slug = generate(style, { ...options, attempt });
    if (slug && !(await exists(slug))) return slug;
  }
  throw new Error('Es konnte keine freie Adresse erzeugt werden.');
}

const isSlug = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 255 &&
  !/[\/\\\u0000-\u001f\u007f]/.test(value) &&
  value !== '.' &&
  value !== '..';

const displayPath = (slug) => String(slug).replace(/[%?#\s"<>\\^`{|}]/g, (char) => encodeURIComponent(char));

const isInvisible = (slug) => INVISIBLE_PATTERN.test(slug);

module.exports = { STYLES, LINK_STYLES, generate, unique, randomString, isSlug, isInvisible, displayPath, originalSlug };
