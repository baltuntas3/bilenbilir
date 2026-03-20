import { useState } from 'react';
import { Container, Title, Stack, Card, Text, Button, Group, Badge, Table, Modal, Select, ActionIcon, Tabs, CopyButton, Tooltip, TextInput } from '@mantine/core';
import { IconSchool, IconPlus, IconTrash, IconCopy, IconCheck, IconUsers, IconBook } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import classroomService from '../services/classroomService';
import { quizService } from '../services/quizService';
import { showToast } from '../utils/toast';
import Loading from '../components/Loading';

export default function ClassroomDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [dueDate, setDueDate] = useState('');

  const { data: classroom, isLoading } = useQuery({
    queryKey: ['classroom', id],
    queryFn: () => classroomService.getById(id),
  });

  const { data: myQuizzes } = useQuery({
    queryKey: ['my-quizzes-for-assign'],
    queryFn: () => quizService.getMy(1, 100),
    enabled: assignOpen,
  });

  const removeStudentMutation = useMutation({
    mutationFn: (nickname) => classroomService.removeStudent(id, nickname),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classroom', id] });
      showToast.success('Öğrenci çıkarıldı');
    },
  });

  const assignQuizMutation = useMutation({
    mutationFn: ({ quizId, dueDate }) => classroomService.assignQuiz(id, quizId, dueDate || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classroom', id] });
      setAssignOpen(false);
      setSelectedQuiz(null);
      setDueDate('');
      showToast.success('Quiz atandı');
    },
    onError: (err) => showToast.error(err.response?.data?.message || 'Atanamadı'),
  });

  const removeAssignmentMutation = useMutation({
    mutationFn: (index) => classroomService.removeAssignment(id, index),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classroom', id] });
      showToast.success('Ödev kaldırıldı');
    },
  });

  if (isLoading) return <Loading />;
  if (!classroom) return <Text>Sınıf bulunamadı</Text>;

  const quizOptions = (myQuizzes?.quizzes || []).map(q => ({ value: q.id, label: q.title }));

  return (
    <Container size="lg" py="xl">
      <Group justify="space-between" mb="xl">
        <Group>
          <IconSchool size={28} />
          <Title order={2}>{classroom.name}</Title>
        </Group>
        <Group>
          <Text size="sm" c="dimmed">Katılım Kodu:</Text>
          <Badge size="lg" variant="light">{classroom.joinCode}</Badge>
          <CopyButton value={classroom.joinCode} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Kopyalandı!' : 'Kopyala'}>
                <ActionIcon variant="subtle" onClick={copy}>
                  {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>
      </Group>

      {classroom.description && <Text c="dimmed" mb="lg">{classroom.description}</Text>}

      <Tabs defaultValue="students">
        <Tabs.List>
          <Tabs.Tab value="students" leftSection={<IconUsers size={14} />}>
            Öğrenciler ({classroom.students?.length || 0})
          </Tabs.Tab>
          <Tabs.Tab value="assignments" leftSection={<IconBook size={14} />}>
            Ödevler ({classroom.assignedQuizzes?.length || 0})
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="students" pt="md">
          <Card withBorder>
            {(!classroom.students || classroom.students.length === 0) ? (
              <Text c="dimmed" ta="center" py="md">Henüz öğrenci yok. Katılım kodunu paylaşın.</Text>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>#</Table.Th>
                    <Table.Th>Takma Ad</Table.Th>
                    <Table.Th>Katılım Tarihi</Table.Th>
                    <Table.Th></Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {classroom.students.map((s, i) => (
                    <Table.Tr key={s.nickname}>
                      <Table.Td>{i + 1}</Table.Td>
                      <Table.Td>{s.nickname}</Table.Td>
                      <Table.Td>{new Date(s.joinedAt).toLocaleDateString('tr-TR')}</Table.Td>
                      <Table.Td>
                        <ActionIcon color="red" variant="light" size="sm"
                          onClick={() => removeStudentMutation.mutate(s.nickname)}>
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="assignments" pt="md">
          <Stack>
            <Group justify="flex-end">
              <Button size="sm" leftSection={<IconPlus size={14} />} onClick={() => setAssignOpen(true)}>
                Quiz Ata
              </Button>
            </Group>
            <Card withBorder>
              {(!classroom.assignedQuizzes || classroom.assignedQuizzes.length === 0) ? (
                <Text c="dimmed" ta="center" py="md">Henüz ödev atanmadı.</Text>
              ) : (
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Quiz</Table.Th>
                      <Table.Th>Atanma Tarihi</Table.Th>
                      <Table.Th>Son Tarih</Table.Th>
                      <Table.Th>Tamamlayan</Table.Th>
                      <Table.Th></Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {classroom.assignedQuizzes.map((a, i) => (
                      <Table.Tr key={i}>
                        <Table.Td>{a.quiz?.title || 'Silinmiş Quiz'}</Table.Td>
                        <Table.Td>{new Date(a.assignedAt).toLocaleDateString('tr-TR')}</Table.Td>
                        <Table.Td>
                          {a.dueDate ? new Date(a.dueDate).toLocaleDateString('tr-TR') : '-'}
                        </Table.Td>
                        <Table.Td>
                          <Badge>{a.completedBy?.length || 0} / {classroom.students?.length || 0}</Badge>
                        </Table.Td>
                        <Table.Td>
                          <ActionIcon color="red" variant="light" size="sm"
                            onClick={() => removeAssignmentMutation.mutate(i)}>
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Card>
          </Stack>
        </Tabs.Panel>
      </Tabs>

      <Modal opened={assignOpen} onClose={() => setAssignOpen(false)} title="Quiz Ata" centered>
        <Stack>
          <Select label="Quiz" placeholder="Bir quiz seçin" data={quizOptions}
            value={selectedQuiz} onChange={setSelectedQuiz} searchable />
          <TextInput label="Son Tarih (opsiyonel)" type="date" value={dueDate}
            onChange={(e) => setDueDate(e.target.value)} />
          <Button onClick={() => assignQuizMutation.mutate({ quizId: selectedQuiz, dueDate: dueDate || null })}
            disabled={!selectedQuiz} loading={assignQuizMutation.isPending}>
            Ata
          </Button>
        </Stack>
      </Modal>
    </Container>
  );
}
