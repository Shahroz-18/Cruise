import React, { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { getFirestore, doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export default function JoinPartyScreen({ navigation }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 5) {
      Alert.alert('Invalid code', 'Party code must be exactly 5 characters.');
      return;
    }

    setLoading(true);
    try {
      const db = getFirestore();
      const auth = getAuth();
      const uid = auth.currentUser.uid;
      const partyRef = doc(db, 'parties', trimmed);
      const partySnap = await getDoc(partyRef);

      if (!partySnap.exists()) {
        Alert.alert('Not found', 'No party exists with that code.');
        setLoading(false);
        return;
      }

      const partyData = partySnap.data();
      if (partyData.members.includes(uid)) {
        Alert.alert('Already joined', 'You are already a member of this party.');
        setLoading(false);
        navigation.navigate('Party', { partyCode: trimmed });
        return;
      }

      await updateDoc(partyRef, {
        members: arrayUnion(uid),
      });

      await AsyncStorage.setItem('currentPartyCode', trimmed);

      Alert.alert('Joined!', `You are now a member of party ${trimmed}.`);
      navigation.navigate('Party', { partyCode: trimmed });
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const isReady = code.trim().length === 5;

  return (
    <View style={styles.container}>
      {/* ── Decorative accent bar ── */}
      <View style={styles.accentBar} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.label}>PARTY CODE</Text>
        <Text style={styles.title}>Join a Ride</Text>
        <Text style={styles.hint}>Enter the 5-character code from your crew leader</Text>
      </View>

      {/* ── Code input ── */}
      <View style={styles.inputWrapper}>
        <TextInput
          style={[styles.input, isReady && styles.inputReady]}
          placeholder="A B C D E"
          placeholderTextColor="#3a3a3f"
          value={code}
          onChangeText={setCode}
          maxLength={5}
          autoCapitalize="characters"
          autoFocus
        />
        {/* character count pip */}
        <View style={styles.charPips}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[styles.pip, i < code.length && styles.pipFilled]}
            />
          ))}
        </View>
      </View>

      {/* ── Join button ── */}
      <TouchableOpacity
        style={[
          styles.button,
          (!isReady || loading) && styles.buttonDisabled,
        ]}
        onPress={handleJoin}
        disabled={!isReady || loading}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Joining...' : 'Join Party →'}
        </Text>
      </TouchableOpacity>

      {/* ── Back link ── */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        activeOpacity={0.7}
      >
        <Text style={styles.backText}>← Back to Home</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0d0d0f',
    paddingHorizontal: 32,
  },

  /* ── Top accent ── */
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#FF6B00',
  },

  /* ── Header ── */
  header: {
    alignItems: 'center',
    marginBottom: 44,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF6B00',
    letterSpacing: 5,
    marginBottom: 10,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
    marginBottom: 10,
  },
  hint: {
    fontSize: 14,
    color: '#9B9BA8',
    textAlign: 'center',
    lineHeight: 20,
  },

  /* ── Input ── */
  inputWrapper: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 36,
  },
  input: {
    backgroundColor: '#141416',
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 14,
    width: '100%',
    paddingVertical: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#2a2a30',
    marginBottom: 16,
  },
  inputReady: {
    borderColor: '#FF6B00',
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  charPips: {
    flexDirection: 'row',
    gap: 8,
  },
  pip: {
    width: 28,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2a2a30',
  },
  pipFilled: {
    backgroundColor: '#FF6B00',
  },

  /* ── Button ── */
  button: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 50,
    backgroundColor: '#FF6B00',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  buttonDisabled: {
    backgroundColor: '#2a2a30',
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1,
  },

  /* ── Back ── */
  backButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  backText: {
    color: '#9B9BA8',
    fontSize: 15,
    fontWeight: '600',
  },
});