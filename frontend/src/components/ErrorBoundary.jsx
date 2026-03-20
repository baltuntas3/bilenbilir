import { Component } from 'react';
import { Container, Title, Text, Button, Stack, Paper } from '@mantine/core';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <Container size="sm" py="xl">
          <Paper p="xl" withBorder>
            <Stack align="center" gap="md">
              <Title order={2}>Bir hata olustu</Title>
              <Text c="dimmed" ta="center">
                Beklenmeyen bir hata meydana geldi. Lutfen sayfayi yenilemeyi deneyin.
              </Text>
              {this.state.error && (
                <Text size="sm" c="red" ta="center">
                  {this.state.error.message}
                </Text>
              )}
              <Button onClick={this.handleReset}>
                Ana Sayfaya Don
              </Button>
            </Stack>
          </Paper>
        </Container>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
