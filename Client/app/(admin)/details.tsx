import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ScrollView, Linking, ActivityIndicator, TextInput, Alert
} from 'react-native';
import MapView, { Polyline, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
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

export default function DayDetails() {
  const { shiftId } = useLocalSearchParams();
  const router = useRouter();
  const mapRef = useRef<MapView>(null);

  const [isTaskListVisible, setTaskListVisible] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoZoom, setAutoZoom] = useState(true);

  // ✅ Edit modal state
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Note>>({});
  const [isSaving, setIsSaving] = useState(false);

  const [shiftData, setShiftData] = useState<{ date: string; path: any[]; notes: Note[] }>({
    date: '', path: [], notes: []
  });

  const fetchDetails = async () => {
    try {
      const res = await fetch(`${BASE_URL}/shift-details/${shiftId}`);
      const data = await res.json();
      if (data) {
        setShiftData({
          date: data.date || '',
          path: data.path || [],
          notes: data.notes || []
        });
      }
      setLoading(false);
    } catch (err) {
      console.error("❌ Polling Error:", err);
    }
  };

  useEffect(() => {
    fetchDetails();
    const interval = setInterval(fetchDetails, 5000);
    return () => clearInterval(interval);
  }, [shiftId]);

  // ✅ Open edit modal pre-filled with selected note data
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
      await fetchDetails(); // Refresh data
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
            console.log("🚀 Calling deleteNote with ID:", selectedNote._id);
  console.log("🚀 Full URL will be:", `/notes/${selectedNote._id}`)
            try {
              await authService.deleteNote(selectedNote._id!);
              Alert.alert("✅ Deleted", "Note has been deleted.");
              setTaskListVisible(false);
              setSelectedNote(null);
              await fetchDetails(); // Refresh data
            } catch (err: any) {
  // Show FULL error details
  Alert.alert("Error", 
    `Status: ${err?.response?.status}\nMessage: ${err?.response?.data?.message}\nError: ${err?.message}\nURL: ${err?.config?.url}`
  );
}
          }
        }
      ]
    );
  };

  const formattedRoute = useMemo(() => {
    return (shiftData.path || [])
      .filter((p: any) => p?.latitude && p?.longitude)
      .map((p: any) => ({
        latitude: parseFloat(p.latitude),
        longitude: parseFloat(p.longitude),
      }));
  }, [shiftData.path]);

  useEffect(() => {
    if (autoZoom && formattedRoute.length > 0 && mapRef.current) {
      const latest = formattedRoute[formattedRoute.length - 1];
      mapRef.current.animateToRegion({
        latitude: latest.latitude,
        longitude: latest.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
  }, [formattedRoute.length]);

  const totalKm = useMemo(() => {
    if (formattedRoute.length < 2) return 0;
    const toRad = (v: number) => (v * Math.PI) / 180;
    let dist = 0;
    for (let i = 0; i < formattedRoute.length - 1; i++) {
      const R = 6371;
      const dLat = toRad(formattedRoute[i+1].latitude - formattedRoute[i].latitude);
      const dLon = toRad(formattedRoute[i+1].longitude - formattedRoute[i].longitude);
      const a = Math.sin(dLat/2)**2 + Math.cos(toRad(formattedRoute[i].latitude)) * Math.cos(toRad(formattedRoute[i+1].latitude)) * Math.sin(dLon/2)**2;
      dist += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
    return dist;
  }, [formattedRoute]);

  const totals = useMemo(() => {
    return (shiftData.notes || []).reduce((acc, curr) => ({
      students: acc.students + (Number(curr.studentCount) || 0),
      classes: acc.classes + (Number(curr.classCount) || 0)
    }), { students: 0, classes: 0 });
  }, [shiftData.notes]);

  const latestPos = formattedRoute.length > 0 ? formattedRoute[formattedRoute.length - 1] : null;
  const callNumber = (num?: string) => { if (num) Linking.openURL(`tel:${num}`); };

  if (loading && !shiftData.date) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#007AFF" /></View>;
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="black" />
        <View style={{ marginLeft: 10 }}>
          <Text style={styles.headerTitle}>{shiftData.date} Activity</Text>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE UPDATING</Text>
          </View>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.zoomToggle, { backgroundColor: autoZoom ? '#007AFF' : 'white' }]}
        onPress={() => setAutoZoom(!autoZoom)}
      >
        <Ionicons name="locate" size={24} color={autoZoom ? "white" : "black"} />
      </TouchableOpacity>

      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        onPanDrag={() => setAutoZoom(false)}
        initialRegion={{
          latitude: latestPos?.latitude || 19.1970,
          longitude: latestPos?.longitude || 72.9768,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015
        }}
      >
        {formattedRoute.length > 1 && (
          <>
            <Polyline
              key={`line-${formattedRoute.length}`}
              coordinates={formattedRoute}
              strokeColor="#007AFF"
              strokeWidth={6}
              lineJoin="round"
            />
            <Marker coordinate={formattedRoute[0]} title="Start Location">
              <Ionicons name="play-circle" size={30} color="#34C759" />
            </Marker>
            {latestPos && (
              <Marker coordinate={latestPos} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={styles.pulseContainer}><View style={styles.innerDot} /></View>
              </Marker>
            )}
          </>
        )}

        {(shiftData.notes || []).map((note, index) => (
          <Marker
            key={note._id || `note-${index}`}
            coordinate={{
              latitude: parseFloat(note.latitude as any),
              longitude: parseFloat(note.longitude as any)
            }}
            onPress={() => {
              setSelectedNote(note);
              setTaskListVisible(true);
            }}
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
              <Text style={styles.modalTypeLabel}>VISIT DETAILS</Text>
              <View style={styles.modalHeaderActions}>
                {/* ✅ EDIT BUTTON */}
                <TouchableOpacity style={styles.editBtn} onPress={openEditModal}>
                  <Ionicons name="pencil" size={16} color="#007AFF" />
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
                {/* ✅ DELETE BUTTON */}
                <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteNote}>
                  <Ionicons name="trash" size={16} color="#FF3B30" />
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

                <View style={styles.countsRow}>
                  <View style={styles.countBadge}>
                    <Ionicons name="people" size={16} color="#007AFF" />
                    <Text style={styles.countBadgeText}>{selectedNote.studentCount || 0} Students</Text>
                  </View>
                  <View style={[styles.countBadge, { backgroundColor: '#F0FDF4' }]}>
                    <Ionicons name="school" size={16} color="#16A34A" />
                    <Text style={[styles.countBadgeText, { color: '#16A34A' }]}>{selectedNote.classCount || 0} Classes</Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.infoSection}>
                  <View style={styles.iconCircle}><Ionicons name="person" size={18} color="#007AFF" /></View>
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoLabel}>Director / Owner</Text>
                    <Text style={styles.infoMainText}>{selectedNote.directorName || 'N/A'}</Text>
                    {selectedNote.directorNumber && (
                      <TouchableOpacity onPress={() => callNumber(selectedNote.directorNumber)}>
                        <Text style={styles.phoneLink}>{selectedNote.directorNumber}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <View style={styles.infoSection}>
                  <View style={styles.iconCircle}><Ionicons name="call" size={18} color="#4ADE80" /></View>
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoLabel}>Contact Person</Text>
                    <Text style={styles.infoMainText}>{selectedNote.contactPersonName || 'N/A'}</Text>
                    {selectedNote.contactPersonNumber && (
                      <TouchableOpacity onPress={() => callNumber(selectedNote.contactPersonNumber)}>
                        <Text style={styles.phoneLink}>{selectedNote.contactPersonNumber}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <View style={styles.infoSection}>
                  <View style={styles.iconCircle}><Ionicons name="location" size={18} color="#EAB308" /></View>
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoLabel}>Address</Text>
                    <Text style={styles.infoMainText}>{selectedNote.address || 'N/A'}</Text>
                  </View>
                </View>

                <View style={styles.infoSection}>
                  <View style={styles.iconCircle}><Ionicons name="time" size={18} color="#94A3B8" /></View>
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoLabel}>Logged At</Text>
                    <Text style={styles.infoMainText}>
                      {new Date(selectedNote.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
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

      <View style={styles.summaryBox}>
        <View style={styles.statRow}>
          <View style={styles.statBox}><Text style={styles.statLabel}>Distance</Text><Text style={styles.statValue}>{totalKm.toFixed(2)} km</Text></View>
          <View style={styles.statBox}><Text style={styles.statLabel}>Students</Text><Text style={[styles.statValue, { color: '#007AFF' }]}>{totals.students}</Text></View>
          <View style={styles.statBox}><Text style={styles.statLabel}>Classes</Text><Text style={[styles.statValue, { color: '#16A34A' }]}>{totals.classes}</Text></View>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  map: { flex: 1 },
  backBtn: {
    position: 'absolute', top: 50, left: 20, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'white',
    padding: 12, borderRadius: 25, elevation: 5
  },
  zoomToggle: {
    position: 'absolute', top: 120, left: 20, zIndex: 10,
    padding: 12, borderRadius: 25, elevation: 5, shadowColor: '#000'
  },
  headerTitle: { fontWeight: 'bold', fontSize: 16 },
  liveBadge: { flexDirection: 'row', alignItems: 'center' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#34C759', marginRight: 4 },
  liveText: { fontSize: 10, color: '#34C759', fontWeight: 'bold' },
  pulseContainer: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0, 122, 255, 0.2)', justifyContent: 'center', alignItems: 'center' },
  innerDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#007AFF', borderWidth: 2, borderColor: 'white' },
  noteIconBubble: { backgroundColor: '#EAB308', padding: 8, borderRadius: 20, borderWidth: 2, borderColor: 'white', elevation: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, maxHeight: '75%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  modalHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalTypeLabel: { fontSize: 12, color: '#888', fontWeight: 'bold', letterSpacing: 1 },
  // ✅ Edit & Delete button styles
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  editBtnText: { color: '#007AFF', fontWeight: '700', fontSize: 13 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF1F0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  deleteBtnText: { color: '#FF3B30', fontWeight: '700', fontSize: 13 },
  saveBtn: { backgroundColor: '#007AFF', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 10, marginBottom: 30 },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  classNameText: { fontSize: 24, fontWeight: 'bold', color: '#1C1C1E' },
  countsRow: { flexDirection: 'row', marginTop: 12, gap: 10 },
  countBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, gap: 6 },
  countBadgeText: { fontSize: 14, fontWeight: '700', color: '#007AFF' },
  divider: { height: 1, backgroundColor: '#F2F2F7', marginVertical: 20 },
  infoSection: { flexDirection: 'row', marginBottom: 20 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F8F9FB', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  infoTextContainer: { flex: 1 },
  infoLabel: { fontSize: 11, color: '#8E8E93', textTransform: 'uppercase' },
  infoMainText: { fontSize: 16, color: '#1C1C1E', fontWeight: '600' },
  phoneLink: { fontSize: 15, color: '#007AFF', fontWeight: 'bold', marginTop: 4 },
  summaryBox: { padding: 20, backgroundColor: 'white', borderTopLeftRadius: 25, borderTopRightRadius: 25, elevation: 20 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statBox: { alignItems: 'center', flex: 1 },
  statLabel: { fontSize: 12, color: '#8E8E93', marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: 'bold', color: '#1C1C1E' }
});