import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from '../../services/api';

// ─── Live Clock Component ────────────────────────────────────────────────────
// Ticks every second — only rendered for ongoing (LIVE) sessions
function LiveClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer); // cleanup on unmount
  }, []);

  const formatTime = (date: Date) => {
    let h = date.getHours();
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return `${h}:${m}:${s} ${ampm}`;
  };

  return <Text style={styles.infoText}>{formatTime(now)}</Text>;
}

// ─── Blinking LIVE Badge ─────────────────────────────────────────────────────
function LiveBadge() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setVisible((v) => !v), 800);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.ongoingBadge}>
      <View style={[styles.liveDot, { opacity: visible ? 1 : 0.3 }]} />
      <Text style={styles.ongoingText}>LIVE</Text>
    </View>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    fetchHistory();
    loadUserName();
  }, []);

  const loadUserName = async () => {
    try {
      const name = await AsyncStorage.getItem('userName');
      if (name) setUserName(name.replace(/['"]+/g, '').trim());
    } catch (_) {}
  };

  const fetchHistory = async () => {
    try {
      setError(null);
      const raw = await AsyncStorage.getItem('userId');
      if (!raw) {
        setError('Not logged in.');
        return;
      }

      const userId = raw.replace(/['"]+/g, '').trim();
      const url = `${BASE_URL}/history/${userId}`;
      const response = await fetch(url);

      if (!response.ok) throw new Error(`Server error ${response.status}`);

      const data = await response.json();
      setHistory(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  // ─── Stats Summary ──────────────────────────────────────────────────────────
  const totalSessions = history.length;
  const totalNotes = history.reduce((sum, item) => sum + (item.dayNotes?.length || 0), 0);
  const liveSession = history.find(
    (item) => !item.logoutTime || item.logoutTime === 'Ongoing' || item.logoutTime === ''
  );

  // ─── Render Each Log Card ───────────────────────────────────────────────────
  const renderItem = ({ item }: { item: any }) => {
    const isOngoing =
      !item.logoutTime ||
      item.logoutTime === 'Ongoing' ||
      item.logoutTime === '';

    return (
      <TouchableOpacity
        style={[styles.card, isOngoing && styles.cardLive]}
        activeOpacity={0.75}
        onPress={() =>
          router.push({
            pathname: '/details',
            params: { shiftId: item._id },
          })
        }
      >
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <Text style={styles.dateText}>{item.date}</Text>
          <View style={styles.headerRight}>
            {isOngoing && <LiveBadge />}
            <Ionicons name="chevron-forward" size={18} color="#C0C8D4" />
          </View>
        </View>

        {/* Card Body */}
        <View style={styles.cardBody}>
          {/* Time chip */}
          <View style={[styles.infoGroup, isOngoing && styles.infoGroupLive]}>
            <Ionicons
              name="time-outline"
              size={14}
              color={isOngoing ? '#16A34A' : '#64748B'}
            />
            <Text style={[styles.infoText, isOngoing && styles.infoTextLive]}>
              {item.loginTime}
              {' – '}
            </Text>
            {isOngoing ? (
              <LiveClock /> // ✅ Live ticking clock for ongoing sessions
            ) : (
              <Text style={styles.infoText}>{item.logoutTime}</Text>
            )}
          </View>

          {/* Notes chip */}
          <View style={styles.infoGroup}>
            <Ionicons name="document-text-outline" size={14} color="#EAB308" />
            <Text style={styles.infoText}>
              {item.dayNotes?.length || 0}{' '}
              {item.dayNotes?.length === 1 ? 'Note' : 'Notes'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ─── Header Component (rendered above the list) ─────────────────────────────
  const ListHeader = () => (
    <View>
      {/* Greeting */}
      {userName ? (
        <Text style={styles.greeting}>Hello, {userName} 👋</Text>
      ) : null}

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{totalSessions}</Text>
          <Text style={styles.statLabel}>Sessions</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{totalNotes}</Text>
          <Text style={styles.statLabel}>Total Notes</Text>
        </View>
        <View style={[styles.statCard, liveSession && styles.statCardLive]}>
          <Text style={[styles.statNumber, liveSession && styles.statNumberLive]}>
            {liveSession ? 'ON' : 'OFF'}
          </Text>
          <Text style={[styles.statLabel, liveSession && styles.statLabelLive]}>
            Live Now
          </Text>
        </View>
      </View>

      <Text style={styles.title}>Activity Logs</Text>
    </View>
  );

  // ─── Loading State ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading activity logs...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Error State ─────────────────────────────────────────────────────────────
  if (error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={56} color="#CBD5E1" />
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchHistory}>
            <Ionicons name="refresh-outline" size={16} color="#fff" />
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Main View ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={styles.container}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <Text style={styles.screenLabel}>Dashboard</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
            <Ionicons name="refresh-outline" size={20} color="#64748B" />
          </TouchableOpacity>
        </View>

        <FlatList
          data={history}
          renderItem={renderItem}
          keyExtractor={(item) => item._id}
          ListHeaderComponent={<ListHeader />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#007AFF"
              colors={['#007AFF']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="map-outline" size={56} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No logs yet</Text>
              <Text style={styles.emptyText}>
                Your activity sessions will appear here.
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  screenLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  refreshBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  // ── Greeting ──
  greeting: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 4,
    marginBottom: 8,
  },

  // ── Stats ──
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
    marginTop: 4,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  statCardLive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  statNumberLive: {
    color: '#16A34A',
  },
  statLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statLabelLive: {
    color: '#16A34A',
  },

  // ── Section Title ──
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginBottom: 14,
  },

  // ── Cards ──
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cardLive: {
    borderLeftWidth: 3,
    borderLeftColor: '#16A34A',
    borderColor: '#DCFCE7',
    backgroundColor: '#FAFFFE',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    fontWeight: '700',
    fontSize: 16,
    color: '#0F172A',
  },

  // ── LIVE Badge ──
  ongoingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  ongoingText: {
    color: '#16A34A',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  // ── Card Body ──
  cardBody: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  infoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  infoGroupLive: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  infoText: {
    marginLeft: 4,
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  infoTextLive: {
    color: '#16A34A',
  },

  // ── Empty / Error / Loading ──
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  loadingText: {
    marginTop: 12,
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#334155',
    marginTop: 16,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 6,
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#334155',
    marginTop: 16,
    marginBottom: 4,
  },
  errorText: {
    color: '#F87171',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#007AFF',
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 20,
  },
  retryText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },
});