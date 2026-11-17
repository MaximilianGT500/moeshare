'use strict';

const express = require('express');
const db = require('../lib/db');
const { forbidden } = require('../lib/errors');
const { renderPage } = require('../lib/render');
const { requirePage, requireApi } = require('../middleware/auth');
const settings = require('../services/settingsService');
const designs = require('../services/designService');
const embeds = require('../services/embedService');
const files = require('../services/fileService');
const profiles = require('../services/profileService');
const viewer = require('../services/viewerService');
const audit = require('../services/auditService');
const watermarks = require('../services/watermarkService');
const { fileView, sampleRecord } = require('../services/viewService');
const avatars = require('../services/avatarService');
const profileIcons = require('../services/profileIconService');
const stats = require('../services/statsService');
const { DEFAULT_DESIGN, LAYOUTS, BACKGROUNDS, FONTS, CORNERS, SCHEMES, ELEMENTS, MAX_CSS } = require('../lib/viewDesign');

const router = express.Router();
const signedIn = requireApi();

const STATS_DAYS = 30;

async function profileStats(user, profile) {
  const [clicks, visits] = await Promise.all([
    stats.sums(
      'pl',
      profile.links.map((link) => link.id),
      { days: STATS_DAYS }
    ),
    stats.sums('p', [user.id], { days: STATS_DAYS }),
  ]);
  const own = visits.get(Number(user.id));
  return {
    enabled: stats.enabled(),
    days: STATS_DAYS,
    views: own ? own.views : 0,
    previews: own ? own.previews : 0,
    clicks: Object.fromEntries([...clicks].map(([id, counts]) => [id, counts.views])),
  };
}

async function profileData(user) {
  const [profile, albums, listed, ownIcons] = await Promise.all([
    profiles.get(user.id),
    db.count("SELECT COUNT(*) FROM albums WHERE user_id = ? AND visibility = 'public'", [user.id]),
    db.count(`SELECT COUNT(*) FROM file_data WHERE username = ? AND listed = 1 AND ${files.LIVE}`, [user.username]),
    profileIcons.list(user),
  ]);
  return {
    ...profile,
    available: settings.get('profiles.enabled'),
    urls: profiles.profileUrls(user.username),
    counts: { albums, files: listed },
    maxLinks: profiles.MAX_LINKS,
    icons: { enabled: profileIcons.enabled(), max: profileIcons.MAX_ICONS, items: ownIcons },
    stats: await profileStats(user, profile),
  };
}

function elementChoices() {
  return ELEMENTS.filter(
    (element) => (element !== 'reactions' || settings.get('reactions.enabled')) && (element !== 'frame' || settings.get('frames.enabled'))
  );
}

async function viewData(user) {
  const [own, sample] = await Promise.all([designs.ownDesign(user.id), sampleRecord(user)]);
  return {
    own,
    defaultDesign: settings.get('view.default'),
    builtinDesign: DEFAULT_DESIGN,
    allowCustom: settings.get('view.allowUserDesigns'),
    cssMode: designs.cssMode(),
    cssAllowed: designs.cssAllowedFor(user.role),
    sampleFileId: sample ? Number(sample.id) : null,
    choices: { layouts: LAYOUTS, backgrounds: BACKGROUNDS, fonts: FONTS, corners: CORNERS, schemes: SCHEMES, elements: elementChoices() },
    maxCss: MAX_CSS,
  };
}

router.get('/design', requirePage(), async (req, res) => {
  const summary = viewer.summary(req.user);
  if (!summary.canDesign) return res.redirect('/dashboard');
  const [view, profile, embed, userStats, sudo, watermark] = await Promise.all([
    viewData(req.user),
    profileData(req.user),
    embeds.builderData(req.user),
    files.userStats(req.user.username),
    viewer.confirmMethods(req.user),
    watermarks.get(req.user.id),
  ]);
  return renderPage(res, {
    page: 'design',
    title: 'Gestalten',
    data: {
      user: summary,
      view,
      profile,
      embed,
      userStats,
      sudo,
      watermark: watermarks.present(watermark),
      avatars: { enabled: avatars.enabled(), animated: settings.get('profiles.animatedAvatars'), maxBytes: avatars.MAX_INPUT_BYTES },
    },
  });
});

router.get('/design/preview', requirePage(), async (req, res) => {
  const id = Number.parseInt(req.query.file, 10);
  const record = Number.isSafeInteger(id) ? await files.findById(id) : null;
  const usable = record && record.username === req.user.username && !record.deleted_at;
  const style = await designs.forOwner(req.user.username);
  const base = usable
    ? await fileView(record, { access: { state: 'open', owner: false } })
    : { sample: true, sampleUser: req.user.username };
  res.set('X-Robots-Tag', 'noindex');
  return renderPage(res, {
    page: 'view',
    title: 'Vorschau',
    data: { ...base, design: style.design, css: style.css, report: null, profile: null, preview: true },
  });
});

router.put('/api/design', signedIn, async (req, res) => {
  const design = await designs.setOwnDesign(req.user, req.body.design);
  audit.log('design_updated', { userId: req.user.id, req });
  res.json({ ok: true, design });
});

router.delete('/api/design', signedIn, async (req, res) => {
  await designs.setOwnDesign(req.user, null);
  res.json({ ok: true });
});

router.post('/api/design/preview', signedIn, async (req, res) => {
  const scope = req.body.scope === 'default' ? 'default' : 'own';
  if (scope === 'default' && !req.user.isAdmin) throw forbidden('Das dürfen nur Admins.');
  const allowCss = scope === 'default' ? designs.cssMode() !== 'off' : designs.cssAllowedFor(req.user.role);
  res.json(designs.preview(req.body.design || {}, { allowCss }));
});

router.put('/api/profile', signedIn, async (req, res) => {
  await profiles.update(req.user, req.body || {});
  res.json({ ok: true, profile: await profileData(req.user) });
});

module.exports = router;
