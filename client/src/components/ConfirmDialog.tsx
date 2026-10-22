import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { GrowTransition } from './transitions';
import { c } from '../theme/tokens';
import { t } from '../lib/i18n';

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  icon?: ReactNode;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<(value: boolean) => void>(() => {});

  const confirm = useCallback<ConfirmFn>((next) => {
    setOptions(next);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (value: boolean) => {
    setOpen(false);
    resolver.current(value);
  };

  const destructive = options?.destructive ?? true;
  const icon = options?.icon ?? (destructive ? <DeleteOutlineRounded /> : null);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={open}
        onClose={() => close(false)}
        maxWidth="xs"
        fullWidth
        slots={{ transition: GrowTransition }}
        aria-labelledby="confirm-title"
        sx={{ zIndex: 1550 }}
      >
        {options && (
          <>
            {icon && (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  pt: 2,
                  color: destructive ? c.error : c.secondary,
                  '& svg': { fontSize: 28 },
                }}
              >
                {icon}
              </Box>
            )}
            <DialogTitle id="confirm-title" sx={{ textAlign: icon ? 'center' : 'left' }}>
              {options.title}
            </DialogTitle>
            <DialogContent>
              <DialogContentText component="div" sx={{ textAlign: icon ? 'center' : 'left', wordBreak: 'break-word' }}>
                {options.message}
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => close(false)} autoFocus={destructive}>
                {options.cancelLabel ?? t('Abbrechen')}
              </Button>
              <Button variant="contained" color={destructive ? 'error' : 'primary'} onClick={() => close(true)} autoFocus={!destructive}>
                {options.confirmLabel ?? t('Löschen')}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}
