import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DesktopWindowsRounded from '@mui/icons-material/DesktopWindowsRounded';
import PhoneIphoneRounded from '@mui/icons-material/PhoneIphoneRounded';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import type { DesignElement, SessionUser, ViewDesign, ViewDesignData } from '../../lib/types';
import { ApiError, errorMessage, previewDesign, resetDesign, saveDesign, saveSettings } from '../../lib/api';
import {
  BACKGROUND_LABELS,
  CORNER_LABELS,
  ELEMENT_LABELS,
  FALLBACK_DESIGN,
  FONT_LABELS,
  FONT_STACKS,
  SCHEME_LABELS,
  withDefaults,
} from '../../lib/design';
import { useDebouncedValue, useElementWidth } from '../../lib/hooks';
import { ColorField } from '../../components/Fields';
import { useConfirm } from '../../components/ConfirmDialog';
import { SaveBar, SettingRow, SettingsSection } from '../../components/SettingsKit';
import { isCancelled, useSudo } from '../../components/Sudo';
import { useToast } from '../../components/Toaster';
import { LayoutPicker } from './LayoutPicker';
import { c, ease, elevation, fonts, radius } from '../../theme/tokens';
import { t } from '../../lib/i18n';

type Scope = 'own' | 'default';
type Device = 'desktop' | 'phone';

const DEVICES: Record<Device, { w: number; h: number }> = { desktop: { w: 1280, h: 820 }, phone: { w: 390, h: 780 } };

const KEYS: Array<keyof ViewDesign> = ['layout', 'accent', 'scheme', 'background', 'font', 'corners', 'show', 'note', 'button', 'css'];

const changed = (a: ViewDesign, b: ViewDesign) =>
  KEYS.filter((key) => JSON.stringify(a[key] ?? '') !== JSON.stringify(b[key] ?? '')).length;

function PreviewFrame({ design, css, fileId, device }: { design: ViewDesign; css: string; fileId: number | null; device: Device }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [wrapper, width] = useElementWidth<HTMLDivElement>();
  const size = DEVICES[device];
  const scale = width ? Math.min(1, width / size.w) : 0.4;
  const src = `/design/preview${fileId ? `?file=${fileId}` : ''}`;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data && event.data.type === 'moeshare:ready') setReady(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => setReady(false), [src]);

  useEffect(() => {
    if (!ready) return;
    frame.current?.contentWindow?.postMessage({ type: 'moeshare:design', design, css }, window.location.origin);
  }, [ready, design, css]);

  return (
    <Box ref={wrapper} sx={{ width: '100%' }}>
      <Box
        sx={{
          position: 'relative',
          width: size.w * scale,
          height: size.h * scale,
          mx: 'auto',
          borderRadius: `${device === 'phone' ? radius.xl : radius.lg}px`,
          overflow: 'hidden',
          boxShadow: `${elevation[3]}, 0 0 0 1px ${c.outlineVariant}`,
          bgcolor: c.surfaceContainerLowest,
          transition: 'width 320ms cubic-bezier(0.2, 0, 0, 1), height 320ms cubic-bezier(0.2, 0, 0, 1)',
        }}
      >
        <iframe
          ref={frame}
          src={src}
          title={t('Vorschau der Seite')}
          style={{ width: size.w, height: size.h, border: 0, transform: `scale(${scale})`, transformOrigin: '0 0', display: 'block' }}
        />
      </Box>
    </Box>
  );
}

function Choice<T extends string>({
  value,
  options,
  label,
  onChange,
  disabled,
  render,
}: {
  value: T;
  options: T[];
  label: string;
  onChange: (value: T) => void;
  disabled?: boolean;
  render: (option: T) => ReactNode;
}) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      disabled={disabled}
      onChange={(_event, next: T | null) => next && onChange(next)}
      aria-label={label}
      sx={{ flexWrap: 'wrap' }}
    >
      {options.map((option) => (
        <ToggleButton key={option} value={option} sx={{ px: 1.75 }}>
          {render(option)}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

const CSS_HINT =
  '.ms-header, .ms-media, .ms-info, .ms-title, .ms-meta, .ms-actions, .ms-note, .ms-cta, .ms-footer, .ms-gallery, .ms-profile-head';

export function ViewDesigner({ user, data }: { user: SessionUser; data: ViewDesignData }) {
  const toast = useToast();
  const confirm = useConfirm();
  const sudo = useSudo();
  const isAdmin = user.isAdmin;
  const [allowCustom, setAllowCustom] = useState(data.allowCustom);
  const [cssMode, setCssMode] = useState(data.cssMode);
  const [own, setOwn] = useState<ViewDesign | null>(data.own ? withDefaults(data.own) : null);
  const [defaults, setDefaults] = useState<ViewDesign>(withDefaults(data.defaultDesign));
  const [scope, setScope] = useState<Scope>(!allowCustom && isAdmin ? 'default' : 'own');
  const baseline = scope === 'default' ? defaults : (own ?? defaults);
  const [draft, setDraft] = useState<ViewDesign>(baseline);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState<Device>('desktop');
  const [subject, setSubject] = useState<'file' | 'sample'>(data.sampleFileId ? 'file' : 'sample');
  const [compiled, setCompiled] = useState('');
  const [cssError, setCssError] = useState('');

  const readOnly = scope === 'own' && !allowCustom && !isAdmin;
  const cssAllowed = scope === 'default' ? cssMode !== 'off' : cssMode === 'all' || (cssMode === 'admins' && isAdmin);
  const dirty = readOnly ? 0 : changed(draft, baseline);
  const cssSource = useDebouncedValue(cssAllowed ? draft.css || '' : '', 450);

  useEffect(() => {
    if (!cssSource.trim()) {
      setCompiled('');
      setCssError('');
      return undefined;
    }
    let cancelled = false;
    previewDesign({ ...FALLBACK_DESIGN, css: cssSource }, scope)
      .then((result) => {
        if (cancelled) return;
        setCompiled(result.css);
        setCssError('');
      })
      .catch((failure) => !cancelled && setCssError(errorMessage(failure)));
    return () => {
      cancelled = true;
    };
  }, [cssSource, scope]);

  const previewCss = cssAllowed ? compiled : '';
  const previewDesignValue = useMemo(() => ({ ...draft, css: '' }), [draft]);

  const update = (patch: Partial<ViewDesign>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setErrors({});
  };
  const toggleElement = (element: DesignElement, value: boolean) => update({ show: { ...draft.show, [element]: value } });

  const fail = (failure: unknown) => {
    if (isCancelled(failure)) return;
    if (failure instanceof ApiError && failure.field) setErrors({ [failure.field.replace(/^view\.default\./, '')]: failure.message });
    toast(errorMessage(failure), { variant: 'error' });
  };

  const switchScope = async (next: Scope | null) => {
    if (!next || next === scope) return;
    if (dirty > 0) {
      const ok = await confirm({
        title: t('Änderungen verwerfen?'),
        message: t('Du hast ungespeicherte Änderungen an diesem Design.'),
        confirmLabel: t('Verwerfen'),
      });
      if (!ok) return;
    }
    setScope(next);
    setDraft(next === 'default' ? defaults : (own ?? defaults));
    setErrors({});
  };

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      if (scope === 'default') {
        const result = await sudo(() => saveSettings({ 'view.default': draft }));
        const saved = withDefaults(result.values['view.default'] as ViewDesign);
        setDefaults(saved);
        setDraft(saved);
        toast(t('Standarddesign gespeichert'), { variant: 'success' });
      } else {
        const result = await saveDesign(draft);
        const saved = withDefaults(result.design);
        setOwn(saved);
        setDraft(saved);
        toast(t('Dein Design ist gespeichert'), { variant: 'success' });
      }
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy(false);
    }
  };

  const useDefault = async () => {
    const ok = await confirm({
      title: t('Standarddesign verwenden?'),
      message: t('Dein eigenes Design wird gelöscht. Deine Vorschauseiten sehen danach aus wie bei allen anderen.'),
      confirmLabel: t('Zurücksetzen'),
      icon: <RestartAltRounded />,
    });
    if (!ok) return;
    try {
      await resetDesign();
      setOwn(null);
      setDraft(defaults);
      toast(t('Du verwendest jetzt das Standarddesign'), { variant: 'success' });
    } catch (failure) {
      fail(failure);
    }
  };

  const saveRule = async (patch: Record<string, string | boolean>, message: string) => {
    try {
      await sudo(() => saveSettings(patch));
      if ('view.allowUserDesigns' in patch) setAllowCustom(Boolean(patch['view.allowUserDesigns']));
      if ('view.customCss' in patch) setCssMode(patch['view.customCss'] as ViewDesignData['cssMode']);
      toast(message, { variant: 'success' });
    } catch (failure) {
      fail(failure);
    }
  };

  const custom = /^#/.test(draft.accent);

  return (
    <>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(420px, 46%)' },
          gridTemplateAreas: { xs: '"intro" "preview" "form"', lg: '"intro preview" "form preview"' },
          gridTemplateRows: { lg: 'auto 1fr' },
          columnGap: 5,
          rowGap: 3,
          alignItems: 'start',
          pb: 6,
        }}
      >
        <Box sx={{ gridArea: 'intro', minWidth: 0 }}>
          <Stack spacing={2.5}>
            {isAdmin && (
              <ToggleButtonGroup
                exclusive
                size="small"
                value={scope}
                onChange={(_event, next: Scope | null) => switchScope(next)}
                aria-label={t('Design')}
                sx={{ alignSelf: 'flex-start' }}
              >
                <ToggleButton value="own">{t('Mein Design')}</ToggleButton>
                <ToggleButton value="default">{t('Standard')}</ToggleButton>
              </ToggleButtonGroup>
            )}
            <Typography variant="body1" sx={{ color: 'text.secondary', maxWidth: 640 }}>
              {scope === 'default'
                ? t('Das Standarddesign gilt für alle Vorschauseiten, deren Besitzer kein eigenes Design gebaut hat.')
                : readOnly
                  ? t('Auf diesem Server gilt ein einheitliches Design. So sehen deine Vorschauseiten aus.')
                  : own
                    ? t('Dein Design gilt für alle deine Vorschauseiten, Alben und deine Profilseite.')
                    : t('Du verwendest das Standarddesign. Ändere es hier, um dein eigenes zu bauen.')}
            </Typography>
            {scope === 'default' && (
              <SettingsSection title={t('Regeln für alle')}>
                <SettingRow label={t('Eigene Designs erlauben')} description={t('Mitglieder können ihre Vorschauseiten selbst gestalten.')}>
                  <Switch
                    checked={allowCustom}
                    onChange={(event) =>
                      saveRule(
                        { 'view.allowUserDesigns': event.target.checked },
                        event.target.checked
                          ? t('Mitglieder können jetzt eigene Designs bauen')
                          : t('Ab jetzt gilt für alle das Standarddesign')
                      )
                    }
                    slotProps={{ input: { 'aria-label': t('Eigene Designs erlauben') } }}
                  />
                </SettingRow>
                <SettingRow
                  label={t('Eigenes CSS')}
                  description={t('Wer darf mit eigenem CSS gestalten? Externe Dateien wie Bilder oder Schriften lädt MoeShare dabei nie.')}
                >
                  <TextField
                    select
                    size="small"
                    value={cssMode}
                    onChange={(event) => saveRule({ 'view.customCss': event.target.value }, t('Gespeichert'))}
                    sx={{ width: 220 }}
                    slotProps={{ select: { SelectDisplayProps: { 'aria-label': t('Eigenes CSS') } } }}
                  >
                    <MenuItem value="off">{t('Niemand')}</MenuItem>
                    <MenuItem value="admins">{t('Nur Admins')}</MenuItem>
                    <MenuItem value="all">{t('Alle Mitglieder')}</MenuItem>
                  </TextField>
                </SettingRow>
              </SettingsSection>
            )}
            {readOnly && <Alert severity="info">{t('Eigene Designs sind auf diesem Server abgeschaltet.')}</Alert>}
          </Stack>
        </Box>

        <Box sx={{ gridArea: 'form', minWidth: 0 }}>
          <Stack spacing={3.5}>
            <SettingsSection title={t('Aufbau')} description={t('Wie Datei und Angaben auf der Seite angeordnet sind.')}>
              <LayoutPicker
                value={draft.layout}
                options={data.choices.layouts}
                onChange={(layout) => update({ layout })}
                disabled={readOnly}
              />
            </SettingsSection>

            <SettingsSection title={t('Farben und Schrift')}>
              <SettingRow label={t('Akzentfarbe')} description={t('Färbt Knöpfe, Hintergrund und Hervorhebungen.')} stacked>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={custom ? 'custom' : draft.accent}
                    disabled={readOnly}
                    onChange={(_event, next: string | null) => {
                      if (!next) return;
                      update({ accent: next === 'custom' ? (custom ? draft.accent : '#8b5cf6') : next });
                    }}
                    aria-label={t('Akzentfarbe')}
                  >
                    <ToggleButton value="auto">{t('Aus der Datei')}</ToggleButton>
                    <ToggleButton value="site">{t('Seitenfarbe')}</ToggleButton>
                    <ToggleButton value="custom">{t('Eigene')}</ToggleButton>
                  </ToggleButtonGroup>
                  {custom && (
                    <ColorField
                      label={t('Farbe')}
                      value={draft.accent}
                      onChange={(accent) => update({ accent })}
                      disabled={readOnly}
                      error={!!errors.accent}
                      helperText={errors.accent}
                    />
                  )}
                </Box>
              </SettingRow>
              <SettingRow
                label={t('Hell oder dunkel')}
                description={draft.layout === 'stage' ? t('Die Bühne ist immer dunkel.') : undefined}
                stacked
              >
                <Choice
                  value={draft.scheme}
                  options={data.choices.schemes}
                  label={t('Hell oder dunkel')}
                  disabled={readOnly}
                  onChange={(scheme) => update({ scheme })}
                  render={(option) => SCHEME_LABELS[option]()}
                />
              </SettingRow>
              <SettingRow
                label={t('Hintergrund')}
                description={draft.layout === 'stage' ? t('Die Bühne hat ihren eigenen Hintergrund.') : undefined}
                stacked
              >
                <Choice
                  value={draft.background}
                  options={data.choices.backgrounds}
                  label={t('Hintergrund')}
                  disabled={readOnly}
                  onChange={(background) => update({ background })}
                  render={(option) => BACKGROUND_LABELS[option]()}
                />
              </SettingRow>
              <SettingRow label={t('Schrift')} stacked>
                <Choice
                  value={draft.font}
                  options={data.choices.fonts}
                  label={t('Schrift')}
                  disabled={readOnly}
                  onChange={(font) => update({ font })}
                  render={(option) => <span style={{ fontFamily: FONT_STACKS[option] }}>{FONT_LABELS[option]()}</span>}
                />
              </SettingRow>
              <SettingRow label={t('Ecken')} stacked>
                <Choice
                  value={draft.corners}
                  options={data.choices.corners}
                  label={t('Ecken')}
                  disabled={readOnly}
                  onChange={(corners) => update({ corners })}
                  render={(option) => CORNER_LABELS[option]()}
                />
              </SettingRow>
            </SettingsSection>

            <SettingsSection title={t('Was die Seite zeigt')} description={t('Der Knopf zum Melden bleibt immer sichtbar.')}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 2, px: { xs: 2, sm: 3 }, py: 1.5 }}>
                {data.choices.elements.map((element) => (
                  <FormControlLabel
                    key={element}
                    control={
                      <Checkbox
                        checked={draft.show[element] !== false}
                        onChange={(event) => toggleElement(element, event.target.checked)}
                      />
                    }
                    label={ELEMENT_LABELS[element]()}
                    disabled={readOnly}
                  />
                ))}
              </Box>
            </SettingsSection>

            <SettingsSection
              title={t('Notiz und Knopf')}
              description={t('Ein kurzer Satz und ein Link, zum Beispiel zu deinem Portfolio.')}
            >
              <Box sx={{ display: 'grid', gap: 2, px: { xs: 2, sm: 3 }, py: 2.25 }}>
                <TextField
                  label={t('Notiz')}
                  value={draft.note}
                  onChange={(event) => update({ note: event.target.value })}
                  multiline
                  minRows={2}
                  disabled={readOnly}
                  error={!!errors.note}
                  helperText={errors.note || `${draft.note.length} / 280`}
                  slotProps={{ htmlInput: { maxLength: 280 } }}
                />
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 0.7fr) minmax(0, 1.3fr)' }, gap: 1.5 }}>
                  <TextField
                    label={t('Beschriftung')}
                    size="small"
                    value={draft.button.label}
                    onChange={(event) => update({ button: { ...draft.button, label: event.target.value } })}
                    disabled={readOnly}
                    error={!!errors['button.label']}
                    helperText={errors['button.label']}
                    slotProps={{ htmlInput: { maxLength: 40 } }}
                  />
                  <TextField
                    label={t('Adresse')}
                    size="small"
                    placeholder="https://"
                    value={draft.button.url}
                    onChange={(event) => update({ button: { ...draft.button, url: event.target.value } })}
                    disabled={readOnly}
                    error={!!errors['button.url']}
                    helperText={errors['button.url']}
                    slotProps={{ htmlInput: { spellCheck: false, inputMode: 'url', style: { fontFamily: fonts.mono } } }}
                  />
                </Box>
              </Box>
            </SettingsSection>

            <SettingsSection
              title={t('Eigenes CSS')}
              description={cssAllowed ? t('Regeln gelten nur auf deinen Seiten. Mit & sprichst du die ganze Seite an.') : undefined}
            >
              {cssAllowed ? (
                <Box sx={{ display: 'grid', gap: 1.5, px: { xs: 2, sm: 3 }, py: 2.25 }}>
                  <TextField
                    value={draft.css || ''}
                    onChange={(event) => update({ css: event.target.value })}
                    multiline
                    minRows={8}
                    maxRows={24}
                    disabled={readOnly}
                    placeholder={'& {\n  letter-spacing: 0.01em;\n}\n.ms-title {\n  text-transform: lowercase;\n}'}
                    error={!!cssError || !!errors.css}
                    helperText={cssError || errors.css || t('Klassen: {list}', { list: CSS_HINT })}
                    slotProps={{
                      htmlInput: {
                        spellCheck: false,
                        maxLength: data.maxCss,
                        'aria-label': t('Eigenes CSS'),
                        style: { fontFamily: fonts.mono, fontSize: '0.8125rem', lineHeight: 1.6 },
                      },
                    }}
                  />
                </Box>
              ) : (
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    columnGap: 1.5,
                    rowGap: 1,
                    px: { xs: 2, sm: 3 },
                    py: 1.75,
                  }}
                >
                  <Typography variant="body2" sx={{ color: 'text.secondary', flex: '1 1 260px' }}>
                    {cssMode === 'admins'
                      ? t('Eigenes CSS können auf diesem Server nur Admins verwenden.')
                      : t('Eigenes CSS ist auf diesem Server abgeschaltet.')}
                  </Typography>
                  {isAdmin && scope === 'own' && (
                    <Button
                      size="small"
                      onClick={async () => {
                        await switchScope('default');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      {t('Regeln ändern')}
                    </Button>
                  )}
                </Box>
              )}
            </SettingsSection>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {scope === 'own' && own && !readOnly && (
                <Button startIcon={<RestartAltRounded />} onClick={useDefault}>
                  {t('Standarddesign verwenden')}
                </Button>
              )}
              {scope === 'default' && changed(draft, withDefaults(data.builtinDesign)) > 0 && (
                <Button startIcon={<RestartAltRounded />} onClick={() => setDraft(withDefaults(data.builtinDesign))}>
                  {t('Auf Werkseinstellung setzen')}
                </Button>
              )}
            </Box>
          </Stack>
        </Box>

        <Box sx={{ gridArea: 'preview', position: { lg: 'sticky' }, top: { lg: 96 }, minWidth: 0 }}>
          <m.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: ease.emphasizedDecelerate }}
          >
            <Box sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: `${radius.lg}px`, bgcolor: c.surfaceContainerLow }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                {data.sampleFileId ? (
                  <TextField
                    select
                    size="small"
                    label={t('Vorschau mit')}
                    value={subject}
                    onChange={(event) => setSubject(event.target.value as 'file' | 'sample')}
                    sx={{ flex: 1, minWidth: 180 }}
                  >
                    <MenuItem value="file">{t('Deiner neuesten Datei')}</MenuItem>
                    <MenuItem value="sample">{t('Einem Beispielbild')}</MenuItem>
                  </TextField>
                ) : (
                  <Typography variant="subtitle2" sx={{ flex: 1 }}>
                    {t('Vorschau')}
                  </Typography>
                )}
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={device}
                  onChange={(_event, next: Device | null) => next && setDevice(next)}
                  aria-label={t('Gerät')}
                >
                  <ToggleButton value="desktop" aria-label={t('Computer')}>
                    <Tooltip title={t('Computer')}>
                      <DesktopWindowsRounded fontSize="small" />
                    </Tooltip>
                  </ToggleButton>
                  <ToggleButton value="phone" aria-label={t('Handy')}>
                    <Tooltip title={t('Handy')}>
                      <PhoneIphoneRounded fontSize="small" />
                    </Tooltip>
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
              <PreviewFrame
                design={previewDesignValue}
                css={previewCss}
                fileId={subject === 'file' ? data.sampleFileId : null}
                device={device}
              />
              <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1.5, px: 0.5 }}>
                {t('Die Vorschau zeigt Änderungen sofort. Gespeichert wird erst mit dem Knopf unten.')}
              </Typography>
            </Box>
          </m.div>
        </Box>
      </Box>

      <SaveBar
        count={dirty}
        busy={busy}
        onSave={save}
        onReset={() => setDraft(baseline)}
        label={scope === 'default' ? t('Standard speichern') : t('Speichern')}
      />
    </>
  );
}
