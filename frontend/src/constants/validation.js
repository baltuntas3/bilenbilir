export const emailValidation = (value) => {
  if (!value) return 'Email is required';
  if (!/^\S+@\S+$/.test(value)) return 'Please enter a valid email';
  return null;
};

export const passwordValidation = (value) => {
  if (!value) return 'Password is required';
  if (value.length < 6) return 'Password must be at least 6 characters';
  return null;
};

export const requiredPasswordValidation = (value) => {
  if (!value) return 'Password is required';
  return null;
};

export const usernameValidation = (value) => {
  if (!value) return 'Username is required';
  if (value.length < 2) return 'Username must be at least 2 characters';
  if (value.length > 30) return 'Username must be at most 30 characters';
  return null;
};

export const confirmPasswordValidation = (field = 'password') => (value, values) => {
  if (!value) return 'Password confirmation is required';
  if (value !== values[field]) return 'Passwords do not match';
  return null;
};

// Quiz validations
export const quizTitleValidation = (value) => {
  if (!value) return 'Title is required';
  if (value.length > 100) return 'Title must be at most 100 characters';
  return null;
};

export const quizDescriptionValidation = (value) => {
  if (value && value.length > 500) return 'Description must be at most 500 characters';
  return null;
};

// Question validations
export const questionTextValidation = (value) => {
  if (!value) return 'Question text is required';
  return null;
};

export const questionOptionsValidation = (value, values) => {
  if (!value || !Array.isArray(value)) return 'Options are required';
  const minOptions = values?.type === 'TRUE_FALSE' ? 2 : 2;
  const maxOptions = values?.type === 'TRUE_FALSE' ? 2 : 4;
  if (value.length < minOptions) return `At least ${minOptions} options required`;
  if (value.length > maxOptions) return `At most ${maxOptions} options allowed`;
  if (value.some(opt => !opt || !opt.trim())) return 'All options must have text';
  return null;
};

export const questionCorrectAnswerValidation = (value, values) => {
  if (value === null || value === undefined) return 'Correct answer is required';
  if (value < 0) return 'Please select a correct answer';
  if (values?.options && value >= values.options.length) return 'Invalid correct answer';
  return null;
};

export const questionTimeLimitValidation = (value) => {
  if (!value) return 'Time limit is required';
  if (value < 5) return 'Time limit must be at least 5 seconds';
  if (value > 120) return 'Time limit must be at most 120 seconds';
  return null;
};

export const questionPointsValidation = (value) => {
  if (!value) return 'Points are required';
  if (value < 100) return 'Points must be at least 100';
  if (value > 10000) return 'Points must be at most 10000';
  return null;
};
