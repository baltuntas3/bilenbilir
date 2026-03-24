import { useState } from 'react';
import { Button } from '@mantine/core';
import { IconQrcode } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import ShareQRCode from './ShareQRCode';

export default function ShareButton({ pin, variant = 'light', size = 'md' }) {
  const [opened, setOpened] = useState(false);
  const { t } = useTranslation();

  return (
    <>
      <Button
        leftSection={<IconQrcode size={16} />}
        variant={variant}
        size={size}
        onClick={() => setOpened(true)}
      >
        {t('share.qrLink')}
      </Button>
      <ShareQRCode pin={pin} isOpen={opened} onClose={() => setOpened(false)} />
    </>
  );
}
