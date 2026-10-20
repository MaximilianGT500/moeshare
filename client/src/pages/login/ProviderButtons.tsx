import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import type { Provider } from '../../lib/types';
import { authUrl, providerIcon } from '../../lib/providers';

export function ProviderButtons({
  providers,
  verb,
  params,
  disabled = false,
}: {
  providers: Provider[];
  verb: string;
  params: Record<string, string | undefined>;
  disabled?: boolean;
}) {
  if (!providers.length) return null;
  const compact = providers.length > 2;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: compact ? 'repeat(2, minmax(0, 1fr))' : '1fr', gap: 1.5 }}>
      {providers.map((provider, index) => (
        <Button
          key={provider.key}
          variant="outlined"
          size="large"
          fullWidth
          href={authUrl(provider.key, params)}
          disabled={disabled}
          startIcon={providerIcon(provider.key)}
          sx={{
            minWidth: 0,
            px: 2,
            gridColumn: compact && providers.length % 2 === 1 && index === providers.length - 1 ? '1 / -1' : undefined,
            '& .MuiButton-startIcon': { flexShrink: 0 },
          }}
        >
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {compact ? provider.label : `${verb.replace('{name}', provider.label)}`}
          </Box>
        </Button>
      ))}
    </Box>
  );
}
