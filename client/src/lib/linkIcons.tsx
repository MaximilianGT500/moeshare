import { useEffect, useState, type ComponentType } from 'react';
import Box from '@mui/material/Box';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import ArticleRounded from '@mui/icons-material/ArticleRounded';
import BrushRounded from '@mui/icons-material/BrushRounded';
import CardGiftcardRounded from '@mui/icons-material/CardGiftcardRounded';
import ChatBubbleOutlineRounded from '@mui/icons-material/ChatBubbleOutlineRounded';
import CloudRounded from '@mui/icons-material/CloudRounded';
import CodeRounded from '@mui/icons-material/CodeRounded';
import CollectionsRounded from '@mui/icons-material/CollectionsRounded';
import ConfirmationNumberRounded from '@mui/icons-material/ConfirmationNumberRounded';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import EventRounded from '@mui/icons-material/EventRounded';
import FavoriteRounded from '@mui/icons-material/FavoriteRounded';
import FitnessCenterRounded from '@mui/icons-material/FitnessCenterRounded';
import FlightRounded from '@mui/icons-material/FlightRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import HeadphonesRounded from '@mui/icons-material/HeadphonesRounded';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import HomeRounded from '@mui/icons-material/HomeRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import KeyRounded from '@mui/icons-material/KeyRounded';
import LanguageRounded from '@mui/icons-material/LanguageRounded';
import LightbulbRounded from '@mui/icons-material/LightbulbRounded';
import LinkRounded from '@mui/icons-material/LinkRounded';
import LocalCafeRounded from '@mui/icons-material/LocalCafeRounded';
import MailOutlineRounded from '@mui/icons-material/MailOutlineRounded';
import MarkEmailUnreadRounded from '@mui/icons-material/MarkEmailUnreadRounded';
import MenuBookRounded from '@mui/icons-material/MenuBookRounded';
import MicRounded from '@mui/icons-material/MicRounded';
import MovieRounded from '@mui/icons-material/MovieRounded';
import MusicNoteRounded from '@mui/icons-material/MusicNoteRounded';
import NewspaperRounded from '@mui/icons-material/NewspaperRounded';
import PaletteRounded from '@mui/icons-material/PaletteRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import PetsRounded from '@mui/icons-material/PetsRounded';
import PhoneRounded from '@mui/icons-material/PhoneRounded';
import PhotoCameraRounded from '@mui/icons-material/PhotoCameraRounded';
import PlaceRounded from '@mui/icons-material/PlaceRounded';
import PlayCircleRounded from '@mui/icons-material/PlayCircleRounded';
import PodcastsRounded from '@mui/icons-material/PodcastsRounded';
import RestaurantRounded from '@mui/icons-material/RestaurantRounded';
import RocketLaunchRounded from '@mui/icons-material/RocketLaunchRounded';
import RssFeedRounded from '@mui/icons-material/RssFeedRounded';
import SchoolRounded from '@mui/icons-material/SchoolRounded';
import SensorsRounded from '@mui/icons-material/SensorsRounded';
import ShoppingCartRounded from '@mui/icons-material/ShoppingCartRounded';
import SportsEsportsRounded from '@mui/icons-material/SportsEsportsRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import StorefrontRounded from '@mui/icons-material/StorefrontRounded';
import VolunteerActivismRounded from '@mui/icons-material/VolunteerActivismRounded';
import WorkRounded from '@mui/icons-material/WorkRounded';
import { t } from './i18n';

export interface GeneralIcon {
  key: string;
  label: string;
  keywords: string;
  Icon: ComponentType<SvgIconProps>;
}

export type BrandGroup = 'social' | 'chat' | 'video' | 'music' | 'games' | 'creative' | 'code' | 'writing' | 'support' | 'apps';

export interface BrandIcon {
  slug: string;
  title: string;
  group: BrandGroup;
  domains: string[];
}

export const GENERAL_ICONS: GeneralIcon[] = [
  { key: 'website', label: t('Website'), keywords: 'web internet homepage seite', Icon: LanguageRounded },
  { key: 'link', label: t('Link'), keywords: 'url adresse', Icon: LinkRounded },
  { key: 'mail', label: t('E-Mail'), keywords: 'mail email kontakt', Icon: MailOutlineRounded },
  { key: 'phone', label: t('Telefon'), keywords: 'anrufen nummer handy', Icon: PhoneRounded },
  { key: 'chat', label: t('Chat'), keywords: 'nachricht schreiben', Icon: ChatBubbleOutlineRounded },
  { key: 'shop', label: t('Shop'), keywords: 'laden kaufen store', Icon: StorefrontRounded },
  { key: 'cart', label: t('Warenkorb'), keywords: 'kaufen bestellen', Icon: ShoppingCartRounded },
  { key: 'blog', label: t('Blog'), keywords: 'artikel beitrag', Icon: ArticleRounded },
  { key: 'news', label: t('Neuigkeiten'), keywords: 'news zeitung', Icon: NewspaperRounded },
  { key: 'newsletter', label: t('Newsletter'), keywords: 'mail abonnieren', Icon: MarkEmailUnreadRounded },
  { key: 'rss', label: t('RSS-Feed'), keywords: 'feed abonnieren', Icon: RssFeedRounded },
  { key: 'music', label: t('Musik'), keywords: 'song lied album', Icon: MusicNoteRounded },
  { key: 'podcast', label: t('Podcast'), keywords: 'audio folge', Icon: PodcastsRounded },
  { key: 'headphones', label: t('Hören'), keywords: 'audio musik', Icon: HeadphonesRounded },
  { key: 'mic', label: t('Mikrofon'), keywords: 'aufnahme sprechen', Icon: MicRounded },
  { key: 'video', label: t('Video'), keywords: 'clip abspielen', Icon: PlayCircleRounded },
  { key: 'live', label: t('Livestream'), keywords: 'stream live', Icon: SensorsRounded },
  { key: 'movie', label: t('Film'), keywords: 'kino', Icon: MovieRounded },
  { key: 'photo', label: t('Fotos'), keywords: 'kamera bilder', Icon: PhotoCameraRounded },
  { key: 'gallery', label: t('Galerie'), keywords: 'bilder album', Icon: CollectionsRounded },
  { key: 'art', label: t('Kunst'), keywords: 'malen zeichnen', Icon: PaletteRounded },
  { key: 'design', label: t('Design'), keywords: 'pinsel gestaltung', Icon: BrushRounded },
  { key: 'code', label: t('Code'), keywords: 'programmieren entwicklung', Icon: CodeRounded },
  { key: 'game', label: t('Spiele'), keywords: 'gaming zocken', Icon: SportsEsportsRounded },
  { key: 'calendar', label: t('Termine'), keywords: 'kalender event', Icon: EventRounded },
  { key: 'ticket', label: t('Tickets'), keywords: 'karten event', Icon: ConfirmationNumberRounded },
  { key: 'location', label: t('Ort'), keywords: 'adresse karte', Icon: PlaceRounded },
  { key: 'download', label: t('Download'), keywords: 'herunterladen', Icon: DownloadRounded },
  { key: 'document', label: t('Dokument'), keywords: 'pdf lebenslauf datei', Icon: DescriptionRounded },
  { key: 'book', label: t('Buch'), keywords: 'lesen', Icon: MenuBookRounded },
  { key: 'school', label: t('Lernen'), keywords: 'schule kurs', Icon: SchoolRounded },
  { key: 'work', label: t('Beruf'), keywords: 'arbeit job lebenslauf', Icon: WorkRounded },
  { key: 'person', label: t('Über mich'), keywords: 'person profil', Icon: PersonRounded },
  { key: 'group', label: t('Community'), keywords: 'gruppe leute', Icon: GroupsRounded },
  { key: 'donate', label: t('Unterstützen'), keywords: 'spenden support', Icon: VolunteerActivismRounded },
  { key: 'heart', label: t('Herz'), keywords: 'liebe favorit', Icon: FavoriteRounded },
  { key: 'gift', label: t('Geschenk'), keywords: 'wunschliste', Icon: CardGiftcardRounded },
  { key: 'coffee', label: t('Kaffee'), keywords: 'spendieren', Icon: LocalCafeRounded },
  { key: 'star', label: t('Stern'), keywords: 'favorit highlight', Icon: StarRounded },
  { key: 'rocket', label: t('Projekt'), keywords: 'start rakete', Icon: RocketLaunchRounded },
  { key: 'idea', label: t('Idee'), keywords: 'glühbirne tipp', Icon: LightbulbRounded },
  { key: 'travel', label: t('Reisen'), keywords: 'urlaub flug', Icon: FlightRounded },
  { key: 'food', label: t('Essen'), keywords: 'rezept restaurant', Icon: RestaurantRounded },
  { key: 'fitness', label: t('Sport'), keywords: 'training fitness', Icon: FitnessCenterRounded },
  { key: 'pets', label: t('Tiere'), keywords: 'haustier hund katze', Icon: PetsRounded },
  { key: 'home', label: t('Startseite'), keywords: 'zuhause haus', Icon: HomeRounded },
  { key: 'cloud', label: t('Cloud'), keywords: 'speicher', Icon: CloudRounded },
  { key: 'key', label: t('Zugang'), keywords: 'schlüssel login', Icon: KeyRounded },
  { key: 'help', label: t('Hilfe'), keywords: 'support frage', Icon: HelpOutlineRounded },
  { key: 'info', label: t('Info'), keywords: 'information', Icon: InfoOutlined },
];

export const BRAND_GROUPS: Array<[BrandGroup, string]> = [
  ['social', t('Soziale Netzwerke')],
  ['chat', t('Chat')],
  ['video', t('Video und Streaming')],
  ['music', t('Musik')],
  ['games', t('Spiele')],
  ['creative', t('Kunst und Fotos')],
  ['code', t('Code')],
  ['writing', t('Lesen und Schreiben')],
  ['support', t('Unterstützen und Shops')],
  ['apps', t('Apps')],
];

export const BRAND_ICONS: BrandIcon[] = [
  { slug: 'instagram', title: 'Instagram', group: 'social', domains: ['instagram.com', 'instagr.am'] },
  { slug: 'tiktok', title: 'TikTok', group: 'social', domains: ['tiktok.com'] },
  { slug: 'x', title: 'X', group: 'social', domains: ['x.com', 'twitter.com'] },
  { slug: 'threads', title: 'Threads', group: 'social', domains: ['threads.net', 'threads.com'] },
  { slug: 'bluesky', title: 'Bluesky', group: 'social', domains: ['bsky.app', 'bsky.social'] },
  { slug: 'mastodon', title: 'Mastodon', group: 'social', domains: ['mastodon.social', 'mastodon.online', 'mstdn.social', 'chaos.social'] },
  { slug: 'facebook', title: 'Facebook', group: 'social', domains: ['facebook.com', 'fb.com', 'fb.me'] },
  { slug: 'reddit', title: 'Reddit', group: 'social', domains: ['reddit.com', 'redd.it'] },
  { slug: 'tumblr', title: 'Tumblr', group: 'social', domains: ['tumblr.com'] },
  { slug: 'pinterest', title: 'Pinterest', group: 'social', domains: ['pinterest.com', 'pinterest.de', 'pin.it'] },
  { slug: 'snapchat', title: 'Snapchat', group: 'social', domains: ['snapchat.com'] },
  { slug: 'discord', title: 'Discord', group: 'chat', domains: ['discord.gg', 'discord.com', 'discordapp.com'] },
  { slug: 'telegram', title: 'Telegram', group: 'chat', domains: ['t.me', 'telegram.me', 'telegram.org'] },
  { slug: 'whatsapp', title: 'WhatsApp', group: 'chat', domains: ['wa.me', 'whatsapp.com'] },
  { slug: 'signal', title: 'Signal', group: 'chat', domains: ['signal.me', 'signal.group', 'signal.org'] },
  { slug: 'matrix', title: 'Matrix', group: 'chat', domains: ['matrix.to'] },
  { slug: 'youtube', title: 'YouTube', group: 'video', domains: ['youtube.com', 'youtu.be'] },
  { slug: 'twitch', title: 'Twitch', group: 'video', domains: ['twitch.tv'] },
  { slug: 'kick', title: 'Kick', group: 'video', domains: ['kick.com'] },
  { slug: 'vimeo', title: 'Vimeo', group: 'video', domains: ['vimeo.com'] },
  { slug: 'spotify', title: 'Spotify', group: 'music', domains: ['spotify.com', 'spotify.link'] },
  { slug: 'applemusic', title: 'Apple Music', group: 'music', domains: ['music.apple.com'] },
  { slug: 'soundcloud', title: 'SoundCloud', group: 'music', domains: ['soundcloud.com'] },
  { slug: 'bandcamp', title: 'Bandcamp', group: 'music', domains: ['bandcamp.com'] },
  { slug: 'youtubemusic', title: 'YouTube Music', group: 'music', domains: ['music.youtube.com'] },
  { slug: 'deezer', title: 'Deezer', group: 'music', domains: ['deezer.com', 'deezer.page.link'] },
  { slug: 'tidal', title: 'TIDAL', group: 'music', domains: ['tidal.com'] },
  { slug: 'lastdotfm', title: 'Last.fm', group: 'music', domains: ['last.fm'] },
  { slug: 'steam', title: 'Steam', group: 'games', domains: ['steampowered.com', 'steamcommunity.com', 's.team'] },
  { slug: 'epicgames', title: 'Epic Games', group: 'games', domains: ['epicgames.com'] },
  { slug: 'playstation', title: 'PlayStation', group: 'games', domains: ['playstation.com'] },
  { slug: 'battledotnet', title: 'Battle.net', group: 'games', domains: ['battle.net'] },
  { slug: 'roblox', title: 'Roblox', group: 'games', domains: ['roblox.com'] },
  { slug: 'itchdotio', title: 'itch.io', group: 'games', domains: ['itch.io'] },
  { slug: 'curseforge', title: 'CurseForge', group: 'games', domains: ['curseforge.com'] },
  { slug: 'modrinth', title: 'Modrinth', group: 'games', domains: ['modrinth.com'] },
  { slug: 'chessdotcom', title: 'Chess.com', group: 'games', domains: ['chess.com'] },
  { slug: 'lichess', title: 'Lichess', group: 'games', domains: ['lichess.org'] },
  { slug: 'behance', title: 'Behance', group: 'creative', domains: ['behance.net'] },
  { slug: 'dribbble', title: 'Dribbble', group: 'creative', domains: ['dribbble.com'] },
  { slug: 'artstation', title: 'ArtStation', group: 'creative', domains: ['artstation.com'] },
  { slug: 'deviantart', title: 'DeviantArt', group: 'creative', domains: ['deviantart.com'] },
  { slug: 'pixiv', title: 'pixiv', group: 'creative', domains: ['pixiv.net'] },
  { slug: 'figma', title: 'Figma', group: 'creative', domains: ['figma.com'] },
  { slug: 'flickr', title: 'Flickr', group: 'creative', domains: ['flickr.com', 'flic.kr'] },
  { slug: 'unsplash', title: 'Unsplash', group: 'creative', domains: ['unsplash.com'] },
  { slug: '500px', title: '500px', group: 'creative', domains: ['500px.com'] },
  { slug: 'printables', title: 'Printables', group: 'creative', domains: ['printables.com'] },
  { slug: 'thingiverse', title: 'Thingiverse', group: 'creative', domains: ['thingiverse.com'] },
  { slug: 'github', title: 'GitHub', group: 'code', domains: ['github.com', 'github.io'] },
  { slug: 'gitlab', title: 'GitLab', group: 'code', domains: ['gitlab.com'] },
  { slug: 'codeberg', title: 'Codeberg', group: 'code', domains: ['codeberg.org', 'codeberg.page'] },
  { slug: 'npm', title: 'npm', group: 'code', domains: ['npmjs.com'] },
  { slug: 'stackoverflow', title: 'Stack Overflow', group: 'code', domains: ['stackoverflow.com'] },
  { slug: 'huggingface', title: 'Hugging Face', group: 'code', domains: ['huggingface.co'] },
  { slug: 'devdotto', title: 'DEV', group: 'code', domains: ['dev.to'] },
  { slug: 'replit', title: 'Replit', group: 'code', domains: ['replit.com'] },
  { slug: 'medium', title: 'Medium', group: 'writing', domains: ['medium.com'] },
  { slug: 'substack', title: 'Substack', group: 'writing', domains: ['substack.com'] },
  { slug: 'ghost', title: 'Ghost', group: 'writing', domains: ['ghost.io'] },
  { slug: 'wordpress', title: 'WordPress', group: 'writing', domains: ['wordpress.com'] },
  { slug: 'hashnode', title: 'Hashnode', group: 'writing', domains: ['hashnode.com', 'hashnode.dev'] },
  { slug: 'notion', title: 'Notion', group: 'writing', domains: ['notion.so', 'notion.site'] },
  { slug: 'goodreads', title: 'Goodreads', group: 'writing', domains: ['goodreads.com'] },
  { slug: 'letterboxd', title: 'Letterboxd', group: 'writing', domains: ['letterboxd.com', 'boxd.it'] },
  { slug: 'anilist', title: 'AniList', group: 'writing', domains: ['anilist.co'] },
  { slug: 'myanimelist', title: 'MyAnimeList', group: 'writing', domains: ['myanimelist.net'] },
  { slug: 'patreon', title: 'Patreon', group: 'support', domains: ['patreon.com'] },
  { slug: 'kofi', title: 'Ko-fi', group: 'support', domains: ['ko-fi.com'] },
  { slug: 'buymeacoffee', title: 'Buy Me a Coffee', group: 'support', domains: ['buymeacoffee.com'] },
  { slug: 'paypal', title: 'PayPal', group: 'support', domains: ['paypal.com', 'paypal.me'] },
  { slug: 'liberapay', title: 'Liberapay', group: 'support', domains: ['liberapay.com'] },
  { slug: 'opencollective', title: 'Open Collective', group: 'support', domains: ['opencollective.com'] },
  { slug: 'githubsponsors', title: 'GitHub Sponsors', group: 'support', domains: [] },
  { slug: 'gumroad', title: 'Gumroad', group: 'support', domains: ['gumroad.com'] },
  { slug: 'etsy', title: 'Etsy', group: 'support', domains: ['etsy.com', 'etsy.me'] },
  { slug: 'redbubble', title: 'Redbubble', group: 'support', domains: ['redbubble.com'] },
  { slug: 'kickstarter', title: 'Kickstarter', group: 'support', domains: ['kickstarter.com'] },
  { slug: 'appstore', title: 'App Store', group: 'apps', domains: ['apps.apple.com'] },
  { slug: 'googleplay', title: 'Google Play', group: 'apps', domains: ['play.google.com'] },
  { slug: 'strava', title: 'Strava', group: 'apps', domains: ['strava.com', 'strava.app.link'] },
  { slug: 'duolingo', title: 'Duolingo', group: 'apps', domains: ['duolingo.com'] },
];

export const EMOJI_CHOICES = [
  '✨',
  '🔥',
  '⭐',
  '❤️',
  '💜',
  '🎮',
  '🎨',
  '🎵',
  '🎧',
  '🎬',
  '📷',
  '📚',
  '✍️',
  '💼',
  '🛒',
  '🎁',
  '☕',
  '🍕',
  '🌍',
  '✈️',
  '🏠',
  '📍',
  '📅',
  '📧',
  '💬',
  '📞',
  '🔗',
  '🚀',
  '💡',
  '🛠️',
  '🐾',
  '🌱',
];

const GENERAL_BY_KEY = new Map(GENERAL_ICONS.map((icon) => [icon.key, icon]));
export const BRAND_BY_SLUG = new Map(BRAND_ICONS.map((brand) => [brand.slug, brand]));

const FEDIVERSE = /(?:^|\.)(?:mastodon|mstdn|masto|toot)\./;

function brandOf(url: URL) {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'github.com' && /^\/sponsors\//.test(url.pathname)) return 'githubsponsors';
  let best: { slug: string; length: number } | null = null;
  for (const brand of BRAND_ICONS) {
    for (const domain of brand.domains) {
      if ((host === domain || host.endsWith(`.${domain}`)) && (!best || domain.length > best.length))
        best = { slug: brand.slug, length: domain.length };
    }
  }
  if (best) return best.slug;
  if (FEDIVERSE.test(`.${host}`) && url.pathname.startsWith('/@')) return 'mastodon';
  return null;
}

export function autoIcon(url: string): string {
  if (/^mailto:/i.test(url)) return 'g:mail';
  if (/^tel:/i.test(url)) return 'g:phone';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'g:link';
  }
  const brand = brandOf(parsed);
  if (brand) return `b:${brand}`;
  if (/\.pdf$/i.test(parsed.pathname)) return 'g:document';
  if (/\/(?:feed|rss)(?:\.xml)?\/?$|\.rss$|\/atom\.xml$/i.test(parsed.pathname)) return 'g:rss';
  return 'g:website';
}

export function iconTitle(icon: string | null, url = ''): string {
  if (!icon) return t('Kein Symbol');
  if (icon === 'auto') return t('Automatisch: {name}', { name: iconTitle(autoIcon(url)) });
  if (icon.startsWith('g:')) return GENERAL_BY_KEY.get(icon.slice(2))?.label || t('Symbol');
  if (icon.startsWith('b:')) return BRAND_BY_SLUG.get(icon.slice(2))?.title || t('Symbol');
  if (icon.startsWith('e:')) return icon.slice(2);
  return t('Eigenes Symbol');
}

let brandPaths: Record<string, string> | null = null;
let brandRequest: Promise<Record<string, string>> | null = null;

export function loadBrandPaths() {
  if (!brandRequest) {
    brandRequest = import('./brandIcons').then((module) => {
      brandPaths = module.BRAND_PATHS;
      return module.BRAND_PATHS;
    });
  }
  return brandRequest;
}

function useBrandPaths(needed: boolean) {
  const [paths, setPaths] = useState(brandPaths);
  useEffect(() => {
    if (!needed || paths) return;
    let alive = true;
    loadBrandPaths()
      .then((loaded) => alive && setPaths(loaded))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [needed, paths]);
  return paths;
}

function BrandGlyph({ slug, size }: { slug: string; size: number }) {
  const paths = useBrandPaths(true);
  const path = paths?.[slug];
  if (!path) return <Box component="span" aria-hidden sx={{ display: 'inline-block', width: size, height: size, flexShrink: 0 }} />;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
      focusable="false"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <path d={path} />
    </svg>
  );
}

export function LinkIcon({
  icon,
  url = '',
  iconUrl = null,
  size = 22,
}: {
  icon: string | null;
  url?: string;
  iconUrl?: string | null;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const resolved = icon === 'auto' || (icon?.startsWith('c:') && (!iconUrl || broken)) ? autoIcon(url) : icon;
  if (!resolved) return null;
  if (resolved.startsWith('g:')) {
    const entry = GENERAL_BY_KEY.get(resolved.slice(2)) || GENERAL_BY_KEY.get('link')!;
    const { Icon } = entry;
    return <Icon aria-hidden sx={{ fontSize: size, display: 'block', flexShrink: 0 }} />;
  }
  if (resolved.startsWith('b:')) return <BrandGlyph slug={resolved.slice(2)} size={size} />;
  if (resolved.startsWith('e:')) {
    return (
      <Box
        component="span"
        aria-hidden
        sx={{ display: 'inline-grid', placeItems: 'center', width: size, height: size, fontSize: size * 0.9, lineHeight: 1, flexShrink: 0 }}
      >
        {resolved.slice(2)}
      </Box>
    );
  }
  return (
    <Box
      component="img"
      src={iconUrl || ''}
      alt=""
      aria-hidden
      onError={() => setBroken(true)}
      sx={{ width: size, height: size, borderRadius: `${Math.round(size * 0.24)}px`, objectFit: 'cover', display: 'block', flexShrink: 0 }}
    />
  );
}
