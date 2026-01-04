import { TextInput, Textarea, Select, NumberInput, Button, Stack, Group, ActionIcon, Radio, Text, Input } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { quizService } from '../services/quizService';
import { showToast } from '../utils/toast';
import {
  questionTextValidation,
  questionTimeLimitValidation,
  questionPointsValidation,
} from '../constants/validation';

export default function QuestionForm({ quizId, question, onSaved, onCancel }) {
  const isEditing = !!question;

  const form = useForm({
    initialValues: {
      text: question?.text || '',
      type: question?.type || 'MULTIPLE_CHOICE',
      options: question?.options || ['', ''],
      correctAnswerIndex: question?.correctAnswerIndex ?? -1,
      timeLimit: question?.timeLimit || 30,
      points: question?.points || 1000,
      imageUrl: question?.imageUrl || '',
    },
    validate: {
      text: questionTextValidation,
      timeLimit: questionTimeLimitValidation,
      points: questionPointsValidation,
      options: (value) => {
        if (!value || value.length < 2) return 'At least 2 options required';
        if (value.some(opt => !opt || !opt.trim())) return 'All options must have text';
        return null;
      },
      correctAnswerIndex: (value) => {
        if (value < 0) return 'Please select a correct answer';
        return null;
      },
    },
  });

  const addMutation = useMutation({
    mutationFn: (data) => quizService.addQuestion(quizId, data),
    onSuccess: () => {
      showToast.success('Question added');
      onSaved();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data) => quizService.updateQuestion(quizId, question.id || question._id, data),
    onSuccess: () => {
      showToast.success('Question updated');
      onSaved();
    },
  });

  const handleSubmit = (values) => {
    const data = {
      ...values,
      options: values.options.filter(opt => opt.trim()),
    };

    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      addMutation.mutate(data);
    }
  };

  const addOption = () => {
    if (form.values.options.length < 4) {
      form.setFieldValue('options', [...form.values.options, '']);
    }
  };

  const removeOption = (index) => {
    if (form.values.options.length > 2) {
      const newOptions = form.values.options.filter((_, i) => i !== index);
      form.setFieldValue('options', newOptions);

      // Adjust correctAnswerIndex if needed
      if (form.values.correctAnswerIndex === index) {
        form.setFieldValue('correctAnswerIndex', -1);
      } else if (form.values.correctAnswerIndex > index) {
        form.setFieldValue('correctAnswerIndex', form.values.correctAnswerIndex - 1);
      }
    }
  };

  const handleTypeChange = (type) => {
    form.setFieldValue('type', type);
    if (type === 'TRUE_FALSE') {
      form.setFieldValue('options', ['True', 'False']);
      if (form.values.correctAnswerIndex > 1) {
        form.setFieldValue('correctAnswerIndex', -1);
      }
    }
  };

  const isPending = addMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack>
        <Textarea
          label="Question"
          placeholder="Enter your question"
          rows={2}
          {...form.getInputProps('text')}
        />

        <Select
          label="Question Type"
          data={[
            { value: 'MULTIPLE_CHOICE', label: 'Multiple Choice' },
            { value: 'TRUE_FALSE', label: 'True / False' },
          ]}
          value={form.values.type}
          onChange={handleTypeChange}
        />

        <div>
          <Group justify="space-between" mb="xs">
            <Text size="sm" fw={500}>Options</Text>
            {form.values.type === 'MULTIPLE_CHOICE' && form.values.options.length < 4 && (
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPlus size={14} />}
                onClick={addOption}
              >
                Add Option
              </Button>
            )}
          </Group>

          <Radio.Group
            value={String(form.values.correctAnswerIndex)}
            onChange={(value) => form.setFieldValue('correctAnswerIndex', parseInt(value))}
          >
            <Stack gap="xs">
              {form.values.options.map((option, index) => (
                <Group key={index} gap="xs">
                  <Radio value={String(index)} label="" />
                  <TextInput
                    placeholder={`Option ${String.fromCharCode(65 + index)}`}
                    value={option}
                    onChange={(e) => {
                      const newOptions = [...form.values.options];
                      newOptions[index] = e.target.value;
                      form.setFieldValue('options', newOptions);
                    }}
                    style={{ flex: 1 }}
                    disabled={form.values.type === 'TRUE_FALSE'}
                  />
                  {form.values.type === 'MULTIPLE_CHOICE' && form.values.options.length > 2 && (
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() => removeOption(index)}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  )}
                </Group>
              ))}
            </Stack>
          </Radio.Group>
          {form.errors.options && (
            <Input.Error>{form.errors.options}</Input.Error>
          )}
          {form.errors.correctAnswerIndex && (
            <Input.Error>{form.errors.correctAnswerIndex}</Input.Error>
          )}
        </div>

        <Group grow>
          <NumberInput
            label="Time Limit (seconds)"
            min={5}
            max={120}
            {...form.getInputProps('timeLimit')}
          />

          <NumberInput
            label="Points"
            min={100}
            max={10000}
            step={100}
            {...form.getInputProps('points')}
          />
        </Group>

        <TextInput
          label="Image URL (optional)"
          placeholder="https://example.com/image.jpg"
          {...form.getInputProps('imageUrl')}
        />

        <Group justify="flex-end">
          <Button variant="light" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={isPending}>
            {isEditing ? 'Update Question' : 'Add Question'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
