import { SegmentedControl } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const handleChange = (lng) => {
    i18n.changeLanguage(lng);
    localStorage.setItem('language', lng);
  };

  return (
    <SegmentedControl
      size="xs"
      value={i18n.language}
      onChange={handleChange}
      data={[
        { label: 'TR', value: 'tr' },
        { label: 'EN', value: 'en' },
      ]}
    />
  );
}
