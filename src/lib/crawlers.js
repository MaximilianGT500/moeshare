'use strict';

const CRAWLERS =
  /Discordbot|TelegramBot|Twitterbot|WhatsApp|Slackbot|Slack-ImgProxy|facebookexternalhit|Facebot|LinkedInBot|Mastodon|Bluesky|Embedly|redditbot|SkypeUriPreview|MicrosoftPreview|Googlebot|bingbot|Applebot|Iframely|vkShare|Pinterest|Snapchat|Synapse|Zulip|Mattermost|RocketChat|Discourse|bot\b|crawler|spider|preview/i;

const PLATFORMS = [
  ['discord', /Discordbot/i],
  ['telegram', /TelegramBot/i],
  ['whatsapp', /WhatsApp/i],
  ['x', /Twitterbot/i],
  ['slack', /Slackbot|Slack-ImgProxy/i],
  ['facebook', /facebookexternalhit|Facebot/i],
  ['linkedin', /LinkedInBot/i],
  ['mastodon', /Mastodon/i],
  ['bluesky', /Bluesky/i],
  ['reddit', /redditbot/i],
  ['skype', /SkypeUriPreview/i],
  ['teams', /MicrosoftPreview/i],
  ['matrix', /Synapse/i],
  ['google', /Googlebot/i],
  ['bing', /bingbot/i],
  ['apple', /Applebot/i],
];

const isCrawler = (userAgent) => CRAWLERS.test(String(userAgent || ''));

function platformOf(userAgent) {
  const agent = String(userAgent || '');
  const found = PLATFORMS.find(([, pattern]) => pattern.test(agent));
  return found ? `@${found[0]}` : '@bot';
}

module.exports = { isCrawler, platformOf };
