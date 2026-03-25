import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  TextInput,
  Button,
  Stack,
  Title,
  Text,
  Paper,
  Container,
  Center,
  PinInput,
  Group,
  Divider,
  Box,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconUsers, IconEye } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useGame } from '../context/GameContext';
import { showToast } from '../utils/toast';
import PlayerAvatar from '../components/game/PlayerAvatar';

export default function JoinGame() {
  const navigate = useNavigate();
  const { joinRoom, joinAsSpectator } = useGame();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [spectatorLoading, setSpectatorLoading] = useState(false);
  const [step, setStep] = useState('pin');
  const [pin, setPin] = useState('');
  const [autoSpectate, setAutoSpectate] = useState(false);

  useEffect(() => {
    const pinFromUrl = searchParams.get('pin');
    const spectateFromUrl = searchParams.get('spectate');

    if (pinFromUrl && pinFromUrl.length === 6 && /^\d{6}$/.test(pinFromUrl)) {
      setPin(pinFromUrl);
      setStep('nickname');
      if (spectateFromUrl === 'true') {
        setAutoSpectate(true);
      }
    }
  }, [searchParams]);

  const form = useForm({
    initialValues: {
      nickname: '',
    },
    validate: {
      nickname: (value) => {
        if (!value.trim()) return 'Nickname is required';
        if (value.trim().length < 2) return 'Nickname must be at least 2 characters';
        if (value.trim().length > 20) return 'Nickname must be at most 20 characters';
        return null;
      },
    },
  });

  const handlePinSubmit = () => {
    if (pin.length !== 6) {
      showToast.error('Please enter a 6-digit PIN');
      return;
    }
    setStep('nickname');
  };

  const handleJoin = async (values) => {
    setLoading(true);
    try {
      await joinRoom(pin, values.nickname.trim());
      showToast.success(t('game.joinedSuccess'));
      navigate('/play');
    } catch (error) {
      showToast.error(error.message || 'Failed to join game');
      if (error.message?.includes('Room not found') || error.message?.includes('Invalid PIN')) {
        setStep('pin');
        setPin('');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleJoinAsSpectator = async (values) => {
    setSpectatorLoading(true);
    try {
      await joinAsSpectator(pin, values.nickname.trim());
      showToast.success(t('game.joinedSpectator'));
      navigate('/spectate');
    } catch (error) {
      showToast.error(error.message || 'Failed to join as spectator');
      if (error.message?.includes('Room not found') || error.message?.includes('Invalid PIN')) {
        setStep('pin');
        setPin('');
      }
    } finally {
      setSpectatorLoading(false);
    }
  };

  return (
    <Container size="xs" py="xl" className="crt-on">
      <Center>
        <Paper
          shadow="md"
          p="xl"
          radius="md"
          style={{
            width: '100%',
            maxWidth: 420,
            background: 'var(--theme-surface)',
            border: '1px solid var(--theme-primary)',
            boxShadow: 'var(--theme-glow-primary)',
          }}
        >
          <Stack align="center" gap="lg">
            <Box
              style={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid var(--theme-primary)',
                boxShadow: 'var(--theme-glow-primary)',
                background: 'rgba(0, 240, 255, 0.05)',
              }}
            >
              <IconUsers size={40} style={{ color: 'var(--theme-primary)' }} />
            </Box>

            <Title
              order={3}
              className="theme-text-primary display-font display-font-sm"
              ta="center"
            >
              {t('game.joinAsPlayer')}
            </Title>

            {step === 'pin' ? (
              <Stack align="center" gap="md" style={{ width: '100%' }}>
                <Text style={{ color: 'var(--theme-text-dim)' }} ta="center">
                  {t('game.enterPin')}
                </Text>
                <PinInput
                  length={6}
                  size="md"
                  type="number"
                  value={pin}
                  onChange={setPin}
                  onComplete={handlePinSubmit}
                  placeholder=""
                  styles={{
                    root: {
                      gap: 6,
                    },
                    input: {
                      width: 42,
                      minWidth: 0,
                      background: 'var(--theme-bg)',
                      border: '1px solid var(--theme-primary)',
                      color: 'var(--theme-primary)',
                      fontFamily: 'var(--theme-font-display)',
                      fontSize: '1rem',
                      caretColor: 'var(--theme-primary)',
                      '&:focus': {
                        borderColor: 'var(--theme-primary)',
                        boxShadow: 'var(--theme-glow-primary)',
                      },
                    },
                  }}
                />
                <Button
                  fullWidth
                  size="md"
                  onClick={handlePinSubmit}
                  disabled={pin.length !== 6}
                  
                  style={{
                    boxShadow: pin.length === 6 ? 'var(--theme-glow-primary)' : 'none',
                    transition: 'box-shadow 0.3s ease',
                  }}
                >
                  {t('game.continue')}
                </Button>
              </Stack>
            ) : (
              <form onSubmit={form.onSubmit(handleJoin)} style={{ width: '100%' }}>
                <Stack gap="md">
                  <Group justify="center" gap="xs">
                    <Text style={{ color: 'var(--theme-text-dim)' }}>{t('game.pin')}:</Text>
                    <Text
                      fw={700}
                      style={{
                        fontFamily: 'var(--theme-font-display)',
                        fontSize: '0.8rem',
                        color: 'var(--theme-primary)',
                        textShadow: 'var(--theme-glow-primary)',
                      }}
                    >
                      {pin}
                    </Text>
                    <Button
                      variant="subtle"
                      size="xs"
                      
                      onClick={() => {
                        setStep('pin');
                        setPin('');
                      }}
                    >
                      {t('game.change')}
                    </Button>
                  </Group>

                  <TextInput
                    label={t('game.yourNickname')}
                    placeholder={t('game.enterNickname')}
                    size="md"
                    {...form.getInputProps('nickname')}
                    autoFocus
                    styles={{
                      input: {
                        background: 'var(--theme-bg)',
                        border: '1px solid var(--theme-border)',
                        color: 'var(--theme-text)',
                        '&:focus': {
                          borderColor: 'var(--theme-primary)',
                        },
                      },
                      label: { color: 'var(--theme-text-dim)' },
                    }}
                  />

                  {form.values.nickname.trim().length >= 2 && (
                    <Center className="slide-up">
                      <Stack align="center" gap={4}>
                        <Box
                          style={{
                            border: '2px solid var(--theme-accent)',
                            borderRadius: '50%',
                            padding: 3,
                            boxShadow: 'var(--theme-glow-accent)',
                          }}
                        >
                          <PlayerAvatar nickname={form.values.nickname.trim()} size="lg" />
                        </Box>
                        <Text size="xs" style={{ color: 'var(--theme-text-dim)' }}>
                          {t('game.yourAvatar')}
                        </Text>
                      </Stack>
                    </Center>
                  )}

                  <Button
                    type="submit"
                    fullWidth
                    size="md"
                    loading={loading}
                    
                    style={{ boxShadow: 'var(--theme-glow-primary)' }}
                  >
                    {t('game.joinAsPlayer')}
                  </Button>

                  <Divider
                    label={t('game.or')}
                    labelPosition="center"
                    color="var(--theme-border)"
                    styles={{ label: { color: 'var(--theme-text-dim)' } }}
                  />

                  <Button
                    variant="light"
                    fullWidth
                    size="md"
                    loading={spectatorLoading}
                    leftSection={<IconEye size={18} />}
                    color="violet"
                    onClick={() => form.onSubmit(handleJoinAsSpectator)()}
                    style={{ borderColor: 'var(--theme-accent)' }}
                  >
                    {t('game.joinAsSpectator')}
                  </Button>
                </Stack>
              </form>
            )}
          </Stack>
        </Paper>
      </Center>
    </Container>
  );
}
