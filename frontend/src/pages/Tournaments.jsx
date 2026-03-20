import { useState } from 'react';
import { Container, Title, Stack, Card, Text, Button, Group, Badge, SimpleGrid, Modal, TextInput, ActionIcon, Paper } from '@mantine/core';
import { IconTrophy, IconPlus, IconTrash, IconPlayerPlay } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import tournamentService from '../services/tournamentService';
import { showToast } from '../utils/toast';
import Loading from '../components/Loading';

const stateLabels = {
  SETUP: 'Hazırlanıyor',
  IN_PROGRESS: 'Devam Ediyor',
  BETWEEN_ROUNDS: 'Tur Arası',
  COMPLETED: 'Tamamlandı'
};

const stateColors = {
  SETUP: 'blue',
  IN_PROGRESS: 'green',
  BETWEEN_ROUNDS: 'yellow',
  COMPLETED: 'gray'
};

export default function Tournaments() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['my-tournaments'],
    queryFn: tournamentService.getMyTournaments,
  });

  const createMutation = useMutation({
    mutationFn: (data) => tournamentService.create(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['my-tournaments'] });
      setCreateOpen(false);
      setName('');
      navigate(`/tournaments/${result.id}`);
    },
    onError: (err) => showToast.error(err.response?.data?.message || 'Turnuva oluşturulamadı'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => tournamentService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-tournaments'] });
      showToast.success('Turnuva silindi');
    },
    onError: (err) => showToast.error(err.response?.data?.message || 'Silinemedi'),
  });

  if (isLoading) return <Loading />;

  const tournaments = data?.tournaments || [];

  return (
    <Container size="lg" py="xl">
      <Group justify="space-between" mb="xl">
        <Group>
          <IconTrophy size={28} />
          <Title order={2}>Turnuvalar</Title>
        </Group>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateOpen(true)}>
          Yeni Turnuva
        </Button>
      </Group>

      {tournaments.length === 0 ? (
        <Paper p="xl" withBorder ta="center">
          <Text c="dimmed">Henüz turnuva oluşturmadınız.</Text>
        </Paper>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
          {tournaments.map((t) => (
            <Card key={t.id} withBorder shadow="sm" padding="lg">
              <Group justify="space-between" mb="xs">
                <Text fw={600} truncate>{t.name}</Text>
                <Badge color={stateColors[t.state]}>{stateLabels[t.state]}</Badge>
              </Group>
              <Text size="sm" c="dimmed" mb="md">
                {t.rounds.length} tur
              </Text>
              <Group>
                <Button
                  size="xs"
                  leftSection={<IconPlayerPlay size={14} />}
                  onClick={() => navigate(`/tournaments/${t.id}`)}
                >
                  {t.state === 'SETUP' ? 'Düzenle' : 'Görüntüle'}
                </Button>
                {t.state === 'SETUP' && (
                  <ActionIcon color="red" variant="light" onClick={() => deleteMutation.mutate(t.id)}>
                    <IconTrash size={14} />
                  </ActionIcon>
                )}
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Yeni Turnuva" centered>
        <Stack>
          <TextInput
            label="Turnuva Adı"
            placeholder="Turnuva adını girin"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
          />
          <Button
            onClick={() => createMutation.mutate({ name, quizIds: [] })}
            loading={createMutation.isPending}
            disabled={!name.trim()}
          >
            Oluştur
          </Button>
        </Stack>
      </Modal>
    </Container>
  );
}
