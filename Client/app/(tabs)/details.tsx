import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Linking, ActivityIndicator, TextInput, Alert } from 'react-native';
import MapView, { Polyline, Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { BASE_URL, authService } from '../../services/api';

interface Note {
  _id?: string;
  latitude: number;
  longitude: number;
  className: string;
  directorName?: string;
  directorNumber?: string;
  address?: string;
  contactPersonName?: string;
  contactPersonNumber?: string;
  studentCount?: number;
  classCount?: number;
  createdAt?: string;
  timestamp?: string;
}

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export default function DayDetails() {
  const { shiftId } = useLocalSearchParams();
  const router = useRouter();
  const mapRef = useRef<MapView>(null);

  const [isTaskListVisible, setTaskListVisible] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  // ✅ Edit modal state
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Note>>({});
  const [isSaving, setIsSaving] = useState(false);

  const [shiftData, setShiftData] = useState<{ date: string; path: any[]; notes: Note[] }>({
    date: '', path: [], notes: []
  });

  // ✅ Fetch with _id included
  const fetchDetails = async () => {
    try {
      const url = `${BASE_URL}/shift-details/${shiftId}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Status: ${res.status}`);
      const data = await res.json();
      setShiftData({
        date: data.date || '',
        path: data.path || [],
        notes: data.notes || []
      });
    } catch (err) {
      console.error("❌ Fetch Error:", err);
    }
  };

  useEffect(() => {
    if (shiftId) fetchDetails();
  }, [shiftId]);

  // ✅ Open edit modal pre-filled
  const openEditModal = () => {
    if (!selectedNote) return;
    setEditForm({
      className: selectedNote.className,
      directorName: selectedNote.directorName,
      directorNumber: selectedNote.directorNumber,
      address: selectedNote.address,
      contactPersonName: selectedNote.contactPersonName,
      contactPersonNumber: selectedNote.contactPersonNumber,
      studentCount: selectedNote.studentCount,
      classCount: selectedNote.classCount,
    });
    setEditModalVisible(true);
  };

  // ✅ Save edited note
  const handleSaveEdit = async () => {
    if (!selectedNote?._id) return;

    if (!editForm.className || editForm.className.trim() === '') {
      Alert.alert("Validation Error", "Class name cannot be empty.");
      return;
    }

    setIsSaving(true);
    try {
      await authService.updateNote(selectedNote._id, {
        className: editForm.className!.trim(),
        directorName: editForm.directorName,
        directorNumber: editForm.directorNumber,
        address: editForm.address,
        contactPersonName: editForm.contactPersonName,
        contactPersonNumber: editForm.contactPersonNumber,
        studentCount: Number(editForm.studentCount) || 0,
        classCount: Number(editForm.classCount) || 0,
      });

      Alert.alert("✅ Success", "Note updated successfully!");
      setEditModalVisible(false);
      setTaskListVisible(false);
      await fetchDetails();
    } catch (err: any) {
      Alert.alert("Error", err?.response?.data?.message || "Failed to update note.");
    } finally {
      setIsSaving(false);
    }
  };

  // ✅ Delete note with confirmation
  const handleDeleteNote = () => {
    if (!selectedNote?._id) return;

    Alert.alert(
      "🗑️ Delete Note",
      `Are you sure you want to delete the note for "${selectedNote.className}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await authService.deleteNote(selectedNote._id!);
              Alert.alert("✅ Deleted", "Note has been deleted.");
              setTaskListVisible(false);
              setSelectedNote(null);
              await fetchDetails();
            } catch (err: any) {
              Alert.alert("Error", err?.response?.data?.message || "Failed to delete note.");
            }
          }
        }
      ]
    );
  };

  const formattedRoute = useMemo(() => {
    return shiftData.path
      .filter((p: any) => p?.latitude && p?.longitude)
      .map((p: any) => ({
        latitude: Number(p.latitude),
        longitude: Number(p.longitude),
      }))
      .filter(p => !isNaN(p.latitude) && p.latitude >= -90 && p.latitude <= 90);
  }, [shiftData.path]);

  const totalKm = useMemo(() => {
    if (formattedRoute.length < 2) return 0;
    let distance = 0;
    for (let i = 0; i < formattedRoute.length - 1; i++) {
      distance += calculateDistance(
        formattedRoute[i].latitude, formattedRoute[i].longitude,
        formattedRoute[i + 1].latitude, formattedRoute[i + 1].longitude
      );
    }
    return distance;
  }, [formattedRoute]);

  const dailyStats = useMemo(() => {
    return shiftData.notes.reduce((acc, note) => ({
      totalStudents: acc.totalStudents + (Number(note.studentCount) || 0),
      totalClasses: acc.totalClasses + (Number(note.classCount) || 0)
    }), { totalStudents: 0, totalClasses: 0 });
  }, [shiftData.notes]);

  const formattedNotes = useMemo(() => {
    return shiftData.notes
      .filter((n: any) => n?.latitude && n?.longitude)
      .map((n: any) => ({
        ...n,
        latitude: Number(n.latitude),
        longitude: Number(n.longitude),
      }));
  }, [shiftData.notes]);

  const handleNotePress = (note: Note) => {
    setSelectedNote(note);
    setTaskListVisible(true);
    mapRef.current?.animateToRegion({
      latitude: note.latitude,
      longitude: note.longitude,
      latitudeDelta: 0.003,
      longitudeDelta: 0.003,
    }, 800);
  };

  const initialRegion: Region = useMemo(() => {
    const fallback = { latitude: 19.0760, longitude: 72.8777, latitudeDelta: 0.05, longitudeDelta: 0.05 };
    if (formattedRoute.length === 0) return fallback;
    return {
      latitude: formattedRoute[0].latitude,
      longitude: formattedRoute[0].longitude,
      latitudeDelta: 0.015,
      longitudeDelta: 0.015,
    };
  }, [formattedRoute]);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="black" />
        <Text style={styles.headerTitle}>{shiftData.date} Activity</Text>
      </TouchableOpacity>

      <MapView ref={mapRef} provider={PROVIDER_GOOGLE} style={styles.map} initialRegion={initialRegion}>
        {formattedRoute.length > 1 && (
          <>
            <Polyline coordinates={formattedRoute} strokeColor="#007AFF" strokeWidth={5} />
            <Marker coordinate={formattedRoute[0]} title="Start Point" pinColor="green" />
            <Marker coordinate={formattedRoute[formattedRoute.length - 1]} title="End Point" pinColor="red" />
          </>
        )}

        {formattedNotes.map((note, index) => (
          <Marker
            key={note._id || `note-${index}`}
            coordinate={{ latitude: note.latitude, longitude: note.longitude }}
            onPress={() => handleNotePress(note)}
          >
            <View style={styles.noteIconBubble}>
              <Ionicons name="business" size={16} color="white" />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* ===== VIEW NOTE MODAL ===== */}
      <Modal animationType="slide" transparent visible={isTaskListVisible} onRequestClose={() => setTaskListVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTypeLabel}>VISIT INFORMATION</Text>
              {/* ✅ Edit & Delete buttons */}
              <View style={styles.modalHeaderActions}>
                <TouchableOpacity style={styles.editBtn} onPress={openEditModal}>
                  <Ionicons name="pencil" size={15} color="#007AFF" />
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteNote}>
                  <Ionicons name="trash" size={15} color="#FF3B30" />
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setTaskListVisible(false)}>
                  <Ionicons name="close-circle" size={32} color="#ccc" />
                </TouchableOpacity>
              </View>
            </View>

            {selectedNote && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.classNameText}>{selectedNote.className}</Text>

                <View style={styles.badgeRow}>
                  <View style={[styles.countBadge, { backgroundColor: '#E0F2FE' }]}>
                    <Text style={[styles.badgeText, { color: '#0369A1' }]}>Students: {selectedNote.studentCount || 0}</Text>
                  </View>
                  <View style={[styles.countBadge, { backgroundColor: '#F0FDF4' }]}>
                    <Text style={[styles.badgeText, { color: '#15803D' }]}>Classes: {selectedNote.classCount || 0}</Text>
                  </View>
                </View>

                <Text style={styles.taskTime}>
                  Recorded: {new Date(selectedNote.createdAt || Date.now()).toLocaleTimeString()}
                </Text>

                <View style={styles.divider} />

                <View style={styles.infoSection}>
                  <View style={[styles.iconCircle, { backgroundColor: '#F3F4F6' }]}>
                    <Ionicons name="person" size={20} color="#007AFF" />
                  </View>
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoLabel}>Director / Proprietor</Text>
                    <Text style={styles.infoMainText}>{selectedNote.directorName || 'N/A'}</Text>
                    {selectedNote.directorNumber && (
                      <TouchableOpacity onPress={() => Linking.openURL(`tel:${selectedNote.directorNumber}`)}>
                        <Text style={styles.phoneLink}>{selectedNote.directorNumber}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <View style={styles.infoSection}>
                  <View style={[styles.iconCircle, { backgroundColor: '#F3F4F6' }]}>
                    <Ionicons name="location" size={20} color="#CA8A04" />
                  </View>
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoLabel}>Address Detail</Text>
                    <Text style={styles.infoMainText}>{selectedNote.address || 'No address saved'}</Text>
                  </View>
                </View>

                <View style={styles.infoSection}>
                  <View style={[styles.iconCircle, { backgroundColor: '#F3F4F6' }]}>
                    <Ionicons name="call" size={20} color="#166534" />
                  </View>
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoLabel}>Primary Contact</Text>
                    <Text style={styles.infoMainText}>{selectedNote.contactPersonName || 'N/A'}</Text>
                    {selectedNote.contactPersonNumber && (
                      <TouchableOpacity onPress={() => Linking.openURL(`tel:${selectedNote.contactPersonNumber}`)}>
                        <Text style={styles.phoneLink}>{selectedNote.contactPersonNumber}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ===== EDIT NOTE MODAL ===== */}
      <Modal animationType="slide" transparent visible={isEditModalVisible} onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTypeLabel}>✏️ EDIT NOTE</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close-circle" size={32} color="#ccc" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <EditField label="Class Name *" value={editForm.className} onChangeText={(v) => setEditForm(p => ({ ...p, className: v }))} />
              <EditField label="Director Name" value={editForm.directorName} onChangeText={(v) => setEditForm(p => ({ ...p, directorName: v }))} />
              <EditField label="Director Number" value={editForm.directorNumber} onChangeText={(v) => setEditForm(p => ({ ...p, directorNumber: v }))} keyboardType="phone-pad" />
              <EditField label="Address" value={editForm.address} onChangeText={(v) => setEditForm(p => ({ ...p, address: v }))} multiline />
              <EditField label="Contact Person Name" value={editForm.contactPersonName} onChangeText={(v) => setEditForm(p => ({ ...p, contactPersonName: v }))} />
              <EditField label="Contact Person Number" value={editForm.contactPersonNumber} onChangeText={(v) => setEditForm(p => ({ ...p, contactPersonNumber: v }))} keyboardType="phone-pad" />
              <EditField label="Student Count" value={String(editForm.studentCount ?? '')} onChangeText={(v) => setEditForm(p => ({ ...p, studentCount: Number(v) }))} keyboardType="numeric" />
              <EditField label="Class Count" value={String(editForm.classCount ?? '')} onChangeText={(v) => setEditForm(p => ({ ...p, classCount: Number(v) }))} keyboardType="numeric" />

              <TouchableOpacity
                style={[styles.saveBtn, isSaving && { opacity: 0.6 }]}
                onPress={handleSaveEdit}
                disabled={isSaving}
              >
                {isSaving
                  ? <ActivityIndicator color="white" />
                  : <Text style={styles.saveBtnText}>💾 Save Changes</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ===== SUMMARY BOX ===== */}
      <View style={styles.summaryBox}>
        <Text style={styles.summaryTitle}>Day Summary</Text>
        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Distance</Text>
            <Text style={styles.statValue}>{totalKm.toFixed(1)}km</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Visits</Text>
            <Text style={styles.statValue}>{formattedNotes.length}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Students</Text>
            <Text style={styles.statValue}>{dailyStats.totalStudents}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Classes</Text>
            <Text style={styles.statValue}>{dailyStats.totalClasses}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ✅ Reusable Edit Field Component
function EditField({ label, value, onChangeText, keyboardType, multiline }: {
  label: string;
  value?: string;
  onChangeText: (v: string) => void;
  keyboardType?: any;
  multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={editStyles.label}>{label}</Text>
      <TextInput
        style={[editStyles.input, multiline && { height: 80, textAlignVertical: 'top' }]}
        value={value || ''}
        onChangeText={onChangeText}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
        placeholder={`Enter ${label.replace(' *', '')}`}
        placeholderTextColor="#C7C7CC"
      />
    </View>
  );
}

const editStyles = StyleSheet.create({
  label: { fontSize: 12, color: '#8E8E93', textTransform: 'uppercase', marginBottom: 6, fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: '#E5E5EA', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#1C1C1E',
    backgroundColor: '#F9F9F9'
  },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  backBtn: {
    position: 'absolute', top: 50, left: 20, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'white',
    padding: 12, borderRadius: 25, elevation: 5
  },
  headerTitle: { marginLeft: 10, fontWeight: 'bold' },
  noteIconBubble: {
    backgroundColor: '#EAB308', padding: 8, borderRadius: 20,
    borderWidth: 2, borderColor: 'white', elevation: 5,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, maxHeight: '75%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  modalHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalTypeLabel: { fontSize: 11, color: '#888', fontWeight: 'bold', letterSpacing: 1 },
  // ✅ Edit & Delete buttons
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  editBtnText: { color: '#007AFF', fontWeight: '700', fontSize: 12 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF1F0', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  deleteBtnText: { color: '#FF3B30', fontWeight: '700', fontSize: 12 },
  saveBtn: { backgroundColor: '#007AFF', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 10, marginBottom: 30 },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  classNameText: { fontSize: 24, fontWeight: 'bold', color: '#1a1a1a' },
  badgeRow: { flexDirection: 'row', marginTop: 10, gap: 10 },
  countBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 13, fontWeight: 'bold' },
  taskTime: { fontSize: 13, color: '#8e8e93', marginTop: 10 },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 20 },
  infoSection: { flexDirection: 'row', marginBottom: 22, alignItems: 'flex-start' },
  iconCircle: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  infoTextContainer: { flex: 1 },
  infoLabel: { fontSize: 10, color: '#999', textTransform: 'uppercase', marginBottom: 2 },
  infoMainText: { fontSize: 16, color: '#333', fontWeight: '600' },
  phoneLink: { fontSize: 15, color: '#007AFF', fontWeight: 'bold', marginTop: 3 },
  summaryBox: {
    padding: 20, backgroundColor: 'white', borderTopLeftRadius: 30, borderTopRightRadius: 30,
    elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 10
  },
  summaryTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 15, color: '#444' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statBox: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 10, color: '#888', marginBottom: 4, textTransform: 'uppercase' },
  statValue: { fontSize: 15, fontWeight: 'bold', color: '#111' }
});