import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ProfileScreen({ navigation }) {
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      const db = getFirestore();
      const uid = getAuth().currentUser.uid;
      const userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);
      if (snap.exists() && snap.data().nickname) {
        setNickname(snap.data().nickname);
      }
      setLoading(false);
    };
    fetchProfile();
  }, []);

  const handleSave = async () => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Please enter a nickname.');
      return;
    }
    try {
      const db = getFirestore();
      const uid = getAuth().currentUser.uid;
      await setDoc(doc(db, 'users', uid), { nickname: trimmed }, { merge: true });
      Alert.alert('Saved', 'Your nickname has been updated.');
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', 'Could not save nickname.');
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Name</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter nickname"
        placeholderTextColor="#888"
        value={nickname}
        onChangeText={setNickname}
        maxLength={20}
      />
      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.buttonText}>Save</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  centered: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    color: '#e94560',
    marginBottom: 30,
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: '#16213e',
    color: '#fff',
    fontSize: 20,
    textAlign: 'center',
    width: '80%',
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  saveButton: {
    backgroundColor: '#2ecc71',
    paddingVertical: 14,
    paddingHorizontal: 50,
    borderRadius: 30,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  loading: {
    color: '#fff',
    fontSize: 16,
  },
});