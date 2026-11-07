import { useEffect, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import type {
  DomainState,
  LegalConfig,
  LegalImprintData,
  LegalMode,
  LegalPart,
  LegalPreview,
  LegalPrivacyData,
  UserDomain,
} from '../../lib/types';
import { ApiError, errorMessage, previewDomainLegal, saveDomainLegal } from '../../lib/api';
import { LegalText } from '../../components/LegalText';
import { useToast } from '../../components/Toaster';
import { c, radius } from '../../theme/tokens';
import { language as uiLanguage, t } from '../../lib/i18n';

type Kind = 'imprint' | 'privacy';

interface FieldSpec<T> {
  key: keyof T & string;
  label: string;
  hint?: string;
  required?: boolean;
  multiline?: boolean;
  type?: 'email' | 'tel';
  half?: boolean;
  autoComplete?: string;
}

const IMPRINT_FIELDS: Array<FieldSpec<LegalImprintData>> = [
  { key: 'name', label: t('Name oder Firma'), required: true, autoComplete: 'name' },
  { key: 'representative', label: t('Vertreten durch'), hint: t('Nur bei Firmen und Vereinen, etwa die Geschäftsführung.') },
  { key: 'street', label: t('Straße und Hausnummer'), required: true, autoComplete: 'street-address' },
  { key: 'postcode', label: t('Postleitzahl'), required: true, half: true, autoComplete: 'postal-code' },
  { key: 'city', label: t('Ort'), required: true, half: true, autoComplete: 'address-level2' },
  { key: 'country', label: t('Land'), required: true, autoComplete: 'country-name' },
  { key: 'email', label: t('E-Mail-Adresse'), required: true, type: 'email', half: true, autoComplete: 'email' },
  { key: 'phone', label: t('Telefon'), type: 'tel', half: true, autoComplete: 'tel' },
  { key: 'register', label: t('Registereintrag'), hint: t('Zum Beispiel Amtsgericht Berlin, HRB 12345.') },
  { key: 'vatId', label: t('Umsatzsteuer-ID'), hint: t('Nur wenn du eine hast.') },
  {
    key: 'responsible',
    label: t('Verantwortlich für den Inhalt'),
    hint: t('Nur nötig bei journalistisch-redaktionellen Inhalten, etwa einem Blog. Name und Anschrift.'),
    multiline: true,
  },
  { key: 'extra', label: t('Weitere Angaben'), multiline: true },
];

const PRIVACY_FIELDS: Array<FieldSpec<LegalPrivacyData>> = [
  {
    key: 'controller',
    label: t('Verantwortliche Stelle'),
    hint: t('Name und Anschrift. Leer lassen, dann gelten die Angaben aus dem Impressum.'),
    multiline: true,
  },
  {
    key: 'email',
    label: t('E-Mail für Datenschutzfragen'),
    type: 'email',
    hint: t('Leer lassen, dann gilt die E-Mail-Adresse aus dem Impressum.'),
  },
  { key: 'dpo', label: t('Datenschutzbeauftragte Person'), hint: t('Nur wenn du eine benennen musst.'), multiline: true },
  {
    key: 'authority',
    label: t('Zuständige Aufsichtsbehörde'),
    hint: t('Leer lassen, dann steht dort nur das allgemeine Beschwerderecht.'),
    multiline: true,
  },
  {
    key: 'extra',
    label: t('Weitere Hinweise'),
    hint: t('Zum Beispiel zu weiteren Diensten, die du auf der Domain nutzt.'),
    multiline: true,
  },
];

const MIN_TEXT: Record<Kind, number> = { imprint: 40, privacy: 80 };

const emptyConfig = (): LegalConfig => ({
  imprint: { mode: 'template', data: { country: uiLanguage === 'en' ? 'Germany' : 'Deutschland' } },
  privacy: { mode: 'template', data: {} },
});

const clone = (config: LegalConfig | null): LegalConfig =>
  config
    ? {
        imprint: { ...config.imprint, data: { ...(config.imprint.data || {}) } },
        privacy: { ...config.privacy, data: { ...(config.privacy.data || {}) } },
      }
    : emptyConfig();

const filled = (value: string | undefined) => Boolean(value && value.trim());

function missingImprint(part: LegalPart<LegalImprintData>): string[] {
  if (part.mode === 'url') return filled(part.url) ? [] : ['url'];
  if (part.mode === 'text') return (part.text || '').trim().length >= MIN_TEXT.imprint ? [] : ['text'];
  const data = part.data || {};
  return IMPRINT_FIELDS.filter((field) => field.required && !filled(data[field.key])).map((field) => field.key);
}

function missingPrivacy(config: LegalConfig): string[] {
  const part = config.privacy;
  if (part.mode === 'url') return filled(part.url) ? [] : ['url'];
  if (part.mode === 'text') return (part.text || '').trim().length >= MIN_TEXT.privacy ? [] : ['text'];
  const data = part.data || {};
  const imprintReady = config.imprint.mode === 'template' && !missingImprint(config.imprint).length;
  const missing: string[] = [];
  if (!filled(data.controller) && !imprintReady) missing.push('controller');
  if (!filled(data.email) && !(config.imprint.mode === 'template' && filled(config.imprint.data?.email))) missing.push('email');
  return missing;
}

function ModePicker({ value, onChange, kind }: { value: LegalMode; onChange: (mode: LegalMode) => void; kind: Kind }) {
  return (
    <Box>
      <ToggleButtonGroup exclusive size="small" value={value} onChange={(_event, next) => next && onChange(next)} sx={{ flexWrap: 'wrap' }}>
        <ToggleButton value="template">{t('Vorlage ausfüllen')}</ToggleButton>
        <ToggleButton value="text">{t('Eigener Text')}</ToggleButton>
        <ToggleButton value="url">{t('Link zu deiner Seite')}</ToggleButton>
      </ToggleButtonGroup>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
        {value === 'template'
          ? kind === 'imprint'
            ? t('Du trägst deine Daten ein, daraus entsteht ein Impressum nach § 5 DDG.')
            : t(
                'Du trägst nur ein, was sich von deinem Impressum unterscheidet. Der Rest beschreibt, was der Server technisch verarbeitet.'
              )
          : value === 'text'
            ? t(
                'Füge einen fertigen Text ein, etwa aus einem Generator oder von deiner Anwaltskanzlei. Zeilen mit ## am Anfang werden Überschriften.'
              )
            : t('Die Seite unter dieser Domain leitet auf deine eigene Seite weiter.')}
      </Typography>
    </Box>
  );
}

function Fields<T extends object>({
  specs,
  data,
  missing,
  showMissing,
  onChange,
  idPrefix,
}: {
  specs: Array<FieldSpec<T>>;
  data: T;
  missing: string[];
  showMissing: boolean;
  onChange: (key: keyof T & string, value: string) => void;
  idPrefix: string;
}) {
  const values = data as Record<string, string | undefined>;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
      {specs.map((field) => {
        const error = showMissing && missing.includes(field.key);
        return (
          <TextField
            key={field.key}
            id={`${idPrefix}-${field.key}`}
            label={field.label}
            value={values[field.key] || ''}
            onChange={(event) => onChange(field.key, event.target.value)}
            required={field.required}
            type={field.type || 'text'}
            multiline={field.multiline}
            minRows={field.multiline ? 2 : undefined}
            error={error}
            helperText={error ? t('Fehlt noch') : field.hint || ' '}
            autoComplete={field.autoComplete || 'off'}
            sx={{ gridColumn: field.half ? undefined : { sm: '1 / -1' } }}
          />
        );
      })}
    </Box>
  );
}

function PartEditor<T extends object>({
  kind,
  part,
  specs,
  missing,
  showMissing,
  onPart,
}: {
  kind: Kind;
  part: LegalPart<T>;
  specs: Array<FieldSpec<T>>;
  missing: string[];
  showMissing: boolean;
  onPart: (next: LegalPart<T>) => void;
}) {
  return (
    <Box sx={{ display: 'grid', gap: 2.5 }}>
      <ModePicker kind={kind} value={part.mode} onChange={(mode) => onPart({ ...part, mode })} />
      {part.mode === 'template' && (
        <Fields
          specs={specs}
          data={(part.data || {}) as T}
          missing={missing}
          showMissing={showMissing}
          idPrefix={`legal-${kind}`}
          onChange={(key, value) => onPart({ ...part, data: { ...((part.data || {}) as T), [key]: value } })}
        />
      )}
      {part.mode === 'text' && (
        <TextField
          label={kind === 'imprint' ? t('Impressum') : t('Datenschutzerklärung')}
          value={part.text || ''}
          onChange={(event) => onPart({ ...part, text: event.target.value })}
          multiline
          minRows={10}
          maxRows={26}
          fullWidth
          error={showMissing && missing.includes('text')}
          helperText={
            showMissing && missing.includes('text')
              ? t('Der Text ist zu kurz. Er braucht mindestens {count} Zeichen.', { count: MIN_TEXT[kind] })
              : t('{count} Zeichen', { count: (part.text || '').length })
          }
        />
      )}
      {part.mode === 'url' && (
        <TextField
          label={t('Adresse deiner Seite')}
          type="url"
          placeholder={kind === 'imprint' ? 'https://beispiel.de/impressum' : 'https://beispiel.de/datenschutz'}
          value={part.url || ''}
          onChange={(event) => onPart({ ...part, url: event.target.value })}
          fullWidth
          error={showMissing && missing.includes('url')}
          helperText={showMissing && missing.includes('url') ? t('Fehlt noch') : t('Die Seite muss von überall erreichbar sein.')}
          slotProps={{ htmlInput: { spellCheck: false, autoCapitalize: 'none' } }}
        />
      )}
    </Box>
  );
}

function Preview({ domain, config }: { domain: UserDomain; config: LegalConfig }) {
  const [language, setLanguage] = useState<'de' | 'en'>(uiLanguage === 'en' ? 'en' : 'de');
  const [preview, setPreview] = useState<LegalPreview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(config);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    previewDomainLegal(domain.id, config, language)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((failure) => {
        if (!cancelled) setError(errorMessage(failure));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [domain.id, key, language]);

  const page = (kind: Kind, title: string) => {
    const part = config[kind];
    return (
      <Box
        component="section"
        sx={{
          p: { xs: 2, sm: 3 },
          borderRadius: `${radius.lg}px`,
          bgcolor: c.surfaceContainerLow,
          border: `1px solid ${c.outlineVariant}`,
        }}
      >
        <Typography variant="subtitle2" component="h3" sx={{ color: 'text.secondary' }}>
          {title}
        </Typography>
        {part.mode === 'url' ? (
          <Typography variant="body2" sx={{ mt: 1 }}>
            {part.url ? t('Leitet weiter auf {url}', { url: part.url }) : t('Es fehlt noch die Adresse.')}
          </Typography>
        ) : preview && preview[kind] ? (
          <Box sx={{ mt: 1.5 }}>
            <LegalText text={preview[kind] as string} dense />
          </Box>
        ) : (
          <Typography variant="body2" sx={{ mt: 1, color: c.error }}>
            {t('Noch unvollständig, deshalb gibt es noch keine Vorschau.')}
          </Typography>
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <ToggleButtonGroup exclusive size="small" value={language} onChange={(_event, next) => next && setLanguage(next)}>
          <ToggleButton value="de">{t('Deutsch')}</ToggleButton>
          <ToggleButton value="en">{t('Englisch')}</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1, minWidth: 200 }}>
          {t('Besucher sehen die Sprache, die ihr Browser bevorzugt. Eigene Texte erscheinen in beiden Sprachen so, wie du sie eingibst.')}
        </Typography>
        {loading && <CircularProgress size={18} />}
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {page('imprint', t('Impressum'))}
      {page('privacy', t('Datenschutzerklärung'))}
    </Box>
  );
}

export function DomainLegalDialog({
  domain,
  others,
  open,
  onClose,
  onSaved,
}: {
  domain: UserDomain;
  others: UserDomain[];
  open: boolean;
  onClose: () => void;
  onSaved: (state: DomainState) => void;
}) {
  const toast = useToast();
  const phone = useMediaQuery('(max-width:599.95px)', { noSsr: true });
  const [config, setConfig] = useState<LegalConfig>(() => clone(domain.legal.config));
  const [tab, setTab] = useState<'imprint' | 'privacy' | 'preview'>('imprint');
  const [showMissing, setShowMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sources = others.filter((item) => item.id !== domain.id && item.legal.config && item.legal.complete);

  const missing = useMemo(() => ({ imprint: missingImprint(config.imprint), privacy: missingPrivacy(config) }), [config]);
  const complete = !missing.imprint.length && !missing.privacy.length;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await saveDomainLegal(domain.id, config);
      onSaved(result.domains);
      if (result.domain.legal.complete) {
        toast(t('Impressum und Datenschutzerklärung für {domain} gespeichert', { domain: domain.domain }), { variant: 'success' });
        onClose();
      } else {
        setShowMissing(true);
        toast(t('Gespeichert, aber noch unvollständig'), { variant: 'info' });
      }
    } catch (failure) {
      setError(errorMessage(failure));
      if (failure instanceof ApiError && failure.field) {
        setShowMissing(true);
        setTab(failure.field.startsWith('privacy') ? 'privacy' : 'imprint');
      }
    } finally {
      setBusy(false);
    }
  };

  const copyFrom = (id: number) => {
    const source = sources.find((item) => item.id === id);
    if (source) setConfig(clone(source.legal.config));
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md" fullScreen={phone} scroll="paper">
      <DialogTitle sx={{ pb: 0 }}>
        {t('Rechtliches für {domain}', { domain: domain.domain })}
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          {t(
            'Wer die Domain betreibt, braucht ein eigenes Impressum und eine Datenschutzerklärung. Beides erscheint unter /impressum und /datenschutz auf der Domain.'
          )}
        </Typography>
        <Tabs value={tab} onChange={(_event, next) => setTab(next)} sx={{ mt: 1.5 }} variant="scrollable" allowScrollButtonsMobile>
          <Tab value="imprint" label={missing.imprint.length && showMissing ? t('Impressum (unvollständig)') : t('Impressum')} />
          <Tab value="privacy" label={missing.privacy.length && showMissing ? t('Datenschutz (unvollständig)') : t('Datenschutz')} />
          <Tab value="preview" label={t('Vorschau')} />
        </Tabs>
      </DialogTitle>
      <DialogContent dividers sx={{ pt: 3 }}>
        <Box sx={{ display: 'grid', gap: 3 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {sources.length > 0 && tab !== 'preview' && (
            <TextField
              select
              size="small"
              label={t('Angaben übernehmen von')}
              value=""
              onChange={(event) => copyFrom(Number(event.target.value))}
              sx={{ maxWidth: 360 }}
            >
              {sources.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.domain}
                </MenuItem>
              ))}
            </TextField>
          )}
          {tab === 'imprint' && (
            <PartEditor<LegalImprintData>
              kind="imprint"
              part={config.imprint}
              specs={IMPRINT_FIELDS}
              missing={missing.imprint}
              showMissing={showMissing}
              onPart={(imprint) => setConfig((current) => ({ ...current, imprint }))}
            />
          )}
          {tab === 'privacy' && (
            <PartEditor<LegalPrivacyData>
              kind="privacy"
              part={config.privacy}
              specs={PRIVACY_FIELDS}
              missing={missing.privacy}
              showMissing={showMissing}
              onPart={(privacy) => setConfig((current) => ({ ...current, privacy }))}
            />
          )}
          {tab === 'preview' && <Preview domain={domain} config={config} />}
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t(
              'Die Vorlage hilft dir beim Start, ersetzt aber keine Rechtsberatung. Prüfe, ob die Angaben für deine Seite vollständig sind.'
            )}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ flex: 1, minWidth: 160, color: complete ? c.success : 'text.secondary' }}>
          {complete ? t('Alles da, was nötig ist.') : t('Noch nicht vollständig.')}
        </Typography>
        <Button onClick={onClose} disabled={busy}>
          {t('Abbrechen')}
        </Button>
        {tab !== 'privacy' && tab !== 'preview' && (
          <Button onClick={() => setTab('privacy')} disabled={busy}>
            {t('Weiter zum Datenschutz')}
          </Button>
        )}
        <Button
          variant="contained"
          onClick={save}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {t('Speichern')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
