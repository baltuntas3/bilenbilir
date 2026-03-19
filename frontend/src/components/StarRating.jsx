import { Rating, Group, Text } from '@mantine/core';

export default function StarRating({ value, count, onChange, readOnly = false, size = 'sm' }) {
  return (
    <Group gap="xs">
      <Rating value={value} onChange={onChange} readOnly={readOnly} size={size} />
      {count !== undefined && (
        <Text size="xs" c="dimmed">({count})</Text>
      )}
    </Group>
  );
}
