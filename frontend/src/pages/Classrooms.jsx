import { useState } from 'react';
import { Container, Title, Stack, Card, Text, Button, Group, Badge, SimpleGrid, Modal, TextInput, Textarea, Paper, CopyButton, ActionIcon, Tooltip } from '@mantine/core';
import { IconSchool, IconPlus, IconTrash, IconCopy, IconCheck, IconUsers } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import classroomService from '../services/classroomService';
import { showToast } from '../utils/toast';
import Loading from '../components/Loading';

export default function Classrooms() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['my-classrooms'],
    queryFn: classroomService.getMyClassrooms,
  });

  const createMutation = useMutation({
    mutationFn: (data) => classroomService.create(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['my-classrooms'] });
      setCreateOpen(false);
      setName('');
      setDescription('');
      navigate(`/classrooms/${result._id}`);
    },
    onError: (err) => showToast.error(err.response?.data?.message || 'Sınıf oluşturulamadı'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => classroomService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-classrooms'] });
      showToast.success('Sınıf silindi');
    },
  });

  if (isLoading) return <Loading />;
  const classrooms = data?.classrooms || [];

  return (
    <Container size="lg" py="xl">
      <Group justify="space-between" mb="xl">
        <Group>
          <IconSchool size={28} />
          <Title order={2}>Sınıflarım</Title>
        </Group>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateOpen(true)}>
          Yeni Sınıf
        </Button>
      </Group>

      {classrooms.length === 0 ? (
        <Paper p="xl" withBorder ta="center">
          <Text c="dimmed">Henüz sınıf oluşturmadınız.</Text>
        </Paper>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
          {classrooms.map((c) => (
            <Card key={c._id} withBorder shadow="sm" padding="lg">
              <Group justify="space-between" mb="xs">
                <Text fw={600} truncate>{c.name}</Text>
                <Badge leftSection={<IconUsers size={12} />}>{c.students?.length || 0} öğrenci</Badge>
              </Group>
              {c.description && <Text size="sm" c="dimmed" lineClamp={2} mb="xs">{c.description}</Text>}
              <Group gap="xs" mb="md">
                <Text size="xs" c="dimmed">Kod: {c.joinCode}</Text>
                <CopyButton value={c.joinCode} timeout={2000}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? 'Kopyalandı!' : 'Kodu kopyala'}>
                      <ActionIcon size="xs" variant="subtle" onClick={copy}>
                        {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                      </ActionIcon>
                    </Tooltip>
                  )}
                </CopyButton>
              </Group>
              <Group>
                <Button size="xs" onClick={() => navigate(`/classrooms/${c._id}`)}>Yönet</Button>
                <ActionIcon color="red" variant="light" onClick={() => deleteMutation.mutate(c._id)}>
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Yeni Sınıf" centered>
        <Stack>
          <TextInput label="Sınıf Adı" placeholder="örn: 10-A Matematik" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          <Textarea label="Açıklama" placeholder="Opsiyonel" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          <Button onClick={() => createMutation.mutate({ name, description })} loading={createMutation.isPending} disabled={!name.trim()}>
            Oluştur
          </Button>
        </Stack>
      </Modal>
    </Container>
  );
}
