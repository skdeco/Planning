import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Crash intercepté:', error, info.componentStack);
  }

  handleReload = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
    } else {
      this.setState({ hasError: false, error: null });
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <Text style={styles.icon}>&#9888;</Text>
            <Text style={styles.title}>Une erreur est survenue</Text>
            <Text style={styles.message}>
              L'application a rencontré un problème inattendu.{'\n'}
              Vos données sont en sécurité — elles sont sauvegardées automatiquement.
            </Text>
            {__DEV__ && this.state.error && (
              <Text style={styles.debug}>{this.state.error.message}</Text>
            )}
            <Pressable style={styles.btn} onPress={this.handleReload}>
              <Text style={styles.btnText}>Recharger l'application</Text>
            </Pressable>
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F4F2',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    maxWidth: 420,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#141414', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 2
  },
  icon: { fontSize: 48, marginBottom: 16 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#141414',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#6A6A68',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  debug: {
    fontSize: 11,
    color: '#EF4444',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    width: '100%',
    overflow: 'hidden',
  },
  btn: {
    backgroundColor: '#141414',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
