import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Button, { type ButtonProps } from '@mui/material/Button';
import IconButton, { type IconButtonProps } from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import LinkRounded from '@mui/icons-material/LinkRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import { copyText } from '../lib/clipboard';
import { useToast } from './Toaster';

function useCopy(value: string, message: string) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    const ok = await copyText(value);
    if (ok) {
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
      toast(message, { variant: 'success', duration: 2400 });
    } else {
      toast('Kopieren hat nicht geklappt. Markiere den Link und kopiere ihn manuell.', { variant: 'error' });
    }
  };
  return { copied, copy };
}

function CopyGlyph({ copied, icon }: { copied: boolean; icon?: ReactNode }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <m.span
        key={copied ? 'done' : 'idle'}
        initial={{ scale: 0.4, opacity: 0, rotate: copied ? -45 : 0 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        exit={{ scale: 0.4, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 520, damping: 26 }}
        style={{ display: 'inline-flex' }}
      >
        {copied ? <CheckRounded fontSize="inherit" /> : (icon ?? <LinkRounded fontSize="inherit" />)}
      </m.span>
    </AnimatePresence>
  );
}

export function CopyIconButton({
  value,
  label = 'Link kopieren',
  message = 'Link kopiert',
  icon,
  ...props
}: { value: string; label?: string; message?: string; icon?: ReactNode } & Omit<IconButtonProps, 'onClick' | 'value'>) {
  const { copied, copy } = useCopy(value, message);
  return (
    <Tooltip title={copied ? 'Kopiert' : label}>
      <IconButton
        aria-label={label}
        {...props}
        onClick={(event) => {
          event.stopPropagation();
          copy();
        }}
      >
        <CopyGlyph copied={copied} icon={icon} />
      </IconButton>
    </Tooltip>
  );
}

export function CopyTextButton({
  value,
  children,
  message = 'Link kopiert',
  icon,
  ...props
}: { value: string; message?: string; icon?: ReactNode } & Omit<ButtonProps, 'onClick' | 'value'>) {
  const { copied, copy } = useCopy(value, message);
  return (
    <Button {...props} onClick={copy} startIcon={<CopyGlyph copied={copied} icon={icon} />}>
      {copied ? 'Kopiert' : children}
    </Button>
  );
}
