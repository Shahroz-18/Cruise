import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    StyleSheet,
    Text,
    TouchableOpacity,
    Alert,
    Modal,
    TextInput,
} from 'react-native';
import MapView, { Marker, Polyline, Callout } from 'react-native-maps';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import {
    getFirestore,
    doc,
    setDoc,
    collection,
    onSnapshot,
    getDoc,
    getDocs,
    writeBatch,
    deleteDoc,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// ─── Background task definition ─────────────────────────

const BACKGROUND_LOCATION_TASK = 'CRUISE_BG_LOCATION';
TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK)
    .then((registered) => {
        if (registered) {
            TaskManager.unregisterAllTasksAsync();
        }
    });

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
        console.error('BG task error:', error);
        return;
    }
    if (data) {
        const { locations } = data;
        const db = getFirestore();
        try {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            const uid = await AsyncStorage.getItem('cruiseUid');
            const partyCode = await AsyncStorage.getItem('currentPartyCode');
            if (!uid || !partyCode) return;

            for (const loc of locations) {
                const { latitude, longitude } = loc.coords;
                const locRef = doc(db, 'parties', partyCode, 'locations', uid);
                await setDoc(locRef, {
                    uid,
                    lat: latitude,
                    lng: longitude,
                    bearing: loc.coords.heading ?? 0,
                    updatedAt: new Date(),
                }, { merge: true });
            }
        } catch (e) {
            console.error('BG write error:', e);
        }
    }
});

// ─── Simple polyline decoder ──────────────────────────────
function decodePolyline(encoded) {
    let index = 0;
    const len = encoded.length;
    const points = [];
    let lat = 0;
    let lng = 0;
    while (index < len) {
        let b;
        let shift = 0;
        let result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
        lat += dlat;
        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
        lng += dlng;
        points.push([lat / 1e5, lng / 1e5]);
    }
    return points;
}

// ─── Main Component ──────────────────────────────────────
export default function MapScreen({ route, navigation }) {
    const { partyCode } = route.params;

    const [region, setRegion] = useState(null);
    const [myLocation, setMyLocation] = useState(null);
    const [memberLocations, setMemberLocations] = useState({});
    const [errorMsg, setErrorMsg] = useState(null);
    const [isLeader, setIsLeader] = useState(false);
    const [drawingMode, setDrawingMode] = useState(false);
    const [waypoints, setWaypoints] = useState([]);
    const [routeCoords, setRouteCoords] = useState([]);
    const [stops, setStops] = useState([]);

    const [nicknames, setNicknames] = useState({});

    // New states for adding stops
    const [stopMode, setStopMode] = useState(false);
    const [pendingStopCoord, setPendingStopCoord] = useState(null);
    const [stopNameModalVisible, setStopNameModalVisible] = useState(false);
    const [showMemberList, setShowMemberList] = useState(false);
    const [members, setMembers] = useState([]);
    const [newStopName, setNewStopName] = useState('');
    const [mapStyle, setMapStyle] = useState('standard');
    const [showMapPicker, setShowMapPicker] = useState(false);
    const [accuracyRadius, setAccuracyRadius] = useState(null);
    const bestAccuracyRef = useRef(Infinity);

    const uidRef = useRef(null);

    // ─── Background location helpers ───────────────────────
    const startBackgroundLocation = async () => {
        const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
        if (fgStatus !== 'granted') {
            setErrorMsg('Foreground location permission required');
            return false;
        }
        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
        if (bgStatus !== 'granted') {
            Alert.alert(
                'Background location',
                'For the best ride experience, please allow "Always" location access.'
            );
        }
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 3000,
            distanceInterval: 5,
            foregroundService: {
                notificationTitle: 'Cruise Ride is active',
                notificationBody: 'Tracking your ride in the background',
                notificationColor: '#e94560',
            },
            pausesUpdatesAutomatically: false,
            showsBackgroundLocationIndicator: true,
        });
        return true;
    };

    const stopBackgroundLocation = async () => {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
        if (isRegistered) {
            await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        }
    };

    // ─── Initial setup ─────────────────────────────────────
    useEffect(() => {
        const auth = getAuth();
        uidRef.current = auth.currentUser.uid;

        (async () => {
            const ok = await startBackgroundLocation();
            if (!ok) return;

            // Try to get a fresh position with a 10‑second timeout
            let loc;
            try {
                loc = await Promise.race([
                    Location.getCurrentPositionAsync({
                        accuracy: Location.Accuracy.High,
                    }),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Timeout')), 10000)
                    ),
                ]);
            } catch (err) {
                console.log('Current position timed out, trying last known...');
                // Fall back to last known position
                try {
                    loc = await Location.getLastKnownPositionAsync({});
                    if (!loc) throw new Error('No last known position');
                } catch (err2) {
                    // Both methods failed – show error and let user retry
                    setErrorMsg('Could not get your location. Check permissions and GPS.');
                    return;
                }
            }

            const { latitude, longitude } = loc.coords;
            setRegion({
                latitude,
                longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
            });
            setMyLocation({ latitude, longitude, heading: loc.coords.heading });

            // … rest stays exactly the same (leader check, load route) …
            // Check if current user is the Leader
            const db = getFirestore();
            const partyRef = doc(db, 'parties', partyCode);
            const partySnap = await getDoc(partyRef);
            if (partySnap.exists()) {
                const data = partySnap.data();
                if (data.leaderId === uidRef.current || data.creator === uidRef.current) {
                    setIsLeader(true);
                }
            }

            // Load existing route (if any)
            const routeSnap = await getDoc(doc(db, 'parties', partyCode, 'route', 'current'));
            if (routeSnap.exists()) {
                const data = routeSnap.data();
                if (data.polyline) {
                    const decoded = decodePolyline(data.polyline);
                    setRouteCoords(decoded.map(([lat, lng]) => ({ latitude: lat, longitude: lng })));
                }
            }
        })();

        return () => {
            stopBackgroundLocation();
        };
    }, [partyCode]);

    useEffect(() => {
        const fetchNicknames = async () => {
            const db = getFirestore();
            const nicks = {};
            for (const uid of members) {
                const userSnap = await getDoc(doc(db, 'users', uid));
                if (userSnap.exists() && userSnap.data().nickname) {
                    nicks[uid] = userSnap.data().nickname;
                }
            }
            setNicknames(nicks);
        };
        if (members.length > 0) {
            fetchNicknames();
        }
    }, [members]);

    // ─── Foreground location watcher (fixed cleanup) ──────
    useEffect(() => {
        let watcher = null;
        (async () => {
            const auth = getAuth();
            const uid = uidRef.current;
            const db = getFirestore();

            watcher = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.BestForNavigation,
                    timeInterval: 2000,
                    distanceInterval: 2,
                },
                (newLoc) => {
                    const { latitude, longitude, heading, accuracy } = newLoc.coords;
                    setMyLocation({ latitude, longitude, heading });
                    setAccuracyRadius(Math.round(accuracy));
                    if (accuracy < bestAccuracyRef.current) bestAccuracyRef.current = accuracy;
                    setDoc(doc(db, 'parties', partyCode, 'locations', uid), {
                        uid,
                        lat: latitude,
                        lng: longitude,
                        accuracy,
                        bearing: heading ?? 0,
                        updatedAt: new Date(),
                    }, { merge: true });
                }
            );
        })();

        return () => {
            if (watcher) {
                watcher.remove();
            }
        };
    }, [partyCode]);

    // ─── Other members' locations ──────────────────────────
    useEffect(() => {
        const db = getFirestore();
        const unsub = onSnapshot(collection(db, 'parties', partyCode, 'locations'), (snapshot) => {
            const locs = {};
            snapshot.forEach((doc) => {
                if (doc.id !== uidRef.current) {
                    locs[doc.id] = doc.data();
                }
            });
            setMemberLocations(locs);
        });
        return unsub;
    }, [partyCode]);

    // ─── Stops listener ────────────────────────────────────
    useEffect(() => {
        const db = getFirestore();
        const unsub = onSnapshot(collection(db, 'parties', partyCode, 'stops'), (snapshot) => {
            const loadedStops = [];
            snapshot.forEach((doc) => {
                loadedStops.push({ id: doc.id, ...doc.data() });
            });
            setStops(loadedStops);
        });
        return unsub;
    }, [partyCode]);

    // Listen to party document for member list
    useEffect(() => {
        const db = getFirestore();
        const unsub = onSnapshot(doc(db, 'parties', partyCode), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setMembers(data.members || []);
            }
        });
        return unsub;
    }, [partyCode]);

    // ─── Map long‑press logic (route waypoints or stop) ────
    const handleMapLongPress = (event) => {
        const coord = event.nativeEvent.coordinate;

        if (drawingMode) {
            setWaypoints((prev) => [...prev, coord]);
        } else if (stopMode) {
            // Open modal to name the stop
            setPendingStopCoord(coord);
            setNewStopName('');
            setStopNameModalVisible(true);
        }
    };

    // ─── Save stop to Firestore ────────────────────────────
    const saveStop = async () => {
        if (!pendingStopCoord || !newStopName.trim()) {
            Alert.alert('Name required', 'Please enter a name for the stop.');
            return;
        }

        try {
            const db = getFirestore();
            const stopRef = doc(collection(db, 'parties', partyCode, 'stops'));
            await setDoc(stopRef, {
                name: newStopName.trim(),
                latitude: pendingStopCoord.latitude,
                longitude: pendingStopCoord.longitude,
                createdBy: uidRef.current,
                createdAt: new Date(),
            });

            setStopNameModalVisible(false);
            setPendingStopCoord(null);
            setStopMode(false);
        } catch (err) {
            Alert.alert('Error', 'Could not save stop.');
        }
    };

    const handleEndParty = () => {
        Alert.alert(
            'End Party',
            'This will permanently delete the party and all data. Are you sure?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'End',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const db = getFirestore();
                            const partyRef = doc(db, 'parties', partyCode);

                            // 1. Delete all stops
                            const stopsSnap = await getDocs(collection(db, 'parties', partyCode, 'stops'));
                            const batch = writeBatch(db);
                            stopsSnap.forEach(d => batch.delete(d.ref));

                            // 2. Delete all locations
                            const locsSnap = await getDocs(collection(db, 'parties', partyCode, 'locations'));
                            locsSnap.forEach(d => batch.delete(d.ref));

                            // 3. Delete the route document
                            batch.delete(doc(db, 'parties', partyCode, 'route', 'current'));

                            // 4. Delete the party document itself
                            batch.delete(partyRef);

                            // Commit all deletions at once
                            await batch.commit();

                            // 5. Clear saved party code from device
                            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
                            await AsyncStorage.removeItem('currentPartyCode');

                            // 6. Navigate back to Home
                            navigation.navigate('Home');
                        } catch (err) {
                            console.error('End party error:', err);
                            Alert.alert('Error', 'Could not end party. Please try again.');
                        }
                    },
                },
            ]
        );
    };

    const removeMember = async (uidToRemove) => {
        if (!isLeader) return;
        try {
            const db = getFirestore();
            const partyRef = doc(db, 'parties', partyCode);
            const partySnap = await getDoc(partyRef);
            if (!partySnap.exists()) return;

            const currentMembers = partySnap.data().members;
            const newMembers = currentMembers.filter(uid => uid !== uidToRemove);
            await setDoc(partyRef, { members: newMembers }, { merge: true });

            // Also delete their location doc
            await setDoc(doc(db, 'parties', partyCode, 'locations', uidToRemove), null, { merge: true });
            Alert.alert('Removed', `Rider ${uidToRemove.slice(0, 6)}... has been removed.`);
        } catch (err) {
            Alert.alert('Error', 'Could not remove member.');
        }
    };

    // ─── Route drawing handlers ────────────────────────────
    const fetchRoute = async () => {
        if (waypoints.length < 2) {
            Alert.alert('Need at least two points', 'Drop more waypoints to draw a route.');
            return;
        }
        const coordinates = waypoints.map(wp => `${wp.longitude},${wp.latitude}`).join(';');
        const url = `https://router.project-osrm.org/route/v1/bike/${coordinates}?overview=full&geometries=polyline`;

        try {
            const response = await fetch(url);
            const data = await response.json();
            if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
                throw new Error('No route found');
            }
            const encoded = data.routes[0].geometry;
            const decoded = decodePolyline(encoded);
            const coords = decoded.map(([lat, lng]) => ({ latitude: lat, longitude: lng }));
            setRouteCoords(coords);

            const db = getFirestore();
            await setDoc(doc(db, 'parties', partyCode, 'route', 'current'), {
                polyline: encoded,
                waypoints: waypoints,
                updatedAt: new Date(),
            }, { merge: true });

            setDrawingMode(false);
            Alert.alert('Route saved!');
        } catch (err) {
            console.error(err);
            Alert.alert('Routing failed', err.message);
        }
    };

    const cancelDrawing = () => {
        setWaypoints([]);
        setDrawingMode(false);
    };

    // ─── Listen for remote route updates ──────────────────
    useEffect(() => {
        const db = getFirestore();
        const unsub = onSnapshot(doc(db, 'parties', partyCode, 'route', 'current'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.polyline) {
                    const decoded = decodePolyline(data.polyline);
                    setRouteCoords(decoded.map(([lat, lng]) => ({ latitude: lat, longitude: lng })));
                }
            } else {
                setRouteCoords([]);
            }
        });
        return unsub;
    }, [partyCode]);

    // ─── Render ────────────────────────────────────────────
    if (errorMsg) {
        return (
            <View style={styles.centered}>
                <Text style={styles.error}>{errorMsg}</Text>
                <TouchableOpacity
                    style={[styles.finishButton, { marginTop: 20 }]}
                    onPress={() => {
                        // Reset error and re‑run the setup by forcing a re‑render
                        setErrorMsg(null);
                        // We simply clear the region so the loading effect triggers again
                        setRegion(null);
                    }}
                >
                    <Text style={styles.buttonText}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (!region) {
        return (
            <View style={styles.centered}>
                <Text style={styles.loading}>Getting location...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <MapView
                style={styles.map}
                initialRegion={region}
                showsUserLocation={false}
                mapType={mapStyle}
                onLongPress={handleMapLongPress}
            >
                {/* My own marker (blue) */}
                {myLocation && (
                    <Marker
                        coordinate={{ latitude: myLocation.latitude, longitude: myLocation.longitude }}
                        title="You"
                        anchor={{ x: 0.5, y: 0.5 }}
                    >
                        <View style={styles.myDot} />
                    </Marker>
                )}

                {/* Party members (red) */}
                {Object.entries(memberLocations).map(([uid, loc]) => (
                    <Marker
                        key={uid}
                        coordinate={{ latitude: loc.lat, longitude: loc.lng }}
                        title={nicknames[uid] || uid.slice(0, 6)}
                        anchor={{ x: 0.5, y: 0.5 }}
                    >
                        <View style={styles.memberDot} />
                    </Marker>
                ))}

                {/* Route waypoints (orange) */}
                {waypoints.map((wp, index) => (
                    <Marker key={`wp-${index}`} coordinate={wp} pinColor="orange" />
                ))}

                {/* Stops (green pins) */}
                {stops.map((stop) => (
                    <Marker
                        key={stop.id}
                        coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
                        pinColor="green"
                        title={stop.name}
                        description="Tap for details"
                    />
                ))}

                {/* Route polyline */}
                {routeCoords.length > 0 && (
                    <Polyline coordinates={routeCoords} strokeWidth={5} strokeColor="#FF6B00" />
                )}
            </MapView>

            {/* Leader controls */}
            {isLeader && (
                <View style={styles.leaderControls}>
                    {!drawingMode && !stopMode && (
                        <>
                            <TouchableOpacity
                                style={styles.drawButton}
                                onPress={() => { setWaypoints([]); setDrawingMode(true); }}
                            >
                                <Text style={styles.drawButtonText}>✏️ Draw Route</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.drawButton, { marginTop: 10, backgroundColor: '#0a4a38', borderColor: '#00D4AA' }]}
                                onPress={() => setStopMode(true)}
                            >
                                <Text style={styles.drawButtonText}>📍 Add Stop</Text>
                            </TouchableOpacity>
                        </>
                    )}

                    {drawingMode && (
                        <View style={styles.drawingPanel}>
                            <Text style={styles.drawingHint}>
                                Long‑press to drop waypoints ({waypoints.length})
                            </Text>
                            <View style={styles.drawingActions}>
                                <TouchableOpacity style={styles.finishButton} onPress={fetchRoute}>
                                    <Text style={styles.buttonText}>✅ Finish</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.cancelButton} onPress={cancelDrawing}>
                                    <Text style={styles.buttonText}>❌ Cancel</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {stopMode && (
                        <View style={styles.drawingPanel}>
                            <Text style={styles.drawingHint}>Long‑press on map to place a stop</Text>
                            <TouchableOpacity
                                style={[styles.cancelButton, { marginTop: 8 }]}
                                onPress={() => setStopMode(false)}
                            >
                                <Text style={styles.buttonText}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    )}


                    {/* ─── Members button (visible to all) ─── */}

                </View>
            )}

            <TouchableOpacity
                style={[styles.drawButton, {
                    position: 'absolute',
                    top: 150,
                    right: 20,
                    backgroundColor: '#e94560',
                }]}
                onPress={() => setShowMemberList(!showMemberList)}
            >
                <Text style={styles.drawButtonText}>👥 Members</Text>
            </TouchableOpacity>
            {showMemberList && (
                <View style={[styles.memberList, { position: 'absolute', top: 190, right: 20 }]}>
                    {members.map((uid) => (
                        <View key={uid} style={styles.memberRow}>
                            <Text style={styles.memberItem}>
                                {nicknames[uid] || uid.slice(0, 8)}...
                            </Text>
                            {uid !== uidRef.current && (

                                <TouchableOpacity
                                    style={styles.removeButton}
                                    onPress={() => removeMember(uid)}
                                >
                                    <Text style={styles.buttonText}>Remove</Text>
                                </TouchableOpacity>

                            )}
                        </View>
                    ))}
                    <TouchableOpacity
                        style={[styles.finishButton, { marginTop: 8, alignSelf: 'center' }]}
                        onPress={handleEndParty}
                    >
                        <Text style={styles.buttonText}>🚫 End Party</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Modal to name a stop */}
            <Modal
                animationType="slide"
                transparent
                visible={stopNameModalVisible}
                onRequestClose={() => setStopNameModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Name this stop</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="e.g., Coffee break"
                            placeholderTextColor="#888"
                            value={newStopName}
                            onChangeText={setNewStopName}
                            autoFocus
                        />
                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={[styles.modalButton, { backgroundColor: '#888' }]}
                                onPress={() => setStopNameModalVisible(false)}
                            >
                                <Text style={styles.buttonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, { backgroundColor: '#2ecc71' }]}
                                onPress={saveStop}
                            >
                                <Text style={styles.buttonText}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Map style picker (collapsible) */}
            <View style={styles.mapPickerWrapper}>
                {showMapPicker && (
                    <View style={styles.mapPickerList}>
                        <Text style={styles.mapPickerTitle}>MAP STYLE</Text>
                        {[
                            { key: 'standard', label: 'Default' },
                            { key: 'mutedStandard', label: 'Light' },
                            { key: 'hybrid', label: 'Satellite' },
                        ].map(({ key, label }) => (
                            <TouchableOpacity
                                key={key}
                                style={styles.mapPickerRow}
                                onPress={() => { setMapStyle(key); setShowMapPicker(false); }}
                                activeOpacity={0.8}
                            >
                                <View style={styles.radioOuter}>
                                    {mapStyle === key && <View style={styles.radioInner} />}
                                </View>
                                <Text style={[styles.mapPickerRowText, mapStyle === key && styles.mapPickerRowTextActive]}>
                                    {label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
                <TouchableOpacity
                    style={styles.mapPickerTrigger}
                    onPress={() => setShowMapPicker(v => !v)}
                    activeOpacity={0.85}
                >
                    <Text style={styles.mapPickerTriggerText}>
                        🗺️  {{ standard: 'Default', mutedStandard: 'Light', hybrid: 'Satellite' }[mapStyle]}  {showMapPicker ? '▲' : '▼'}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Party info badge */}
            <View style={styles.badgeBox}>
                <Text style={styles.badgeText}>Party: {partyCode}</Text>
                <Text style={styles.memberCount}>
                    {Object.keys(memberLocations).length + 1} riders
                </Text>
                {accuracyRadius && (
                    <Text style={styles.accuracyText}>GPS ±{accuracyRadius}m</Text>
                )}
            </View>
        </View>
    );
}

// ─── Styles ──────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1 },
    map: { flex: 1 },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0d0d0f',
    },
    error: { color: '#FF3B5C', fontSize: 16, padding: 20 },
    loading: { color: '#F0F0F2', fontSize: 18 },
    myDot: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#FF6B00',
        borderWidth: 3,
        borderColor: '#fff',
        shadowColor: '#FF6B00',
        shadowOpacity: 0.7,
        shadowRadius: 4,
        elevation: 4,
    },
    memberDot: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#00D4AA',
        borderWidth: 3,
        borderColor: '#fff',
        shadowColor: '#00D4AA',
        shadowOpacity: 0.7,
        shadowRadius: 4,
        elevation: 4,
    },
    leaderControls: {
        position: 'absolute',
        top: 50,
        right: 20,
        alignItems: 'flex-end',
    },
    drawButton: {
        backgroundColor: 'rgba(13,13,15,0.88)',
        borderWidth: 1,
        borderColor: 'rgba(255,107,0,0.40)',
        paddingHorizontal: 18,
        paddingVertical: 11,
        borderRadius: 50,
    },
    drawButtonText: {
        color: '#F0F0F2',
        fontWeight: '700',
        fontSize: 13,
    },
    drawingPanel: {
        backgroundColor: 'rgba(13,13,15,0.92)',
        borderWidth: 1,
        borderColor: 'rgba(255,107,0,0.25)',
        padding: 15,
        borderRadius: 16,
        maxWidth: 250,
    },
    drawingHint: {
        color: '#9B9BA8',
        marginBottom: 10,
        fontSize: 13,
    },
    drawingActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    finishButton: {
        backgroundColor: '#00D4AA',
        paddingHorizontal: 18,
        paddingVertical: 9,
        borderRadius: 50,
        marginRight: 8,
    },
    cancelButton: {
        backgroundColor: 'rgba(255,59,92,0.85)',
        paddingHorizontal: 18,
        paddingVertical: 9,
        borderRadius: 50,
    },
    buttonText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 13,
    },
    badgeBox: {
        position: 'absolute',
        bottom: 24,
        alignSelf: 'center',
        backgroundColor: 'rgba(13,13,15,0.85)',
        borderWidth: 1,
        borderColor: 'rgba(255,107,0,0.30)',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 50,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    badgeText: { color: '#9B9BA8', fontSize: 13, fontWeight: '600' },
    memberCount: { color: '#FF6B00', fontSize: 13, fontWeight: '800' },
    accuracyText: { color: '#00D4AA', fontSize: 11, fontWeight: '700' },
    callout: {
        minWidth: 120,
        padding: 8,
    },
    calloutTitle: {
        fontWeight: 'bold',
        fontSize: 16,
        color: '#000',           // ensure visible on white callout bubble
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: '#16213e',
        borderRadius: 12,
        padding: 20,
        width: '80%',
    },
    modalTitle: {
        fontSize: 18,
        color: '#fff',
        marginBottom: 12,
        textAlign: 'center',
    },
    modalInput: {
        backgroundColor: '#0f3460',
        color: '#fff',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginBottom: 16,
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    modalButton: {
        paddingVertical: 8,
        paddingHorizontal: 24,
        borderRadius: 8,
    },
    memberList: {
        backgroundColor: 'rgba(13,13,15,0.92)',
        borderWidth: 1,
        borderColor: 'rgba(255,107,0,0.20)',
        borderRadius: 16,
        padding: 12,
        marginTop: 8,
        maxWidth: 220,
    },
    memberRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    memberItem: {
        color: '#F0F0F2',
        fontSize: 14,
        fontWeight: '600',
        flex: 1,
    },
    removeButton: {
        backgroundColor: 'rgba(255,59,92,0.75)',
        borderRadius: 50,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginLeft: 8,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.65)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: '#141416',
        borderWidth: 1,
        borderColor: 'rgba(255,107,0,0.25)',
        borderRadius: 20,
        padding: 24,
        width: '82%',
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#F0F0F2',
        marginBottom: 14,
        textAlign: 'center',
    },
    modalInput: {
        backgroundColor: '#1c1c1f',
        borderWidth: 1,
        borderColor: 'rgba(255,107,0,0.30)',
        color: '#F0F0F2',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginBottom: 18,
        fontSize: 15,
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    modalButton: {
        paddingVertical: 10,
        paddingHorizontal: 28,
        borderRadius: 50,
    },
    // Map style picker
    mapPickerWrapper: {
        position: 'absolute',
        bottom: 80,
        right: 20,
        alignItems: 'flex-end',
        zIndex: 999,
    },
    mapPickerTrigger: {
        backgroundColor: 'rgba(13,13,15,0.92)',
        borderWidth: 1,
        borderColor: 'rgba(255,107,0,0.40)',
        borderRadius: 50,
        paddingHorizontal: 16,
        paddingVertical: 9,
    },
    mapPickerTriggerText: {
        color: '#F0F0F2',
        fontSize: 13,
        fontWeight: '700',
    },
    mapPickerList: {
        backgroundColor: 'rgba(13,13,15,0.95)',
        borderWidth: 1,
        borderColor: 'rgba(255,107,0,0.30)',
        borderRadius: 14,
        paddingVertical: 8,
        paddingHorizontal: 14,
        marginBottom: 8,
        minWidth: 150,
    },
    mapPickerTitle: {
        color: '#FF6B00',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 4,
        marginBottom: 8,
        marginTop: 2,
    },
    mapPickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        gap: 10,
    },
    radioOuter: {
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 2,
        borderColor: '#FF6B00',
        justifyContent: 'center',
        alignItems: 'center',
    },
    radioInner: {
        width: 9,
        height: 9,
        borderRadius: 5,
        backgroundColor: '#FF6B00',
    },
    mapPickerRowText: {
        color: '#9B9BA8',
        fontSize: 14,
        fontWeight: '600',
    },
    mapPickerRowTextActive: {
        color: '#F0F0F2',
        fontWeight: '800',
    },
});