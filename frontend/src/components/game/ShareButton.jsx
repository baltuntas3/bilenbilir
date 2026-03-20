import { useState } from 'react';
import { Button } from '@mantine/core';
import { IconQrcode } from '@tabler/icons-react';
import ShareQRCode from './ShareQRCode';

export default function ShareButton({ pin, variant = 'light', size = 'md' }) {
  const [opened, setOpened] = useState(false);

  return (
    <>
      <Button
        leftSection={<IconQrcode size={16} />}
        variant={variant}
        size={size}
        onClick={() => setOpened(true)}
      >
        QR Kod / Link Paylaş
      </Button>
      <ShareQRCode pin={pin} isOpen={opened} onClose={() => setOpened(false)} />
    </>
  );
}
