import { Modal, Stack, Text, Button, Group, CopyButton, TextInput, ActionIcon, Paper, Tooltip } from '@mantine/core';
import { IconCopy, IconCheck, IconShare } from '@tabler/icons-react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';

export default function ShareQRCode({ pin, isOpen, onClose }) {
  const { t } = useTranslation();
  const joinUrl = `${window.location.origin}/join?pin=${pin}`;
  const spectateUrl = `${window.location.origin}/join?pin=${pin}&spectate=true`;

  return (
    <Modal opened={isOpen} onClose={onClose} title={t('share.inviteTitle')} size="md" centered>
      <Stack align="center" gap="lg">
        <Paper p="lg" withBorder radius="md" bg="white">
          <QRCodeSVG
            value={joinUrl}
            size={200}
            level="M"
            includeMargin
          />
        </Paper>

        <Text size="lg" fw={700} ta="center">
          PIN: {pin}
        </Text>

        <Stack w="100%" gap="xs">
          <Text size="sm" fw={500}>{t('share.playerLink')}:</Text>
          <Group gap="xs">
            <TextInput
              value={joinUrl}
              readOnly
              style={{ flex: 1 }}
              onClick={(e) => e.target.select()}
            />
            <CopyButton value={joinUrl} timeout={2000}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? t('common.copied') : t('common.copy')}>
                  <ActionIcon color={copied ? 'teal' : 'blue'} variant="filled" onClick={copy} size="lg">
                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>

          <Text size="sm" fw={500} mt="xs">{t('share.spectatorLink')}:</Text>
          <Group gap="xs">
            <TextInput
              value={spectateUrl}
              readOnly
              style={{ flex: 1 }}
              onClick={(e) => e.target.select()}
            />
            <CopyButton value={spectateUrl} timeout={2000}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? t('common.copied') : t('common.copy')}>
                  <ActionIcon color={copied ? 'teal' : 'blue'} variant="filled" onClick={copy} size="lg">
                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
        </Stack>

        {navigator.share && (
          <Button
            leftSection={<IconShare size={16} />}
            variant="light"
            fullWidth
            onClick={() => {
              navigator.share({
                title: t('share.inviteTitle'),
                text: t('share.inviteMessage', { pin }),
                url: joinUrl,
              }).catch(() => {});
            }}
          >
            {t('share.shareButton')}
          </Button>
        )}
      </Stack>
    </Modal>
  );
}
