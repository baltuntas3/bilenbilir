import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TextInput, Button, Stack, Title, Text, Paper, Container, Center, PinInput, Group } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconUsers } from '@tabler/icons-react';
import { useGame } from '../context/GameContext';
import { showToast } from '../utils/toast';

export default function JoinGame() {
  const navigate = useNavigate();
  const { joinRoom } = useGame();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('pin'); // 'pin' or 'nickname'
  const [pin, setPin] = useState('');

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
      showToast.success('Joined game successfully!');
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

  return (
    <Container size="xs" py="xl">
      <Center>
        <Paper shadow="md" p="xl" radius="md" withBorder style={{ width: '100%', maxWidth: 400 }}>
          <Stack align="center" gap="lg">
            <IconUsers size={48} stroke={1.5} />
            <Title order={2}>Join Game</Title>

            {step === 'pin' ? (
              <Stack align="center" gap="md" style={{ width: '100%' }}>
                <Text c="dimmed" ta="center">
                  Enter the 6-digit game PIN
                </Text>
                <PinInput
                  length={6}
                  size="xl"
                  type="number"
                  value={pin}
                  onChange={setPin}
                  onComplete={handlePinSubmit}
                  placeholder=""
                />
                <Button
                  fullWidth
                  size="md"
                  onClick={handlePinSubmit}
                  disabled={pin.length !== 6}
                >
                  Continue
                </Button>
              </Stack>
            ) : (
              <form onSubmit={form.onSubmit(handleJoin)} style={{ width: '100%' }}>
                <Stack gap="md">
                  <Group justify="center" gap="xs">
                    <Text c="dimmed">Game PIN:</Text>
                    <Text fw={600}>{pin}</Text>
                    <Button
                      variant="subtle"
                      size="xs"
                      onClick={() => {
                        setStep('pin');
                        setPin('');
                      }}
                    >
                      Change
                    </Button>
                  </Group>

                  <TextInput
                    label="Your Nickname"
                    placeholder="Enter your nickname"
                    size="md"
                    {...form.getInputProps('nickname')}
                    autoFocus
                  />

                  <Button
                    type="submit"
                    fullWidth
                    size="md"
                    loading={loading}
                  >
                    Join Game
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
