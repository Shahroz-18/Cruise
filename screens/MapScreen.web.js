import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  TextInput,
  Modal,
} from 'react-native';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Circle,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  onSnapshot,
  getDoc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// ─── Leaflet default icon fix ──────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// ─── Map tile styles ──────────────────────────────────────
const MAP_STYLES = {
  default: {
    label: 'Default',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  dark: {
    label: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
  light: {
    label: 'Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
};

// ─── Dynamic tile layer ───────────────────────────────────
const DynamicTileLayer = ({ styleKey }) => {
  const s = MAP_STYLES[styleKey] || MAP_STYLES.default;
  return <TileLayer url={s.url} attribution={s.attribution} maxZoom={20} />;
};

// ─── Custom coloured dots for members ─────────────────────
const blueDot = new L.DivIcon({
  className: '',
  html: '<div style="width:18px;height:18px;background:#FF6B00;border-radius:50%;border:3px solid #fff;box-shadow:0 0 8px rgba(255,107,0,0.7);"></div>',
});
const redDot = new L.DivIcon({
  className: '',
  html: '<div style="width:18px;height:18px;background:#00D4AA;border-radius:50%;border:3px solid #fff;box-shadow:0 0 8px rgba(0,212,170,0.7);"></div>',
});

// ─── Stop marker icon ─────────────────────────────────────
const stopIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// ─── Polyline decoder ──────────────────────────────────────
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

// ─── Helper to get current location ────────────────────────
function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

// ─── MapEvents Handler (auto-pan + recenter) ───────────────
const MapEventsHandler = ({ myPosition, onRecenterRef, onMapRef }) => {
  const map = useMap();
  const hasInitiallyCentered = useRef(false);

  const recenter = useCallback(() => {
    if (myPosition) {
      map.flyTo([myPosition.lat, myPosition.lng], 18);
    }
  }, [map, myPosition]);

  useEffect(() => {
    if (onRecenterRef) onRecenterRef.current = recenter;
  }, [recenter, onRecenterRef]);

  useEffect(() => {
    if (onMapRef) onMapRef(map);
  }, [map, onMapRef]);

  useEffect(() => {
    if (myPosition && !hasInitiallyCentered.current) {
      map.flyTo([myPosition.lat, myPosition.lng], 18);
      hasInitiallyCentered.current = true;
    }
  }, [myPosition, map]);

  return null;
};

// ─── Follow Handler for Cruise Mode ────────────────────────
const FollowHandler = ({ myPosition, followMode, onFollowChange, flyingRef }) => {
  const map = useMap();
  const isUserInteracting = useRef(false);
  const followRef = useRef(followMode);

  useEffect(() => {
    followRef.current = followMode;
  }, [followMode]);

  useEffect(() => {
    if (followMode && myPosition && !flyingRef.current) {
      map.panTo([myPosition.lat, myPosition.lng], { animate: true });
    }
  }, [myPosition, followMode, map, flyingRef]);

  useEffect(() => {
    const onDragStart = () => { isUserInteracting.current = true; };
    const onZoomStart = () => { isUserInteracting.current = true; };
    const onMoveEnd = () => {
      if (isUserInteracting.current) {
        if (followRef.current) onFollowChange(false);
        isUserInteracting.current = false;
      }
    };
    map.on('dragstart', onDragStart);
    map.on('zoomstart', onZoomStart);
    map.on('moveend', onMoveEnd);
    return () => {
      map.off('dragstart', onDragStart);
      map.off('zoomstart', onZoomStart);
      map.off('moveend', onMoveEnd);
    };
  }, [map, onFollowChange]);

  return null;
};

// ─── Main Component ────────────────────────────────────────
export default function MapScreenWeb({ route, navigation }) {
  const { partyCode } = route.params;

  // Core states
  const [center] = useState([19.0760, 72.8777]); // Mumbai
  const [myPosition, setMyPosition] = useState(null);
  const [memberLocations, setMemberLocations] = useState({});
  const [stops, setStops] = useState([]);
  const [routeCoords, setRouteCoords] = useState([]);
  const [members, setMembers] = useState([]);
  const [nicknames, setNicknames] = useState({});
  const [isLeader, setIsLeader] = useState(false);

  // Drawing / stop modes
  const [drawingMode, setDrawingMode] = useState(false);
  const [waypoints, setWaypoints] = useState([]);
  const [stopMode, setStopMode] = useState(false);
  const [showStopModal, setShowStopModal] = useState(false);
  const [pendingStopCoord, setPendingStopCoord] = useState(null);
  const [stopName, setStopName] = useState('');
  const [showMemberList, setShowMemberList] = useState(false);
  const [mapStyle, setMapStyle] = useState('default');
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [accuracyRadius, setAccuracyRadius] = useState(null);
  const bestAccuracyRef = useRef(Infinity);

  // Cruise Mode & Follow Mode
  const [cruiseMode, setCruiseMode] = useState(false);
  const [followMode, setFollowMode] = useState(true);
  const flyingRef = useRef(false);

  const uidRef = useRef(null);
  const recenterRef = useRef(null);
  const mapRef = useRef(null);

  const handleMapRef = useCallback((m) => { mapRef.current = m; }, []);

  // Enter/Exit Cruise Mode
  const enterCruiseMode = () => {
    setCruiseMode(true);
    setFollowMode(true);
    if (mapRef.current && myPosition) {
      mapRef.current.flyTo([myPosition.lat, myPosition.lng], 18);
    }
  };

  const exitCruiseMode = () => {
    setCruiseMode(false);
    setFollowMode(false);
  };

  // ─── Initial auth & location setup ──────────────────────
  useEffect(() => {
    const auth = getAuth();
    uidRef.current = auth.currentUser.uid;
    const db = getFirestore();

    getDoc(doc(db, 'parties', partyCode)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.leaderId === uidRef.current || data.creator === uidRef.current) {
          setIsLeader(true);
        }
      }
    });

    getCurrentLocation()
      .then((pos) => setMyPosition(pos))
      .catch(() =>
        Alert.alert('Location access denied', 'Please enable GPS in browser settings.')
      );

    let watchId;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, heading, accuracy } = pos.coords;
          setAccuracyRadius(Math.round(accuracy));
          if (accuracy < bestAccuracyRef.current) bestAccuracyRef.current = accuracy;

          const newPos = { lat: latitude, lng: longitude };
          setMyPosition(newPos);
          const db = getFirestore();
          setDoc(
            doc(db, 'parties', partyCode, 'locations', uidRef.current),
            { uid: uidRef.current, lat: latitude, lng: longitude, accuracy, bearing: heading ?? 0, updatedAt: new Date() },
            { merge: true }
          );
        },
        (err) => console.warn('Watch error:', err),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [partyCode]);

  // ─── Firestore listeners ────────────────────────────────
  useEffect(() => {
    const db = getFirestore();
    return onSnapshot(doc(db, 'parties', partyCode), (docSnap) => {
      if (docSnap.exists()) setMembers(docSnap.data().members || []);
    });
  }, [partyCode]);

  useEffect(() => {
    const db = getFirestore();
    return onSnapshot(collection(db, 'parties', partyCode, 'locations'), (snapshot) => {
      const locs = {};
      snapshot.forEach((d) => { if (d.id !== uidRef.current) locs[d.id] = d.data(); });
      setMemberLocations(locs);
    });
  }, [partyCode]);

  useEffect(() => {
    const db = getFirestore();
    return onSnapshot(collection(db, 'parties', partyCode, 'stops'), (snapshot) => {
      const loaded = [];
      snapshot.forEach((d) => loaded.push({ id: d.id, ...d.data() }));
      setStops(loaded);
    });
  }, [partyCode]);

  useEffect(() => {
    const db = getFirestore();
    return onSnapshot(doc(db, 'parties', partyCode, 'route', 'current'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.polyline) {
          const decoded = decodePolyline(data.polyline);
          setRouteCoords(decoded.map(([lat, lng]) => ({ latitude: lat, longitude: lng })));
        }
      } else setRouteCoords([]);
    });
  }, [partyCode]);

  useEffect(() => {
    if (members.length === 0) return;
    const db = getFirestore();
    const fetchNicks = async () => {
      const nicks = {};
      for (const uid of members) {
        const snap = await getDoc(doc(db, 'users', uid));
        if (snap.exists() && snap.data().nickname) nicks[uid] = snap.data().nickname;
      }
      setNicknames(nicks);
    };
    fetchNicks();
  }, [members]);

  // ─── Map click handler ──────────────────────────────────
  const MapClickHandler = () => {
    useMapEvents({
      click(e) {
        if (drawingMode) {
          setWaypoints((prev) => [...prev, e.latlng]);
        } else if (stopMode) {
          setPendingStopCoord(e.latlng);
          setStopName('');
          setShowStopModal(true);
        }
      },
    });
    return null;
  };

  // ─── Route drawing logic ────────────────────────────────
  const fetchRoute = async () => {
    if (waypoints.length < 2) {
      Alert.alert('Need at least two points', 'Drop more waypoints to draw a route.');
      return;
    }
    const coordinates = waypoints.map((wp) => `${wp.lng},${wp.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/bike/${coordinates}?overview=full&geometries=polyline`;

    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) throw new Error('No route found');
      const encoded = data.routes[0].geometry;
      const decoded = decodePolyline(encoded);
      const coords = decoded.map(([lat, lng]) => ({ latitude: lat, longitude: lng }));
      setRouteCoords(coords);

      const db = getFirestore();
      await setDoc(doc(db, 'parties', partyCode, 'route', 'current'), {
        polyline: encoded,
        waypoints: waypoints.map((wp) => ({ latitude: wp.lat, longitude: wp.lng })),
        updatedAt: new Date(),
      }, { merge: true });
      setDrawingMode(false);
      Alert.alert('Route saved!');
    } catch (err) {
      console.error(err);
      Alert.alert('Routing failed', err.message);
    }
  };

  // ─── Stop saving ─────────────────────────────────────────
  const saveStop = async () => {
    if (!pendingStopCoord || !stopName.trim()) {
      Alert.alert('Name required', 'Please enter a name for the stop.');
      return;
    }
    try {
      const db = getFirestore();
      const stopRef = doc(collection(db, 'parties', partyCode, 'stops'));
      await setDoc(stopRef, {
        name: stopName.trim(),
        latitude: pendingStopCoord.lat,
        longitude: pendingStopCoord.lng,
        createdBy: uidRef.current,
        createdAt: new Date(),
      });
      setShowStopModal(false);
      setPendingStopCoord(null);
      setStopMode(false);
    } catch (err) {
      Alert.alert('Error', 'Could not save stop.');
    }
  };

  // ─── Member management ──────────────────────────────────
  const removeMember = async (uidToRemove) => {
    if (!isLeader) return;
    try {
      const db = getFirestore();
      const partyRef = doc(db, 'parties', partyCode);
      const snap = await getDoc(partyRef);
      if (!snap.exists()) return;
      const current = snap.data().members;
      const updated = current.filter((uid) => uid !== uidToRemove);
      await setDoc(partyRef, { members: updated }, { merge: true });
      await setDoc(doc(db, 'parties', partyCode, 'locations', uidToRemove), null, { merge: true });
      Alert.alert('Removed', 'Rider removed.');
    } catch (err) {
      Alert.alert('Error', 'Could not remove member.');
    }
  };

  const handleEndParty = () => {
    Alert.alert('End Party', 'This will permanently delete the party and all data.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End',
        style: 'destructive',
        onPress: async () => {
          try {
            const db = getFirestore();
            const partyRef = doc(db, 'parties', partyCode);
            const batch = writeBatch(db);
            const stopsSnap = await getDocs(collection(db, 'parties', partyCode, 'stops'));
            stopsSnap.forEach((d) => batch.delete(d.ref));
            const locsSnap = await getDocs(collection(db, 'parties', partyCode, 'locations'));
            locsSnap.forEach((d) => batch.delete(d.ref));
            batch.delete(doc(db, 'parties', partyCode, 'route', 'current'));
            batch.delete(partyRef);
            await batch.commit();
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            await AsyncStorage.removeItem('currentPartyCode');
            navigation.navigate('Home');
          } catch (err) {
            Alert.alert('Error', 'Could not end party.');
          }
        },
      },
    ]);
  };

  // ─── Render ─────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <MapContainer center={center} zoom={15} style={{ height: '100%', width: '100%' }}>
        <DynamicTileLayer styleKey={mapStyle} />
        <MapEventsHandler myPosition={myPosition} onRecenterRef={recenterRef} onMapRef={handleMapRef} />
        {cruiseMode && <FollowHandler myPosition={myPosition} followMode={followMode} onFollowChange={setFollowMode} flyingRef={flyingRef} />}
        <MapClickHandler />

        {/* My location dot + accuracy ring */}
        {myPosition && (
          <>
            <Marker position={[myPosition.lat, myPosition.lng]} icon={blueDot}>
              <Popup>You{accuracyRadius ? ` (±${accuracyRadius}m)` : ''}</Popup>
            </Marker>
            {accuracyRadius && accuracyRadius > 5 && (
              <Circle center={[myPosition.lat, myPosition.lng]} radius={accuracyRadius}
                pathOptions={{ color: '#FF6B00', fillColor: '#FF6B00', fillOpacity: 0.07, weight: 1.5, dashArray: '4 4' }} />
            )}
          </>
        )}

        {/* Party members */}
        {Object.entries(memberLocations).map(([uid, loc]) => (
          <Marker key={uid} position={[loc.lat, loc.lng]} icon={redDot}>
            <Popup>{nicknames[uid] || uid.slice(0, 6)}</Popup>
          </Marker>
        ))}

        {/* Waypoints */}
        {waypoints.map((wp, i) => (
          <Marker key={`wp-${i}`} position={[wp.lat, wp.lng]} />
        ))}

        {/* Route polyline */}
        {routeCoords.length > 0 && (
          <Polyline positions={routeCoords.map((c) => [c.latitude, c.longitude])} color="#FF6B00" weight={5} opacity={0.9} />
        )}

        {/* Stops */}
        {stops.map((stop) => (
          <Marker key={stop.id} position={[stop.latitude, stop.longitude]} icon={stopIcon}>
            <Popup>{stop.name}</Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* ─── Leader controls (hidden in Cruise Mode) ──────── */}
      {isLeader && !cruiseMode && (
        <View style={styles.leaderControls}>
          {!drawingMode && !stopMode && (
            <>
              <TouchableOpacity style={styles.drawButton} onPress={() => { setWaypoints([]); setDrawingMode(true); }}>
                <Text style={styles.drawButtonText}>✏️  Draw Route</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.drawButton, { marginTop: 10, backgroundColor: '#0a4a38', borderColor: '#00D4AA' }]} onPress={() => setStopMode(true)}>
                <Text style={styles.drawButtonText}>📍  Add Stop</Text>
              </TouchableOpacity>
            </>
          )}

          {drawingMode && (
            <View style={styles.drawingPanel}>
              <Text style={styles.drawingHint}>Tap map to drop waypoints ({waypoints.length})</Text>
              <View style={styles.drawingActions}>
                <TouchableOpacity style={styles.finishButton} onPress={fetchRoute}><Text style={styles.buttonText}>✅ Finish</Text></TouchableOpacity>
                <TouchableOpacity style={styles.cancelButton} onPress={() => { setWaypoints([]); setDrawingMode(false); }}><Text style={styles.buttonText}>✕ Cancel</Text></TouchableOpacity>
              </View>
            </View>
          )}

          {stopMode && (
            <View style={styles.drawingPanel}>
              <Text style={styles.drawingHint}>Tap the map to place a stop</Text>
              <TouchableOpacity style={[styles.cancelButton, { marginTop: 8 }]} onPress={() => setStopMode(false)}><Text style={styles.buttonText}>✕ Cancel</Text></TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* ─── Cruise Mode buttons (visible to ALL) ─────────── */}
      {!cruiseMode ? (
        <TouchableOpacity style={[styles.drawButton, { position: 'absolute', top: 140, left: 20, backgroundColor: '#1a1a2e', borderColor: 'rgba(160,160,200,0.5)', zIndex: 1000 }]} onPress={enterCruiseMode}>
          <Text style={styles.drawButtonText}>🚴  Cruise Mode</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={[styles.drawButton, { position: 'absolute', top: 30, left: 20, backgroundColor: 'rgba(255,59,92,0.85)', borderColor: 'rgba(255,59,92,0.6)', zIndex: 1000 }]} onPress={exitCruiseMode}>
          <Text style={styles.drawButtonText}>✕  Exit Cruise</Text>
        </TouchableOpacity>
      )}

      {/* ─── Members button ───────────────── */}
      <TouchableOpacity style={[styles.drawButton, { position: 'absolute', top: 80, left: 20, zIndex: 1000 }]} onPress={() => setShowMemberList(!showMemberList)}>
        <Text style={styles.drawButtonText}>👥  Members</Text>
      </TouchableOpacity>

      {/* ─── Recenter button ───────────────── */}
      <TouchableOpacity style={[styles.drawButton, { position: 'absolute', bottom: 100, right: 20, backgroundColor: 'rgba(255,107,0,0.90)', borderColor: 'rgba(255,107,0,0.5)', zIndex: 1000, paddingHorizontal: 16, paddingVertical: 14 }]} onPress={() => {
        if (mapRef.current && myPosition) {
          flyingRef.current = true;
          if (cruiseMode) setFollowMode(false);
          mapRef.current.flyTo([myPosition.lat, myPosition.lng], 18, { duration: 1.5 });
          setTimeout(() => { flyingRef.current = false; if (cruiseMode) setFollowMode(true); }, 1600);
        }
      }}>
        <Text style={[styles.drawButtonText, { fontSize: 18 }]}>📍</Text>
      </TouchableOpacity>

      {/* ─── Member list panel ────────────── */}
      {showMemberList && (
        <View style={styles.memberList}>
          {members.map((uid) => (
            <View key={uid} style={styles.memberRow}>
              <Text style={styles.memberItem}>{nicknames[uid] || uid.slice(0, 8)}...</Text>
              {isLeader && uid !== uidRef.current && (
                <TouchableOpacity style={styles.removeButton} onPress={() => removeMember(uid)}><Text style={styles.buttonText}>Remove</Text></TouchableOpacity>
              )}
            </View>
          ))}
          {isLeader && (
            <TouchableOpacity style={[styles.cancelButton, { marginTop: 10, alignSelf: 'center' }]} onPress={handleEndParty}>
              <Text style={styles.buttonText}>🚫  End Party</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ─── Stop naming modal ────────────── */}
      <Modal animationType="slide" transparent visible={showStopModal} onRequestClose={() => setShowStopModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Name this stop</Text>
            <TextInput style={styles.modalInput} placeholder="e.g., Coffee break" placeholderTextColor="#888" value={stopName} onChangeText={setStopName} autoFocus />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: '#888' }]} onPress={() => setShowStopModal(false)}><Text style={styles.buttonText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: '#2ecc71' }]} onPress={saveStop}><Text style={styles.buttonText}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Map style picker ─────────────── */}
      <View style={styles.mapPickerWrapper}>
        {showMapPicker && (
          <View style={styles.mapPickerList}>
            <Text style={styles.mapPickerTitle}>MAP STYLE</Text>
            {Object.keys(MAP_STYLES).map((key) => (
              <TouchableOpacity key={key} style={styles.mapPickerRow} onPress={() => { setMapStyle(key); setShowMapPicker(false); }} activeOpacity={0.8}>
                <View style={styles.radioOuter}>{mapStyle === key && <View style={styles.radioInner} />}</View>
                <Text style={[styles.mapPickerRowText, mapStyle === key && styles.mapPickerRowTextActive]}>{MAP_STYLES[key].label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <TouchableOpacity style={styles.mapPickerTrigger} onPress={() => setShowMapPicker((v) => !v)} activeOpacity={0.85}>
          <Text style={styles.mapPickerTriggerText}>🗺️  {MAP_STYLES[mapStyle].label}  {showMapPicker ? '▲' : '▼'}</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Bottom badge ─────────────────── */}
      <View style={styles.badgeBox}>
        <Text style={styles.badgeText}>Party: {partyCode}</Text>
        <Text style={styles.memberCount}>{Object.keys(memberLocations).length + 1} riders</Text>
        {accuracyRadius && <Text style={styles.accuracyText}>GPS ±{accuracyRadius}m</Text>}
      </View>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  leaderControls: { position: 'absolute', top: 50, right: 20, alignItems: 'flex-end', zIndex: 1000 },
  drawButton: { backgroundColor: 'rgba(13,13,15,0.82)', borderWidth: 1, borderColor: 'rgba(255,107,0,0.35)', paddingHorizontal: 18, paddingVertical: 11, borderRadius: 50 },
  drawButtonText: { color: '#F0F0F2', fontWeight: '700', fontSize: 13, letterSpacing: 0.3 },
  drawingPanel: { backgroundColor: 'rgba(13,13,15,0.88)', borderWidth: 1, borderColor: 'rgba(255,107,0,0.25)', padding: 16, borderRadius: 16, maxWidth: 260 },
  drawingHint: { color: '#9B9BA8', marginBottom: 12, fontSize: 13, lineHeight: 18 },
  drawingActions: { flexDirection: 'row', justifyContent: 'space-between' },
  finishButton: { backgroundColor: '#00D4AA', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 50, marginRight: 8 },
  cancelButton: { backgroundColor: 'rgba(255,59,92,0.85)', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 50 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  memberList: { position: 'absolute', top: 138, left: 20, backgroundColor: 'rgba(13,13,15,0.90)', borderWidth: 1, borderColor: 'rgba(255,107,0,0.20)', borderRadius: 16, padding: 12, minWidth: 200, maxWidth: 240, zIndex: 1000 },
  memberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  memberItem: { color: '#F0F0F2', fontSize: 14, fontWeight: '600', flex: 1 },
  removeButton: { backgroundColor: 'rgba(255,59,92,0.75)', borderRadius: 50, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8 },
  badgeBox: { position: 'absolute', bottom: 20, alignSelf: 'center', backgroundColor: 'rgba(13,13,15,0.85)', borderWidth: 1, borderColor: 'rgba(255,107,0,0.30)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 50, flexDirection: 'row', alignItems: 'center', gap: 14 },
  badgeText: { color: '#9B9BA8', fontSize: 13, fontWeight: '600' },
  memberCount: { color: '#FF6B00', fontSize: 13, fontWeight: '800' },
  accuracyText: { color: '#00D4AA', fontSize: 11, fontWeight: '700' },
  mapPickerWrapper: { position: 'absolute', bottom: 60, right: 20, alignItems: 'flex-end', zIndex: 1001 },
  mapPickerTrigger: { backgroundColor: 'rgba(13,13,15,0.92)', borderWidth: 1, borderColor: 'rgba(255,107,0,0.40)', borderRadius: 50, paddingHorizontal: 16, paddingVertical: 9 },
  mapPickerTriggerText: { color: '#F0F0F2', fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  mapPickerList: { backgroundColor: 'rgba(13,13,15,0.95)', borderWidth: 1, borderColor: 'rgba(255,107,0,0.30)', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 14, marginBottom: 8, minWidth: 150 },
  mapPickerTitle: { color: '#FF6B00', fontSize: 10, fontWeight: '800', letterSpacing: 4, marginBottom: 8, marginTop: 2 },
  mapPickerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  radioOuter: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#FF6B00', justifyContent: 'center', alignItems: 'center' },
  radioInner: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#FF6B00' },
  mapPickerRowText: { color: '#9B9BA8', fontSize: 14, fontWeight: '600' },
  mapPickerRowTextActive: { color: '#F0F0F2', fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#141416', borderWidth: 1, borderColor: 'rgba(255,107,0,0.25)', borderRadius: 20, padding: 24, width: '82%' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#F0F0F2', marginBottom: 14, textAlign: 'center', letterSpacing: 0.5 },
  modalInput: { backgroundColor: '#1c1c1f', borderWidth: 1, borderColor: 'rgba(255,107,0,0.30)', color: '#F0F0F2', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 18, fontSize: 15 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-around' },
  modalButton: { paddingVertical: 10, paddingHorizontal: 28, borderRadius: 50 },
});