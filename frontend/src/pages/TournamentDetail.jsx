import { useState } from 'react';
import { Container, Title, Stack, Card, Text, Button, Group, Badge, Paper, Stepper, Table, Modal, Select } from '@mantine/core';
import { IconTrophy, IconPlus, IconTrash, IconPlayerPlay, IconArrowRight } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import tournamentService from '../services/tournamentService';
import { quizService } from '../services/quizService';
import { showToast } from '../utils/toast';
import Loading from '../components/Loading';

const stateLabels = {
  SETUP: 'Hazırlanıyor',
  IN_PROGRESS: 'Devam Ediyor',
  BETWEEN_ROUNDS: 'Tur Arası',
  COMPLETED: 'Tamamlandı'
};

export default function TournamentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [addRoundOpen, setAddRoundOpen] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState(null);

  const { data: tournament, isLoading } = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => tournamentService.getById(id),
  });

  const { data: myQuizzes } = useQuery({
    queryKey: ['my-quizzes-all'],
    queryFn: () => quizService.getMy(1, 100),
    enabled: addRoundOpen,
  });

  const addRoundMutation = useMutation({
    mutationFn: (quizId) => tournamentService.addRound(id, quizId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      setAddRoundOpen(false);
      setSelectedQuiz(null);
      showToast.success('Tur eklendi');
    },
    onError: (err) => showToast.error(err.response?.data?.message || 'Eklenemedi'),
  });

  const removeRoundMutation = useMutation({
    mutationFn: (index) => tournamentService.removeRound(id, index),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      showToast.success('Tur kaldırıldı');
    },
  });

  const startMutation = useMutation({
    mutationFn: () => tournamentService.start(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      const round = result.currentRound;
      if (round) navigate(`/host/${round.quizId}?tournament=${id}&round=0`);
    },
    onError: (err) => showToast.error(err.response?.data?.message || 'Başlatılamadı'),
  });

  const nextRoundMutation = useMutation({
    mutationFn: () => tournamentService.nextRound(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      const round = result.currentRound;
      if (round) navigate(`/host/${round.quizId}?tournament=${id}&round=${tournament.currentRoundIndex + 1}`);
    },
    onError: (err) => showToast.error(err.response?.data?.message || 'Geçilemedi'),
  });

  if (isLoading) return <Loading />;
  if (!tournament) return <Text>Turnuva bulunamadı</Text>;

  const quizOptions = (myQuizzes?.quizzes || []).map(q => ({
    value: q.id || q._id,
    label: q.title
  }));

  const leaderboard = tournament.playerScores
    ? Object.entries(tournament.playerScores)
        .map(([nickname, data]) => ({ nickname, ...data }))
        .sort((a, b) => b.totalScore - a.totalScore)
    : [];

  return (
    <Container size="lg" py="xl">
      <Group justify="space-between" mb="xl">
        <Group>
          <IconTrophy size={28} />
          <Title order={2}>{tournament.name}</Title>
          <Badge size="lg">{stateLabels[tournament.state]}</Badge>
        </Group>
      </Group>

      <Stack gap="lg">
        {/* Rounds */}
        <Card withBorder>
          <Group justify="space-between" mb="md">
            <Text fw={600} size="lg">Turlar</Text>
            {tournament.state === 'SETUP' && (
              <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setAddRoundOpen(true)}>
                Tur Ekle
              </Button>
            )}
          </Group>

          <Stepper active={tournament.currentRoundIndex} orientation="vertical">
            {tournament.rounds.map((round, i) => (
              <Stepper.Step
                key={i}
                label={`Tur ${i + 1}: ${round.quizTitle}`}
                description={round.status === 'completed' ? 'Tamamlandı' : round.status === 'in_progress' ? 'Devam ediyor' : 'Bekliyor'}
                completedIcon={round.status === 'completed' ? undefined : null}
              >
                <Group gap="xs">
                  {tournament.state === 'SETUP' && (
                    <Button size="xs" color="red" variant="light"
                      leftSection={<IconTrash size={14} />}
                      onClick={() => removeRoundMutation.mutate(i)}>
                      Kaldır
                    </Button>
                  )}
                </Group>
              </Stepper.Step>
            ))}
          </Stepper>
        </Card>

        {/* Actions */}
        {tournament.state === 'SETUP' && tournament.rounds.length >= 2 && (
          <Button size="lg" leftSection={<IconPlayerPlay size={18} />} onClick={() => startMutation.mutate()}>
            Turnuvayı Başlat
          </Button>
        )}

        {tournament.state === 'BETWEEN_ROUNDS' && (
          <Button size="lg" leftSection={<IconArrowRight size={18} />} onClick={() => nextRoundMutation.mutate()}>
            Sonraki Tur
          </Button>
        )}

        {/* Overall Leaderboard */}
        {leaderboard.length > 0 && (
          <Card withBorder>
            <Text fw={600} size="lg" mb="md">Genel Sıralama</Text>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>#</Table.Th>
                  <Table.Th>Oyuncu</Table.Th>
                  <Table.Th>Toplam Puan</Table.Th>
                  <Table.Th>Oynanan Tur</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {leaderboard.map((entry, i) => (
                  <Table.Tr key={entry.nickname}>
                    <Table.Td>{i + 1}</Table.Td>
                    <Table.Td>{entry.nickname}</Table.Td>
                    <Table.Td fw={700}>{entry.totalScore}</Table.Td>
                    <Table.Td>{entry.roundsPlayed}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        )}
      </Stack>

      {/* Add Round Modal */}
      <Modal opened={addRoundOpen} onClose={() => setAddRoundOpen(false)} title="Tur Ekle" centered>
        <Stack>
          <Select
            label="Quiz Seçin"
            placeholder="Bir quiz seçin"
            data={quizOptions}
            value={selectedQuiz}
            onChange={setSelectedQuiz}
            searchable
          />
          <Button onClick={() => addRoundMutation.mutate(selectedQuiz)} disabled={!selectedQuiz} loading={addRoundMutation.isPending}>
            Ekle
          </Button>
        </Stack>
      </Modal>
    </Container>
  );
}
