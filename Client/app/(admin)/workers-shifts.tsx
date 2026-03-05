import React, { useEffect, useState } from 'react';
import {
    View, Text, FlatList, StyleSheet,
    ActivityIndicator, RefreshControl, TouchableOpacity,
    Alert, Modal, Platform, ScrollView
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import DateTimePicker from '@react-native-community/datetimepicker';
import { authService, BASE_URL as API_URL } from '../../services/api';

// ─── Format JS Date → "D/M/YYYY" (matches your DB format) ───────────────────
const formatDate = (date: Date): string => {
    const d = date.getDate();
    const m = date.getMonth() + 1;
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
};

// ─── Format JS Date → "DD MMM YYYY" for display ──────────────────────────────
const displayDate = (date: Date): string =>
    date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

// ─────────────────────────────────────────────────────────────────────────────

export default function WorkerShifts() {
    const { userId, name } = useLocalSearchParams();
    const router = useRouter();

    const [shifts, setShifts]       = useState([]);
    const [loading, setLoading]     = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // ── Date Range Modal state ───────────────────────────────────────────────
    const [modalVisible, setModalVisible]   = useState(false);
    // Default: first day of current month → today
    const [startDate, setStartDate] = useState<Date>(() => {
        const d = new Date();
        d.setDate(1); // 1st of this month
        d.setHours(0, 0, 0, 0);
        return d;
    });
    const [endDate, setEndDate] = useState<Date>(new Date());
    const [pickingField, setPickingField]   = useState<'start' | 'end' | null>(null); // which picker is open
    const [downloading, setDownloading]     = useState(false);

    useEffect(() => { fetchUserHistory(); }, [userId]);

    const fetchUserHistory = async () => {
        try {
            const data = await authService.getHistory(userId as string);
            setShifts(data);
        } catch (e) {
            console.error('History Fetch Error:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // ── Single shift CSV download (existing feature, unchanged) ─────────────
    const downloadSingleReport = async (shiftId: string, date: string) => {
        try {
            const cleanDate = date.replace(/\//g, '-');
            const fileUri   = `${FileSystem.documentDirectory}Report_${cleanDate}.csv`;
            const url       = `${API_URL}/download-shift-report/${shiftId}`;

            const dl     = FileSystem.createDownloadResumable(url, fileUri);
            const result = await dl.downloadAsync();

            if (!result || result.status !== 200) {
                Alert.alert('Error', 'Server failed to generate the CSV.');
                return;
            }
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(result.uri, {
                    mimeType:    'text/csv',
                    dialogTitle: `Download Report for ${date}`,
                    UTI:         'public.comma-separated-values-text',
                });
            } else {
                Alert.alert('Saved', `File saved to: ${result.uri}`);
            }
        } catch (error) {
            Alert.alert('Download Failed', 'Something went wrong. Check console.');
        }
    };

    // ── Date range XLSX download ─────────────────────────────────────────────
    const downloadRangeReport = async () => {
        if (startDate > endDate) {
            Alert.alert('Invalid Range', 'Start date must be before end date.');
            return;
        }

        try {
            setDownloading(true);

            const sd = formatDate(startDate);
            const ed = formatDate(endDate);

            // Build URL — include userId to filter by this specific worker
            const url = `${API_URL}/export-range-report?startDate=${encodeURIComponent(sd)}&endDate=${encodeURIComponent(ed)}&userId=${userId}`;

            const fileName = `Report_${sd.replace(/\//g, '-')}_to_${ed.replace(/\//g, '-')}.xlsx`;
            const fileUri  = `${FileSystem.documentDirectory}${fileName}`;

            const dl     = FileSystem.createDownloadResumable(url, fileUri);
            const result = await dl.downloadAsync();

            if (!result || result.status !== 200) {
                Alert.alert('No Data', 'No shifts found in the selected date range.');
                return;
            }

            setModalVisible(false);

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(result.uri, {
                    mimeType:    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    dialogTitle: `Report ${sd} – ${ed}`,
                    UTI:         'com.microsoft.excel.xlsx',
                });
            } else {
                Alert.alert('Saved', `File saved to: ${result.uri}`);
            }
        } catch (error: any) {
            Alert.alert('Download Failed', error.message || 'Something went wrong.');
        } finally {
            setDownloading(false);
        }
    };

    // ─── Render each shift card ──────────────────────────────────────────────
    const renderShiftCard = ({ item }: any) => {
        const isOngoing = item.logoutTime === 'Ongoing' || !item.logoutTime;

        return (
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <Text style={styles.dateText}>{item.date}</Text>
                    <View style={[styles.statusBadge, isOngoing ? styles.ongoingBg : styles.completedBg]}>
                        <View style={[styles.dot, isOngoing ? styles.ongoingDot : styles.completedDot]} />
                        <Text style={[styles.statusText, isOngoing ? styles.ongoingColor : styles.completedColor]}>
                            {isOngoing ? 'ONGOING' : 'COMPLETED'}
                        </Text>
                    </View>
                </View>

                <View style={styles.timeRow}>
                    <View style={styles.timeBlock}>
                        <Ionicons name="log-in-outline" size={16} color="#8E8E93" />
                        <Text style={styles.timeLabel}> Login: <Text style={styles.timeValue}>{item.loginTime}</Text></Text>
                    </View>
                    <View style={styles.timeBlock}>
                        <Ionicons name="log-out-outline" size={16} color="#8E8E93" />
                        <Text style={styles.timeLabel}> Logout: <Text style={styles.timeValue}>{item.logoutTime || '—'}</Text></Text>
                    </View>
                </View>

                <View style={styles.statsRow}>
                    <View style={styles.statGroup}>
                        <Ionicons name="location-outline" size={14} color="#8E8E93" />
                        <Text style={styles.statText}>{item.path?.length || 0} Points</Text>
                    </View>
                    <View style={styles.statGroup}>
                        <Ionicons name="document-text-outline" size={14} color="#8E8E93" />
                        <Text style={styles.statText}>{item.notes?.length || 0} Notes</Text>
                    </View>
                    {!isOngoing && (
                        <TouchableOpacity
                            onPress={() => downloadSingleReport(item._id, item.date)}
                            style={styles.downloadBtn}
                        >
                            <Ionicons name="cloud-download-outline" size={20} color="#007AFF" />
                            <Text style={styles.downloadBtnText}>Report</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <View style={styles.actionRow}>
                    {isOngoing && (
                        <TouchableOpacity
                            style={[styles.btn, styles.btnLive]}
                            onPress={() => router.push({ pathname: '/(admin)/live-track', params: { userId } })}
                        >
                            <View style={[styles.dot, { backgroundColor: '#34C759' }]} />
                            <Text style={styles.btnLiveText}>Live Track</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        style={[styles.btn, styles.btnDetails, !isOngoing && { width: '100%' }]}
                        onPress={() => router.push({ pathname: '/(admin)/details', params: { shiftId: item._id } })}
                    >
                        <Ionicons name="eye-outline" size={18} color="#007AFF" />
                        <Text style={styles.btnDetailsText}> View Details</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    // ─── Date Range Modal ────────────────────────────────────────────────────
    const DateRangeModal = () => (
        <Modal
            visible={modalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setModalVisible(false)}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalSheet}>
                    {/* Handle */}
                    <View style={styles.modalHandle} />

                    <Text style={styles.modalTitle}>Download Range Report</Text>
                    <Text style={styles.modalSubtitle}>
                        Select a date range to export all notes for {name || 'this worker'}.
                    </Text>

                    {/* Start Date */}
                    <Text style={styles.dateLabel}>From</Text>
                    <TouchableOpacity
                        style={styles.datePickerBtn}
                        onPress={() => setPickingField('start')}
                    >
                        <Ionicons name="calendar-outline" size={18} color="#007AFF" />
                        <Text style={styles.datePickerText}>{displayDate(startDate)}</Text>
                        <Ionicons name="chevron-down" size={16} color="#999" style={{ marginLeft: 'auto' }} />
                    </TouchableOpacity>

                    {/* End Date */}
                    <Text style={styles.dateLabel}>To</Text>
                    <TouchableOpacity
                        style={styles.datePickerBtn}
                        onPress={() => setPickingField('end')}
                    >
                        <Ionicons name="calendar-outline" size={18} color="#007AFF" />
                        <Text style={styles.datePickerText}>{displayDate(endDate)}</Text>
                        <Ionicons name="chevron-down" size={16} color="#999" style={{ marginLeft: 'auto' }} />
                    </TouchableOpacity>

                    {/* Inline date picker (iOS/Android) */}
                    {pickingField && (
                        <DateTimePicker
                            value={pickingField === 'start' ? startDate : endDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            maximumDate={new Date()}
                            onChange={(_, selected) => {
                                setPickingField(null);
                                if (!selected) return;
                                if (pickingField === 'start') setStartDate(selected);
                                else setEndDate(selected);
                            }}
                        />
                    )}

                    {/* Range summary */}
                    <View style={styles.rangeSummary}>
                        <Ionicons name="information-circle-outline" size={14} color="#64748B" />
                        <Text style={styles.rangeSummaryText}>
                            {Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1} day(s) selected
                        </Text>
                    </View>

                    {/* Actions */}
                    <View style={styles.modalActions}>
                        <TouchableOpacity
                            style={styles.cancelBtn}
                            onPress={() => setModalVisible(false)}
                        >
                            <Text style={styles.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.downloadRangeBtn, downloading && { opacity: 0.6 }]}
                            onPress={downloadRangeReport}
                            disabled={downloading}
                        >
                            {downloading ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <>
                                    <Ionicons name="cloud-download-outline" size={18} color="#fff" />
                                    <Text style={styles.downloadRangeBtnText}>Download XLSX</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );

    // ─── Main render ─────────────────────────────────────────────────────────
    return (
        <View style={styles.container}>
            {/* Screen Header */}
            <View style={styles.screenHeader}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="chevron-back" size={24} color="#1C1C1E" />
                </TouchableOpacity>
                <View style={styles.headerInfo}>
                    <Text style={styles.headerTitle}>{name || 'User'}'s Shifts</Text>
                </View>
                {/* ✅ Date Range Download Button */}
                {/*<TouchableOpacity
                    style={styles.rangeBtn}
                    onPress={() => setModalVisible(true)}
                >
                    <Ionicons name="calendar-outline" size={16} color="#007AFF" />
                    <Text style={styles.rangeBtnText}>Range</Text>
                </TouchableOpacity>*/}
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#007AFF" />
                </View>
            ) : (
                <FlatList
                    data={shifts}
                    keyExtractor={(item) => item._id}
                    renderItem={renderShiftCard}
                    contentContainerStyle={styles.list}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={fetchUserHistory}
                            tintColor="#007AFF"
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="map-outline" size={48} color="#CBD5E1" />
                            <Text style={styles.emptyText}>No shifts found.</Text>
                        </View>
                    }
                />
            )}

            {/* Date Range Modal */}
            <DateRangeModal />
        </View>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container:   { flex: 1, backgroundColor: '#F2F2F7' },
    center:      { flex: 1, justifyContent: 'center', alignItems: 'center' },
    screenHeader: {
        flexDirection:    'row',
        alignItems:       'center',
        padding:          20,
        paddingTop:       50,
        backgroundColor:  '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E5EA',
    },
    headerInfo:  { flex: 1, marginLeft: 15 },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#1C1C1E' },

    // ── Range button in header ──
    rangeBtn: {
        flexDirection:   'row',
        alignItems:      'center',
        gap:             5,
        backgroundColor: '#F0F7FF',
        paddingHorizontal: 12,
        paddingVertical:   8,
        borderRadius:    10,
        borderWidth:     1,
        borderColor:     '#BFDBFE',
    },
    rangeBtnText: { color: '#007AFF', fontWeight: '700', fontSize: 13 },

    list: { padding: 16 },

    // ── Cards ──
    card: {
        backgroundColor: '#FFF',
        borderRadius:    20,
        padding:         16,
        marginBottom:    16,
        shadowColor:     '#000',
        shadowOffset:    { width: 0, height: 2 },
        shadowOpacity:   0.1,
        shadowRadius:    8,
        elevation:       3,
    },
    cardHeader:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    dateText:    { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
    statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    ongoingBg:   { backgroundColor: '#E8F5E9' },
    completedBg: { backgroundColor: '#F2F2F7' },
    statusText:  { fontSize: 11, fontWeight: 'bold' },
    ongoingColor:   { color: '#34C759' },
    completedColor: { color: '#8E8E93' },
    dot:          { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    ongoingDot:   { backgroundColor: '#34C759' },
    completedDot: { backgroundColor: '#8E8E93' },
    timeRow: {
        flexDirection:     'row',
        justifyContent:    'space-between',
        marginBottom:      12,
        paddingBottom:     12,
        borderBottomWidth: 1,
        borderBottomColor: '#F2F2F7',
    },
    timeBlock:   { flexDirection: 'row', alignItems: 'center' },
    timeLabel:   { fontSize: 14, color: '#8E8E93' },
    timeValue:   { color: '#1C1C1E', fontWeight: '600' },
    statsRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    statGroup:   { flexDirection: 'row', alignItems: 'center', marginRight: 15 },
    statText:    { fontSize: 13, color: '#8E8E93', marginLeft: 4 },
    downloadBtn: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F7FF', padding: 6, borderRadius: 8 },
    downloadBtnText: { color: '#007AFF', fontSize: 12, fontWeight: 'bold', marginLeft: 4 },
    actionRow:   { flexDirection: 'row', justifyContent: 'space-between' },
    btn:         { height: 48, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    btnLive:     { width: '48%', backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: '#34C759' },
    btnDetails:  { width: '48%', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#007AFF' },
    btnLiveText:    { color: '#34C759', fontWeight: 'bold' },
    btnDetailsText: { color: '#007AFF', fontWeight: 'bold' },
    emptyContainer: { alignItems: 'center', marginTop: 100 },
    emptyText:   { color: '#8E8E93', fontSize: 16, marginTop: 10 },

    // ── Modal ──
    modalOverlay: {
        flex:            1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent:  'flex-end',
    },
    modalSheet: {
        backgroundColor: '#FFF',
        borderTopLeftRadius:  28,
        borderTopRightRadius: 28,
        padding:          28,
        paddingBottom:    40,
    },
    modalHandle: {
        width:           44,
        height:          5,
        borderRadius:    3,
        backgroundColor: '#E2E8F0',
        alignSelf:       'center',
        marginBottom:    20,
    },
    modalTitle: {
        fontSize:     20,
        fontWeight:   '800',
        color:        '#0F172A',
        marginBottom: 6,
    },
    modalSubtitle: {
        fontSize:     13,
        color:        '#64748B',
        marginBottom: 24,
        lineHeight:   18,
    },
    dateLabel: {
        fontSize:     12,
        fontWeight:   '700',
        color:        '#94A3B8',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        marginBottom:  6,
    },
    datePickerBtn: {
        flexDirection:  'row',
        alignItems:     'center',
        gap:            10,
        backgroundColor: '#F8FAFC',
        borderWidth:    1,
        borderColor:    '#E2E8F0',
        borderRadius:   12,
        paddingHorizontal: 14,
        paddingVertical:   14,
        marginBottom:   16,
    },
    datePickerText: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
    rangeSummary: {
        flexDirection:  'row',
        alignItems:     'center',
        gap:            6,
        backgroundColor: '#F0F9FF',
        borderRadius:   8,
        paddingHorizontal: 12,
        paddingVertical:   10,
        marginBottom:   24,
        borderWidth:    1,
        borderColor:    '#BAE6FD',
    },
    rangeSummaryText: { fontSize: 13, color: '#0369A1', fontWeight: '600' },
    modalActions: {
        flexDirection: 'row',
        gap:           12,
    },
    cancelBtn: {
        flex:           1,
        height:         50,
        borderRadius:   14,
        justifyContent: 'center',
        alignItems:     'center',
        backgroundColor: '#F1F5F9',
        borderWidth:    1,
        borderColor:    '#E2E8F0',
    },
    cancelBtnText: { color: '#64748B', fontWeight: '700', fontSize: 15 },
    downloadRangeBtn: {
        flex:           2,
        height:         50,
        borderRadius:   14,
        flexDirection:  'row',
        justifyContent: 'center',
        alignItems:     'center',
        gap:            8,
        backgroundColor: '#007AFF',
    },
    downloadRangeBtnText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
});